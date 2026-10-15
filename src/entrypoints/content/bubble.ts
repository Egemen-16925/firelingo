import type { MeaningResult, SentenceResult } from "@/shared/messages";
import type { Term, TermStatus } from "@/shared/types";
import type { WordFound } from "@/terms/terms";
import css from "./bubble.css?inline";
import { request } from "./request";
import { pageSource, readPick, wordsIn, type Pick } from "./selection";

// Seçim baloncuğu. Her sayfaya yüklenen betikte durduğu için React kullanılmaz; düz DOM ile çizilir.

const STATUSES: { value: TermStatus; label: string }[] = [
  { value: "unknown", label: "Bilmiyorum" },
  { value: "learning", label: "Az biliyorum" },
  { value: "known", label: "Biliyorum" },
];
const WIDTH = 300;
const GAP = 8;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Hata metni ve ayar gerektiren hatalarda ayarlar sayfasına götüren bağlantı. */
function errorLine(): { node: HTMLElement; show(text: string): void } {
  const node = el("p", "error");
  const settings = button("link", "Ayarları aç", () => void browser.runtime.sendMessage({ type: "options:open" }));
  return {
    node,
    show(text) {
      node.replaceChildren(text, ...(/ayar/i.test(text) ? [" ", settings] : []));
    },
  };
}

interface TermOptions {
  /** Açılınca anlamı kendiliğinden sor (seçimde evet; işaretli kelimenin üzerine gelince hayır). */
  auto: boolean;
  back?: () => void;
}

/** Tek kelime ya da kısa öbek: anlam, üç durum, yeniden çevirme, listeden silme. */
function showTerm(box: HTMLElement, surface: string, sentence: string, { auto, back }: TermOptions): void {
  let found: WordFound | undefined;
  let ai: MeaningResult | undefined;
  let translating = false;
  let saving = false;

  const lemma = el("span", "lemma");
  const meaning = el("p", "meaning");
  const explanation = el("p", "note");
  const error = errorLine();
  const cache = el("span", "label");
  const retranslate = button("link", "", () => void askMeaning(shownMeaning() !== ""));
  const remove = button("link", "Listeden sil", () => void save(removeTerm));
  const statuses = STATUSES.map((s) => ({ ...s, node: button(s.value, s.label, () => void save(() => mark(s.value))) }));

  const head = el("div", "head");
  head.append(el("span", "word", surface), lemma);
  const statusRow = el("div", "statuses");
  statusRow.append(...statuses.map((s) => s.node));
  const actions = el("div", "actions");
  actions.append(retranslate, cache, el("span", "spacer"), remove);
  box.replaceChildren(...(back ? [button("link", "← Cümle", back)] : []), head, meaning, explanation, error.node, statusRow, actions);

  const currentLemma = () => ai?.meaning.lemma ?? found?.existing?.lemma ?? found?.localLemma ?? surface;
  const shownMeaning = () => ai?.meaning.anlam ?? found?.existing?.meaning ?? "";

  function refresh() {
    const existing = found?.existing;
    const shownLemma = currentLemma();
    lemma.textContent = shownLemma.toLowerCase() === surface.toLowerCase() ? "" : shownLemma;
    meaning.textContent = shownMeaning() || (translating ? "Çevriliyor…" : "");
    explanation.textContent = ai?.meaning.aciklama ?? existing?.explanation ?? "";
    cache.textContent = ai?.fromCache && !translating ? "önbellekten" : "";
    retranslate.textContent = translating ? "Çevriliyor…" : shownMeaning() ? "Yeniden çevir" : "Çevir";
    retranslate.disabled = translating;
    remove.hidden = !existing;
    remove.disabled = saving;
    for (const s of statuses) {
      s.node.setAttribute("aria-pressed", String(existing?.status === s.value));
      s.node.disabled = saving || !found;
    }
  }

  async function askMeaning(force: boolean) {
    translating = true;
    error.show("");
    refresh();
    try {
      ai = await request<MeaningResult>({ type: "word:meaning", word: surface, sentence, force });
      // Çeviri gelmeden işaretlendiyse anlam kayda sonradan eklenir.
      const existing = found?.existing;
      if (existing && (force || !existing.meaning)) await mark(existing.status);
    } catch (e) {
      error.show(message(e));
    }
    translating = false;
    refresh();
  }

  async function save(action: () => Promise<void>) {
    saving = true;
    error.show("");
    refresh();
    try {
      await action();
    } catch (e) {
      error.show(message(e));
    }
    saving = false;
    refresh();
  }

  async function mark(status: TermStatus) {
    const existing = await request<Term>({
      type: "term:mark",
      input: {
        termKey: found?.existing?.key,
        surface,
        lemma: currentLemma(),
        status,
        meaning: ai?.meaning.anlam,
        explanation: ai?.meaning.aciklama,
        occurrence: { sentence, ...pageSource() },
      },
    });
    found = { localLemma: found?.localLemma ?? surface, existing };
  }

  async function removeTerm() {
    const key = found?.existing?.key;
    if (!key) return;
    await request<void>({ type: "term:delete", key });
    found = { localLemma: found?.localLemma ?? surface };
  }

  refresh();
  void (async () => {
    try {
      found = await request<WordFound>({ type: "word:find", surface });
    } catch (e) {
      error.show(message(e));
    }
    refresh();
    if (auto) await askMeaning(false);
  })();
}

