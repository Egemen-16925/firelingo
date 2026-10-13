import { bestLocalLemma, buildMatcher, mergePatterns, patternFor, termKey, tokenize, type Matcher } from "duo-terms";
import { browser } from "wxt/browser";
import type { Occurrence, Term, TermStatus } from "@/shared/types";

// Kelime verisi storage.local'da, kayıt başına bir anahtarla durur:
//   term:<anahtar>  → Term          occ:<anahtar>  → Occurrence[]
//   tomb:term:<anahtar> → silinme zamanı (eşitlemede silinenin geri gelmesini önler)
// Bu modül duo-terms'i (≈1,7 MB) içerir; yalnızca background'da kullanılır.
export const TERM_PREFIX = "term:";
const OCCURRENCE_PREFIX = "occ:";
export const TOMBSTONE_PREFIX = "tomb:";

export interface MarkInput {
  /** Varsa güncellenecek terimin anahtarı (seçilen kelime zaten işaretliyse). */
  termKey?: string;
  /** Sayfada görünen hâli: "ran", "carried out". */
  surface: string;
  /** Kök hâli (modelden ya da yerel kök bulucudan): "run", "carry out". */
  lemma: string;
  status: TermStatus;
  meaning?: string;
  explanation?: string;
  occurrence?: Omit<Occurrence, "createdAt">;
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

async function read<T>(key: string): Promise<T | undefined> {
  return (await browser.storage.local.get(key))[key] as T | undefined;
}

// Yazmalar sırayla uygulanır: her biri güncel kaydı okur, değiştirir, yazar.
let queue: Promise<unknown> = Promise.resolve();
let matcher: Promise<{ matcher: Matcher<string>; size: number }> | undefined;

function write<T>(change: () => Promise<T>): Promise<T> {
  const run = queue.then(change);
  queue = run.catch(() => undefined);
  matcher = undefined;
  return run;
}

/** Terimi oluşturur ya da günceller; varsa geçtiği yeri de kaydeder (aynı cümle iki kez yazılmaz). */
export function markTerm(input: MarkInput, now = Date.now()): Promise<Term> {
  return write(async () => {
    const key = termKey(input.lemma);
    const pattern = patternFor(words(input.surface), words(input.lemma));
    const existing =
      (input.termKey ? await read<Term>(TERM_PREFIX + input.termKey) : undefined) ?? (await read<Term>(TERM_PREFIX + key));

    let term: Term;
    if (existing) {
      term = {
        ...existing,
        status: input.status,
        pattern: mergePatterns(existing.pattern, pattern),
        meaning: input.meaning?.trim() || existing.meaning,
        explanation: input.explanation?.trim() || existing.explanation,
        updatedAt: now,
      };
    } else {
      term = {
        key,
        lemma: input.lemma.trim(),
        surface: input.surface.trim(),
        pattern,
        status: input.status,
        meaning: input.meaning?.trim() ?? "",
        explanation: input.explanation?.trim() ?? "",
        note: "",
        createdAt: now,
        updatedAt: now,
        // DuoPDF'in yeni terim varsayılanı (newReview).
        review: { intervalDays: 0, dueAt: now, streak: 0 },
      };
      // Daha önce silinmiş bir kelime yeniden işaretlendiyse silme izi kalkar.
      await browser.storage.local.remove(`${TOMBSTONE_PREFIX}term:${key}`);
    }

    const items: Record<string, unknown> = { [TERM_PREFIX + term.key]: term };
    const occurrence = input.occurrence;
    if (occurrence?.sentence.trim()) {
      const list = (await read<Occurrence[]>(OCCURRENCE_PREFIX + term.key)) ?? [];
      const duplicate = list.some((o) => o.sentence === occurrence.sentence && o.url === occurrence.url);
      if (!duplicate) items[OCCURRENCE_PREFIX + term.key] = [...list, { ...occurrence, createdAt: now }];
    }
    await browser.storage.local.set(items);
    return term;
  });
}

/** Terimi ve geçişlerini siler; eşitleme için silme izi bırakır. */
export function deleteTerm(key: string, now = Date.now()): Promise<void> {
  return write(async () => {
    if (!(await read<Term>(TERM_PREFIX + key))) return;
    await browser.storage.local.remove([TERM_PREFIX + key, OCCURRENCE_PREFIX + key]);
    await browser.storage.local.set({ [`${TOMBSTONE_PREFIX}term:${key}`]: now });
  });
}

export async function listTerms(): Promise<Term[]> {
  const all = await browser.storage.local.get(null);
  return Object.keys(all)
    .filter((key) => key.startsWith(TERM_PREFIX))
    .map((key) => all[key] as Term);
}

export async function occurrencesOf(key: string): Promise<Occurrence[]> {
  return (await read<Occurrence[]>(OCCURRENCE_PREFIX + key)) ?? [];
}

function getMatcher(): Promise<{ matcher: Matcher<string>; size: number }> {
  return (matcher ??= listTerms().then((terms) => ({
    matcher: buildMatcher(terms.map((t) => ({ id: t.key, status: t.status, pattern: t.pattern }))),
    size: terms.length,
  })));
}

export interface WordFound {
  /** Seçilen kelime/öbek zaten listedeyse kaydı ("ran" seçilince "run" bulunur). */
  existing?: Term;
  /** Yapay zekâ yanıt vermezse kullanılacak yerel kök. */
  localLemma: string;
}

/** Seçilen kelimeyi listede arar; yapay zekâ çağırmaz. */
export async function findWord(surface: string): Promise<WordFound> {
  await queue;
  const tokens = tokenize(surface);
  const hit = (await getMatcher()).matcher.findExact(tokens);
  return {
    existing: hit && (await read<Term>(TERM_PREFIX + hit.id)),
    localLemma: tokens.map((t) => bestLocalLemma(t.word)).join(" "),
  };
}

/** Bir metinde bulunan terim: karakter konumu, terim anahtarı ve durumu. */
export interface PageMatch {
  start: number;
  end: number;
  key: string;
  status: TermStatus;
}

/** Sayfadan gelen metinlerde listedeki kelimeleri bulur; yapay zekâ çağırmaz. */
export async function matchTexts(texts: string[]): Promise<PageMatch[][]> {
  await queue;
  const { matcher, size } = await getMatcher();
  if (size === 0) return texts.map(() => []);
  return texts.map((text) => {
    const tokens = tokenize(text);
    return matcher
      .findAll(tokens)
      .map((m) => ({ start: tokens[m.first]!.start, end: tokens[m.last]!.end, key: m.termId, status: m.status }));
  });
}
