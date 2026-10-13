import { DEFAULT_PEN_SETTINGS, getPenSettings, PEN_COLORS, setPenSettings, type PenColor, type PenSettings } from "@/storage/penSettings";
import type { Bubble } from "./bubble";
import css from "./pen.css?inline";
import { pickFromRange } from "./selection";

// Geçici fosforlu kalem (DuoPDF'teki gibi): kalemle metnin üstünden serbestçe çizilir, iz bir süre
// sonra solar ve hiçbir şey kaydedilmez. Bırakınca izin geçtiği metin için baloncuk açılır
// (kısa parça kelime, uzun parça cümle çevirisi). Sayfada sürüklenebilen küçük bir panelle yönetilir.

// Yazı yazılan alanlarda kalem hiç devreye girmez.
const EDITABLE = "input,select,textarea,[contenteditable=''],[contenteditable='true']";
// Bağlantı ve düğmelerin üstünden de çizilebilir: sürükleme iz bırakır, yerinde tıklama normal çalışır.
const CLICKABLE = "a[href],button,label,summary,[role='button']";
/** Bu kadar pikselden az oynayan basış tıklama sayılır. */
const CLICK_SLOP = 6;
const WORD_CHAR = /[A-Za-z'’-]/;
const SVG_NS = "http://www.w3.org/2000/svg";
const EDGE = 8;
const PEN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h5l10-10-5-5L4 15v5z"/><path d="M13 6l5 5"/></svg>';

interface Caret {
  node: Text;
  offset: number;
}

/** Sayfa koordinatı (kaydırma dahil); iz sayfayla birlikte kayar. */
interface Point {
  x: number;
  y: number;
}

interface Stroke {
  el: SVGPathElement;
  timer?: ReturnType<typeof setTimeout>;
  fading: boolean;
}

export interface Pen {
  /** Kalem panelini (ve çizimi) açar ya da kapatır. */
  set(on: boolean): void;
  active(): boolean;
  /** Ayarlar değişince yeniden okur. */
  reload(): void;
  stop(): void;
}

function caretAt(x: number, y: number): Caret | undefined {
  const caret = document.caretPositionFromPoint(x, y);
  return caret?.offsetNode.nodeType === Node.TEXT_NODE ? { node: caret.offsetNode as Text, offset: caret.offset } : undefined;
}

/** İmlecin bitiştiği harfin ekrandaki kutusu. */
function charBox({ node, offset }: Caret): DOMRect | undefined {
  if (node.length === 0) return undefined;
  const i = Math.min(Math.max(offset, 0), node.length - 1);
  const range = document.createRange();
  range.setStart(node, i);
  range.setEnd(node, i + 1);
  const box = range.getBoundingClientRect();
  return box.width > 0 || box.height > 0 ? box : undefined;
}

/**
 * İzin geçtiği metin: iz üzerindeki noktalardan yazının üstüne (ya da hemen altına/üstüne)
 * gelenlerin belge sırasındaki ilki ile sonuncusu arası, kelime sınırlarına genişletilmiş olarak.
 */
function textUnder(points: Point[]): Range | undefined {
  const hits: Caret[] = [];
  let last: Point | undefined;
  for (const point of points) {
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 4) continue;
    last = point;
    const x = point.x - window.scrollX;
    const y = point.y - window.scrollY;
    const caret = caretAt(x, y);
    const box = caret && charBox(caret);
    if (!caret || !box) continue;
    // İmleç en yakın yazıya "yapışır" (boş zeminde bile); nokta o harfin üstünde ya da çok yakınında mı?
    const padX = Math.max(4, box.width);
    const padY = Math.max(6, box.height * 0.6);
    if (x < box.left - padX || x > box.right + padX || y < box.top - padY || y > box.bottom + padY) continue;
    hits.push(caret);
  }
  if (hits.length === 0) return undefined;

  // Belge sırasına göre en baştaki ve en sondaki konum (sağdan sola çizim de olur).
  const probe = document.createRange();
  const before = (a: Caret, b: Caret) => {
    probe.setStart(a.node, a.offset);
    probe.collapse(true);
    return probe.comparePoint(b.node, b.offset) > 0;
  };
  let first = hits[0]!;
  let final = hits[0]!;
  for (const hit of hits) {
    if (before(hit, first)) first = hit;
    if (before(final, hit)) final = hit;
  }

  let from = first.offset;
  let to = final.offset;
  while (from > 0 && WORD_CHAR.test(first.node.data[from - 1]!)) from--;
  while (to < final.node.length && WORD_CHAR.test(final.node.data[to]!)) to++;
  const range = document.createRange();
  range.setStart(first.node, from);
  range.setEnd(final.node, to);
  return range.collapsed ? undefined : range;
}