interface SentenceState {
  text: string;
  result?: SentenceResult;
}

/** Uzun seçim: cümle çevirisi ve altında tek tek işaretlenebilen kelimeler. */
function showSentence(box: HTMLElement, state: SentenceState): void {
  const translation = el("p", "meaning");
  const note = el("p", "note");
  const error = errorLine();
  const cache = el("span", "label");
  const retranslate = button("link", "", () => void ask(true));

  const chips = el("div", "chips");
  const unique = [...new Map(wordsIn(state.text).map((w) => [w.toLowerCase(), w])).values()];
  chips.append(
    ...unique.map((word) =>
      button("", word, () => showTerm(box, word, state.text, { auto: true, back: () => showSentence(box, state) })),
    ),
  );

  const actions = el("div", "actions");
  actions.append(retranslate, cache);
  box.replaceChildren(translation, note, error.node, actions, el("span", "label", "Kelimeler"), chips);

  function refresh(busy = false) {
    translation.textContent = state.result?.sentence.translation ?? (busy ? "Çevriliyor…" : "");
    note.textContent = state.result?.sentence.grammarNote ?? "";
    cache.textContent = state.result?.fromCache && !busy ? "kayıttan" : "";
    retranslate.textContent = busy ? "Çevriliyor…" : state.result ? "Yeniden çevir" : "Çevir";
    retranslate.disabled = busy;
  }

  async function ask(force: boolean) {
    error.show("");
    refresh(true);
    try {
      state.result = await request<SentenceResult>({ type: "sentence:translate", text: state.text, force });
    } catch (e) {
      error.show(message(e));
    }
    refresh();
  }

  refresh();
  if (!state.result) void ask(false);
}

/** selection: metin seçilerek açıldı. hover: işaretli kelimenin üzerine gelinerek açıldı (kendiliğinden kapanır). */
export type BubbleMode = "selection" | "hover";

export interface Bubble {
  open(pick: Pick, mode: BubbleMode): void;
  close(): void;
  mode(): BubbleMode | undefined;
  /** Olay baloncuğun içinde mi gerçekleşti. */
  contains(event: Event): boolean;
  /** Dinleyicileri ve baloncuğu kaldırır (eklenti kapatılınca). */
  stop(): void;
}

/**
 * Seçimi dinler ve baloncuğu yönetir. `onClose`: baloncuk kapanınca çağrılır.
 * `selection: false`: metin seçimini dinlemez (çerçevelerde baloncuk yalnızca kalemle açılır).
 */
export function startBubble(onClose?: () => void, { selection = true } = {}): Bubble {
  let host: HTMLElement | undefined;
  let mode: BubbleMode | undefined;

  const close = () => {
    if (!host) return;
    host.remove();
    host = undefined;
    mode = undefined;
    onClose?.();
  };

  function open(pick: Pick, openMode: BubbleMode) {
    close();
    mode = openMode;
    host = document.createElement("firelingo-bubble");
    host.style.cssText = "all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = css;
    const box = el("div", "bubble");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Firelingo");

    // Seçimin hemen altına, görünür alanın dışına taşmadan.
    const viewport = document.documentElement.clientWidth;
    const maxLeft = window.scrollX + viewport - Math.min(WIDTH, viewport - 2 * GAP) - GAP;
    box.style.left = `${Math.max(window.scrollX + GAP, Math.min(window.scrollX + pick.rect.left, maxLeft))}px`;
    box.style.top = `${window.scrollY + pick.rect.bottom + GAP}px`;

    root.append(style, box);
    document.documentElement.append(host);
    if (pick.kind === "term") showTerm(box, pick.text, pick.sentence, { auto: openMode === "selection" });
    else showSentence(box, { text: pick.text });
  }

  const contains = (event: Event) => host !== undefined && event.composedPath().includes(host);

  const onMouseUp = (event: MouseEvent) => {
    if (contains(event)) return;
    // Seçim, tıklama işlendikten sonra kesinleşir.
    setTimeout(() => {
      const pick = readPick();
      if (pick) open(pick, "selection");
    });
  };
  const onMouseDown = (event: MouseEvent) => {
    if (!contains(event)) close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  if (selection) document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);

  return {
    open,
    close,
    mode: () => mode,
    contains,
    stop() {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      close();
    },
  };
}
