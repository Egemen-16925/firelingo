import type { TermStatus } from "@/shared/types";
import { getMarkSettings, highlightName } from "@/storage/markSettings";
import type { PageMatch } from "@/terms/terms";
import type { Bubble } from "./bubble";
import { request } from "./request";
import { contextOf, wordsIn } from "./selection";

// Listedeki kelimeleri sayfada renklendirir. Eşleştirme background'da yapılır (kök bulucu oradadır);
// burada yalnızca metin toplanır ve dönen konumlar CSS Custom Highlight API ile vurgulanır.

const SKIP = "script,style,noscript,textarea,select,svg,[contenteditable=''],[contenteditable='true']";
const MAX_CHARS = 400_000;
const RESCAN_MS = 800;
/** Sürekli değişen sayfalarda (canlı saat, akış) iki tarama arasında en az bu kadar beklenir. */
const MIN_RESCAN_GAP_MS = 5000;
const DWELL_MS = 350;
const LEAVE_MS = 400;

interface Mark {
  range: Range;
  key: string;
}

export interface Marks {
  /** Sayfayı yeniden tarar (kelime listesi ya da işaret ayarları değişince). */
  scan(): void;
  /** Bu sayfada geçen, listedeki farklı kelime sayısı (her durumdan). */
  count(): number;
  stop(): void;
}

function collectTextNodes(): Text[] {
  const nodes: Text[] = [];
  let chars = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      /[A-Za-z]{2}/.test((node as Text).data) && !node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });
  while (walker.nextNode() && chars < MAX_CHARS) {
    const node = walker.currentNode as Text;
    nodes.push(node);
    chars += node.data.length;
  }
  return nodes;
}

export function startMarks(bubble: Bubble): Marks {
  // Eski tarayıcılarda vurgulama yoktur; baloncuk yine çalışır.
  if (!("highlights" in CSS)) return { scan() {}, count: () => 0, stop() {} };

  let marks = new Map<Node, Mark[]>();
  let names: string[] = [];
  let count = 0;
  let version = 0;

  const clear = () => {
    for (const name of names) CSS.highlights.delete(name);
    names = [];
  };

  let lastScan = 0;

  async function scan() {
    lastScan = Date.now();
    const current = ++version;
    const nodes = collectTextNodes();
    let matches: PageMatch[][];
    try {
      matches = await request<PageMatch[][]>({ type: "page:match", texts: nodes.map((n) => n.data) });
    } catch {
      return;
    }
    const settings = await getMarkSettings();
    if (current !== version) return;

    const next = new Map<Node, Mark[]>();
    const ranges: Record<TermStatus, Range[]> = { unknown: [], learning: [], known: [] };
    const keys = new Set<string>();
    nodes.forEach((node, i) => {
      for (const match of matches[i] ?? []) {
        keys.add(match.key);
        // Ayarlarda kapatılan durumlar renklenmez. Metin bu arada değiştiyse konum geçersizdir.
        if (!settings.show[match.status] || match.end > node.data.length) continue;
        const range = document.createRange();
        range.setStart(node, match.start);
        range.setEnd(node, match.end);
        ranges[match.status].push(range);
        next.set(node, [...(next.get(node) ?? []), { range, key: match.key }]);
      }
    });
    marks = next;
    count = keys.size;
    clear();
    for (const status of Object.keys(ranges) as TermStatus[]) {
      if (ranges[status].length === 0) continue;
      const name = highlightName(status, settings.opacity);
      CSS.highlights.set(name, new Highlight(...ranges[status]));
      names.push(name);
    }
  }

  // Sonradan yüklenen içerik (haber siteleri, tek sayfalı uygulamalar) için yeniden tarama: yalnızca
  // sayfaya yazı eklendiyse ve en çok 5 saniyede bir (sürekli değişen sayfalar işlemciyi yormasın).
  let rescan: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver((records) => {
    if (rescan !== undefined) return;
    const addedText = records.some((record) => [...record.addedNodes].some((node) => /[A-Za-z]{2}/.test(node.textContent ?? "")));
    if (!addedText) return;
    const wait = Math.max(RESCAN_MS, lastScan + MIN_RESCAN_GAP_MS - Date.now());
    rescan = setTimeout(() => {
      rescan = undefined;
      void scan();
    }, wait);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function markAt(x: number, y: number): Mark | undefined {
    const caret = document.caretPositionFromPoint(x, y);
    const candidates = caret && marks.get(caret.offsetNode);
    // İmleç konumu satır sonundaki boşlukta da en yakın harfi verir; kutuyla doğrulanır.
    return candidates?.find((mark) =>
      [...mark.range.getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom),
    );
  }

  // İşaretli kelimenin üzerinde kısa süre durunca baloncuk açılır; uzaklaşınca kapanır.
  let hovered: Mark | undefined;
  let dwell: ReturnType<typeof setTimeout> | undefined;
  let leave: ReturnType<typeof setTimeout> | undefined;
  const cancelLeave = () => {
    clearTimeout(leave);
    leave = undefined;
  };

  const onMouseMove = (event: MouseEvent) => {
    if (event.buttons !== 0 || marks.size === 0) return;
    if (bubble.contains(event)) return cancelLeave();

    const mark = markAt(event.clientX, event.clientY);
    // Baloncuk kapandıktan sonra imleç aynı kelimede kalırsa yeniden açılabilsin.
    const reopen = mark !== undefined && mark === hovered && bubble.mode() === undefined && dwell === undefined;
    if (mark !== hovered || reopen) {
      hovered = mark;
      clearTimeout(dwell);
      dwell = undefined;
      if (mark && bubble.mode() !== "selection") {
        dwell = setTimeout(() => {
          dwell = undefined;
          const text = wordsIn(mark.range.toString()).join(" ");
          const sentence = contextOf(mark.range).sentence;
          bubble.open({ kind: "term", text, sentence, rect: mark.range.getBoundingClientRect() }, "hover");
        }, DWELL_MS);
      }
    }
    if (mark) cancelLeave();
    else if (bubble.mode() === "hover" && leave === undefined) {
      leave = setTimeout(() => {
        leave = undefined;
        if (bubble.mode() === "hover") bubble.close();
      }, LEAVE_MS);
    }
  };
  document.addEventListener("mousemove", onMouseMove, { passive: true });

  void scan();
  return {
    scan: () => void scan(),
    count: () => count,
    stop() {
      version++;
      observer.disconnect();
      clearTimeout(rescan);
      clearTimeout(dwell);
      cancelLeave();
      document.removeEventListener("mousemove", onMouseMove);
      clear();
      marks = new Map();
    },
  };
}