export function startPen(bubble: Bubble, onChange: (on: boolean) => void): Pen {
  let settings: PenSettings = DEFAULT_PEN_SETTINGS;
  let ui: { host: HTMLElement; ink: SVGSVGElement; toolbar: HTMLElement; draw: HTMLButtonElement; swatches: HTMLButtonElement[] } | undefined;
  // Panel açıkken çizim duraklatılabilir (metin seçmek ya da sayfayı normal kullanmak için).
  let drawing = true;
  let strokes: Stroke[] = [];
  let current: { stroke: Stroke; points: Point[]; clickable: boolean; moved: boolean } | undefined;
  let frame = 0;

  const color = () => PEN_COLORS[settings.color].value;

  function place(x: number, y: number) {
    if (!ui) return;
    const { width, height } = ui.toolbar.getBoundingClientRect();
    ui.toolbar.style.left = `${Math.max(EDGE, Math.min(x, window.innerWidth - width - EDGE))}px`;
    ui.toolbar.style.top = `${Math.max(EDGE, Math.min(y, window.innerHeight - height - EDGE))}px`;
  }

  function refresh() {
    if (!ui) return;
    ui.toolbar.style.setProperty("--pen", color());
    ui.draw.setAttribute("aria-pressed", String(drawing));
    ui.draw.title = drawing ? "Çizimi duraklat" : "Çizime devam et";
    for (const swatch of ui.swatches) swatch.setAttribute("aria-checked", String(swatch.dataset.color === settings.color));
    // Kayıtlı konum yoksa sağ alt köşe.
    place(settings.position?.x ?? window.innerWidth, settings.position?.y ?? window.innerHeight - 72);
  }

  const reload = () =>
    void getPenSettings().then((next) => {
      settings = next;
      refresh();
    });
  reload();

  function save(patch: Partial<PenSettings>) {
    settings = { ...settings, ...patch };
    refresh();
    void setPenSettings(settings);
  }

  function remove(stroke: Stroke) {
    clearTimeout(stroke.timer);
    stroke.el.remove();
    strokes = strokes.filter((s) => s !== stroke);
  }

  function fade(stroke: Stroke) {
    if (stroke.fading) return;
    stroke.fading = true;
    clearTimeout(stroke.timer);
    stroke.el.style.opacity = "0";
    stroke.timer = setTimeout(() => remove(stroke), settings.fadeSeconds * 1000);
  }

  function paint() {
    if (!current) return;
    const [first, ...rest] = current.points;
    // Tek nokta da görünsün diye çok kısa bir çizgi.
    const tail = rest.length ? rest.map((p) => `L${p.x} ${p.y}`).join("") : `L${first!.x + 0.1} ${first!.y}`;
    current.stroke.el.setAttribute("d", `M${first!.x} ${first!.y}${tail}`);
  }

  const outside = (event: Event) =>
    ui !== undefined && drawing && !event.composedPath().includes(ui.host) && !bubble.contains(event) && !(event.target as Element | null)?.closest?.(EDITABLE);

  const onDown = (event: PointerEvent) => {
    if (!ui || event.button !== 0 || !event.isPrimary || !outside(event)) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    bubble.close();

    // Yeni iz başlayınca öncekiler solmaya başlar; sınır aşılırsa en eskisi hemen kalkar.
    for (const stroke of strokes) fade(stroke);
    while (strokes.length >= settings.maxStrokes) remove(strokes[0]!);

    const el = document.createElementNS(SVG_NS, "path");
    el.setAttribute("stroke", color());
    el.style.transitionDuration = `${settings.fadeSeconds}s`;
    ui.ink.append(el);
    const stroke: Stroke = { el, fading: false };
    strokes.push(stroke);
    const clickable = Boolean((event.target as Element | null)?.closest?.(CLICKABLE));
    current = { stroke, points: [{ x: event.pageX, y: event.pageY }], clickable, moved: false };
    paint();
  };

  const onMove = (event: PointerEvent) => {
    if (!current) return;
    for (const e of event.getCoalescedEvents?.() ?? [event]) current.points.push({ x: e.pageX, y: e.pageY });
    const first = current.points[0]!;
    current.moved ||= Math.hypot(event.pageX - first.x, event.pageY - first.y) > CLICK_SLOP;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      paint();
    });
  };

  const onUp = () => {
    if (!current) return;
    paint();
    const { stroke, points, clickable, moved } = current;
    current = undefined;
    if (clickable) {
      // Bağlantıya yerinde tıklandıysa iz bırakma, tıklama işlesin; sürüklendiyse tıklamayı yut.
      if (!moved) return remove(stroke);
      const swallow = (click: Event) => {
        click.preventDefault();
        click.stopImmediatePropagation();
      };
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, true), 50);
    }
    stroke.timer = setTimeout(() => fade(stroke), settings.delaySeconds * 1000);
    const range = textUnder(points);
    const pick = range && pickFromRange(range);
    if (pick) bubble.open(pick, "selection");
  };

  // Çizim açıkken sürüklemek metin seçmesin, bağlantı ya da resim sürüklemesi başlatmasın.
  const noSelect = (event: Event) => {
    if (outside(event)) event.preventDefault();
  };

  function button(className: string, title: string, html: string, onClick: () => void): HTMLButtonElement {
    const node = document.createElement("button");
    node.type = "button";
    node.className = className;
    node.title = title;
    node.setAttribute("aria-label", title);
    node.innerHTML = html;
    node.addEventListener("click", onClick);
    return node;
  }

  function buildToolbar(): Pick<NonNullable<typeof ui>, "toolbar" | "draw" | "swatches"> {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Firelingo fosforlu kalem");

    const grip = button("grip", "Taşımak için sürükle", "⠿", () => undefined);
    grip.addEventListener("pointerdown", (down) => {
      down.preventDefault();
      grip.setPointerCapture(down.pointerId);
      const box = toolbar.getBoundingClientRect();
      const dx = down.clientX - box.left;
      const dy = down.clientY - box.top;
      const move = (event: PointerEvent) => place(event.clientX - dx, event.clientY - dy);
      const up = () => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
        const { left, top } = toolbar.getBoundingClientRect();
        save({ position: { x: left, y: top } });
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });

    const draw = button("draw", "", PEN_ICON, () => {
      drawing = !drawing;
      refresh();
    });
    const swatches = (Object.keys(PEN_COLORS) as PenColor[]).map((name) => {
      const swatch = button("swatch", PEN_COLORS[name].label, "", () => {
        // Çizim duraklatılmışken renge dokunmak kaleme geri döndürür.
        drawing = true;
        save({ color: name });
      });
      swatch.setAttribute("role", "radio");
      swatch.dataset.color = name;
      swatch.style.backgroundColor = PEN_COLORS[name].value;
      return swatch;
    });
    const divider = () => Object.assign(document.createElement("span"), { className: "divider" });
    const close = button("close", "Kalemi kapat", "×", () => set(false));

    toolbar.append(grip, draw, divider(), ...swatches, divider(), close);
    return { toolbar, draw, swatches };
  }

  function turnOn() {
    const host = document.createElement("firelingo-pen");
    host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; z-index: 2147483646; pointer-events: none;";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = css;
    const ink = document.createElementNS(SVG_NS, "svg");
    ink.setAttribute("class", "ink");
    const parts = buildToolbar();
    root.append(style, ink, parts.toolbar);
    document.documentElement.append(host);
    ui = { host, ink, ...parts };
    drawing = true;
    refresh();

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.addEventListener("mousedown", noSelect, true);
    document.addEventListener("selectstart", noSelect, true);
    document.addEventListener("dragstart", noSelect, true);
  }

  function turnOff() {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("pointermove", onMove, true);
    document.removeEventListener("pointerup", onUp, true);
    document.removeEventListener("pointercancel", onUp, true);
    document.removeEventListener("mousedown", noSelect, true);
    document.removeEventListener("selectstart", noSelect, true);
    document.removeEventListener("dragstart", noSelect, true);
    cancelAnimationFrame(frame);
    frame = 0;
    for (const stroke of strokes) clearTimeout(stroke.timer);
    strokes = [];
    current = undefined;
    ui?.host.remove();
    ui = undefined;
  }

  function set(on: boolean) {
    if (on === (ui !== undefined)) return;
    if (on) turnOn();
    else turnOff();
    onChange(on);
  }

  return { set, active: () => ui !== undefined, reload, stop: turnOff };
}
