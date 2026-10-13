import type { WordMeaning } from "@/ai/schemas";
import type { MeaningResult, Result, SentenceResult, TermMessage } from "@/shared/messages";
import type { Term, TermStatus } from "@/shared/types";
import type { WordFound } from "@/terms/terms";
import css from "./bubble.css?inline";
import { readPick, wordsIn, type Pick } from "./selection";

// Seçim baloncuğu. Her sayfaya yüklenen betikte durduğu için React kullanılmaz; düz DOM ile çizilir.

const STATUSES: { value: TermStatus; label: string }[] = [
  { value: "unknown", label: "Bilmiyorum" },
  { value: "learning", label: "Az biliyorum" },
  { value: "known", label: "Biliyorum" },
];
const WIDTH = 300;
const GAP = 8;

async function request<T>(message: TermMessage): Promise<T> {
  const result: Result<T> = await browser.runtime.sendMessage(message);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

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

interface SentenceState {
  text: string;
  result?: SentenceResult;
}

/** Tek kelime ya da kısa öbek: çeviri düğmesi, üç durum, listeden silme. */
function showTerm(box: HTMLElement, surface: string, sentence: string, back?: () => void): void {
  let found: WordFound | undefined;
  let ai: WordMeaning | undefined;
  let busy = false;

  const lemma = el("span", "lemma");
  const meaning = el("p", "meaning");
  const explanation = el("p", "note");
  const error = el("p", "error");
  const translate = button("primary", "Çevir", () => void run(askMeaning));
  const remove = button("link", "Listeden sil", () => void run(removeTerm));
  const statuses = STATUSES.map((s) => {
    const node = button(s.value, s.label, () => void run(() => mark(s.value)));
    return { ...s, node };
  });

  const head = el("div", "head");
  head.append(el("span", "word", surface), lemma);
  const statusRow = el("div", "statuses");
  statusRow.append(...statuses.map((s) => s.node));
  const actions = el("div", "actions");
  actions.append(translate, el("span", "spacer"), remove);
  box.replaceChildren(...(back ? [button("link", "← Cümle", back)] : []), head, meaning, explanation, error, statusRow, actions);

  const currentLemma = () => ai?.lemma ?? found?.existing?.lemma ?? found?.localLemma ?? surface;

  function refresh() {
    const existing = found?.existing;
    const shownLemma = currentLemma();
    lemma.textContent = shownLemma.toLowerCase() === surface.toLowerCase() ? "" : shownLemma;
    meaning.textContent = ai?.anlam ?? existing?.meaning ?? "";
    explanation.textContent = ai?.aciklama ?? existing?.explanation ?? "";
    translate.textContent = busy ? "…" : ai ? "Yeniden çevir" : "Çevir";
    translate.disabled = busy;
    remove.hidden = !existing;
    remove.disabled = busy;
    for (const s of statuses) {
      s.node.setAttribute("aria-pressed", String(existing?.status === s.value));
      s.node.disabled = busy || !found;
    }
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error.textContent = "";
    refresh();
    try {
      await action();
    } catch (e) {
      error.textContent = message(e);
    }
    busy = false;
    refresh();
  }

  async function askMeaning() {
    ai = (await request<MeaningResult>({ type: "word:meaning", word: surface, sentence, force: ai !== undefined })).meaning;
  }

  async function mark(status: TermStatus) {
    const existing = await request<Term>({
      type: "term:mark",
      input: {
        termKey: found?.existing?.key,
        surface,
        lemma: currentLemma(),
        status,
        meaning: ai?.anlam,
        explanation: ai?.aciklama,
        occurrence: { sentence, url: location.origin + location.pathname + location.search, title: document.title },
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
  void run(async () => {
    found = await request<WordFound>({ type: "word:find", surface });
  });
}

/** Uzun seçim: cümle çevirisi ve altında tek tek işaretlenebilen kelimeler. */
function showSentence(box: HTMLElement, state: SentenceState): void {
  const translation = el("p", "meaning");
  const note = el("p", "note");
  const error = el("p", "error");
  const translate = button("primary", "", () => void ask(state.result !== undefined));

  const chips = el("div", "chips");
  const unique = [...new Map(wordsIn(state.text).map((w) => [w.toLowerCase(), w])).values()];
  chips.append(...unique.map((word) => button("", word, () => showTerm(box, word, state.text, () => showSentence(box, state)))));

  const actions = el("div", "actions");
  actions.append(translate);
  box.replaceChildren(translation, note, error, actions, el("span", "label", "Kelimeler"), chips);

  function refresh(busy = false) {
    translation.textContent = state.result?.sentence.translation ?? "";
    note.textContent = state.result?.sentence.grammarNote ?? "";
    translate.textContent = busy ? "…" : state.result ? "Yeniden çevir" : "Cümleyi çevir";
    translate.disabled = busy;
  }

  async function ask(force: boolean) {
    error.textContent = "";
    refresh(true);
    try {
      state.result = await request<SentenceResult>({ type: "sentence:translate", text: state.text, force });
    } catch (e) {
      error.textContent = message(e);
    }
    refresh();
  }

  refresh();
}

/** Seçimi dinler ve baloncuğu yönetir. Dönen fonksiyon her şeyi kaldırır (eklenti kapatılınca). */
export function startBubble(): () => void {
  let host: HTMLElement | undefined;

  const close = () => {
    host?.remove();
    host = undefined;
  };

  function open(pick: Pick) {
    close();
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
    if (pick.kind === "term") showTerm(box, pick.text, pick.sentence);
    else showSentence(box, { text: pick.text });
  }

  const inside = (event: Event) => host !== undefined && event.composedPath().includes(host);

  const onMouseUp = (event: MouseEvent) => {
    if (inside(event)) return;
    // Seçim, tıklama işlendikten sonra kesinleşir.
    setTimeout(() => {
      const pick = readPick();
      if (pick) open(pick);
    });
  };
  const onMouseDown = (event: MouseEvent) => {
    if (!inside(event)) close();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };

  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    document.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    close();
  };
}
