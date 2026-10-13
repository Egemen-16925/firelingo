import { browser } from "wxt/browser";
import type { Occurrence, Sentence, Term } from "@/shared/types";
import { OCCURRENCE_PREFIX, SENTENCE_PREFIX, TERM_PREFIX, TOMBSTONE_PREFIX } from "@/terms/keys";

// DuoPDF'in eşitleme dosyası biçimi (`../Duopdf/src/sync/snapshot.ts`). Firelingo'nun JSON dışa/içe
// aktarması ve (Faz 6) Google Drive eşitlemesi aynı biçimi ve aynı birleştirme kurallarını kullanır.
export const SNAPSHOT_FORMAT = "duopdf-sync";
export const SNAPSHOT_VERSION = 1;

/** Web geçişinde `url` / `title`, DuoPDF'in belge geçişinde `docHash` / `page` / `view` bulunur. */
export interface SyncOccurrence extends Occurrence {
  termKey: string;
  docHash?: string;
  page?: number;
  view?: string;
}

/** Silinen kaydın izi: `key` "<tablo>:<kararlı anahtar>" biçimindedir, ör. "term:run". */
export interface Tombstone {
  key: string;
  deletedAt: number;
}

/** Firelingo'nun okuyup yazdığı bölümler. */
export interface Shared {
  terms: Term[];
  occurrences: SyncOccurrence[];
  sentences: Sentence[];
  tombstones: Tombstone[];
}

/** Dosyanın tamamı. Belgeler, çizimler ve sınav cevapları DuoPDF'e aittir; Firelingo bunları üretmez. */
export interface Snapshot extends Shared {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  documents: unknown[];
  strokes: unknown[];
  quizAttempts: unknown[];
}

export const toSnapshot = (shared: Shared): Snapshot => ({
  format: SNAPSHOT_FORMAT,
  version: SNAPSHOT_VERSION,
  documents: [],
  terms: shared.terms,
  occurrences: shared.occurrences,
  sentences: shared.sentences,
  strokes: [],
  quizAttempts: [],
  tombstones: shared.tombstones,
});

/** JSON'u denetler; biçim tanınmıyorsa hata verir. */
export function parseSnapshot(json: string): Snapshot {
  let data: Partial<Snapshot>;
  try {
    data = JSON.parse(json) as Partial<Snapshot>;
  } catch {
    throw new Error("Geçerli bir JSON değil.");
  }
  if (data?.format !== SNAPSHOT_FORMAT || data.version !== SNAPSHOT_VERSION) {
    throw new Error("Dosya tanınmadı: Firelingo ya da DuoPDF eşitleme biçiminde (duopdf-sync, sürüm 1) olmalı.");
  }
  return { ...toSnapshot({ terms: [], occurrences: [], sentences: [], tombstones: [] }), ...data } as Snapshot;
}

/** Belge geçişlerinin anahtarı DuoPDF'tekiyle aynıdır; web geçişi adresle tanınır. */
export const occurrenceKey = (o: SyncOccurrence) =>
  (!o.docHash && o.url ? [o.termKey, `url:${o.url}`, o.sentence] : [o.termKey, o.docHash, o.view, o.page, o.sentence]).join("\u0001");

/** Aynı anahtarlı kayıtlardan en son değiştirileni (eşitse ilki) kalır. */
function newest<T extends { key: string; updatedAt: number }>(a: T[], b: T[]): T[] {
  const out = new Map<string, T>();
  for (const item of [...a, ...b]) {
    const existing = out.get(item.key);
    if (!existing || item.updatedAt > existing.updatedAt) out.set(item.key, item);
  }
  return [...out.values()];
}

const byKey = <T,>(items: T[], key: (item: T) => string) => items.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));

/**
 * İki tarafın verisini kayıt kayıt birleştirir (DuoPDF'in `mergeSnapshots` kuralları): terim ve
 * çeviride yeni `updatedAt` kazanır, geçişler birleşir, silme izi yalnızca kayıttan yeni ya da
 * aynı andaysa siler. Sıra önemsizdir: merge(a, b) ve merge(b, a) aynı veriyi verir.
 */
export function mergeShared(a: Shared, b: Shared): Shared {
  const deleted = new Map<string, number>();
  for (const t of [...a.tombstones, ...b.tombstones]) deleted.set(t.key, Math.max(deleted.get(t.key) ?? 0, t.deletedAt));
  const erased = (key: string, updatedAt: number) => (deleted.get(key) ?? -Infinity) >= updatedAt;

  const terms = newest(a.terms, b.terms).filter((t) => !erased(`term:${t.key}`, t.updatedAt));
  const termKeys = new Set(terms.map((t) => t.key));

  const occurrences = new Map<string, SyncOccurrence>();
  for (const o of [...a.occurrences, ...b.occurrences]) {
    if (termKeys.has(o.termKey) && !occurrences.has(occurrenceKey(o))) occurrences.set(occurrenceKey(o), o);
  }

  return {
    terms: byKey(terms, (t) => t.key),
    occurrences: byKey([...occurrences.values()], occurrenceKey),
    sentences: byKey(
      newest(a.sentences, b.sentences).filter((s) => !erased(`sentence:${s.key}`, s.updatedAt)),
      (s) => s.key,
    ),
    tombstones: byKey(
      [...deleted].map(([key, deletedAt]) => ({ key, deletedAt })),
      (t) => t.key,
    ),
  };
}

const OWNED = [TERM_PREFIX, OCCURRENCE_PREFIX, SENTENCE_PREFIX, TOMBSTONE_PREFIX];

/** Yerel veriyi eşitleme biçimine çevirir. */
export async function readShared(): Promise<Shared> {
  const all = await browser.storage.local.get(null);
  const shared: Shared = { terms: [], occurrences: [], sentences: [], tombstones: [] };
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(TERM_PREFIX)) shared.terms.push(value as Term);
    else if (key.startsWith(SENTENCE_PREFIX)) shared.sentences.push(value as Sentence);
    else if (key.startsWith(TOMBSTONE_PREFIX)) shared.tombstones.push({ key: key.slice(TOMBSTONE_PREFIX.length), deletedAt: value as number });
    else if (key.startsWith(OCCURRENCE_PREFIX)) {
      const termKey = key.slice(OCCURRENCE_PREFIX.length);
      for (const occurrence of value as Occurrence[]) shared.occurrences.push({ ...occurrence, termKey });
    }
  }
  return shared;
}

/** Birleştirilmiş veriyi yerel depoya işler; birleşik veride olmayan (silinmiş) kayıtlar yerelden de kalkar. */
export async function applyShared(shared: Shared): Promise<void> {
  const items: Record<string, unknown> = {};
  for (const term of shared.terms) items[TERM_PREFIX + term.key] = term;
  for (const sentence of shared.sentences) items[SENTENCE_PREFIX + sentence.key] = sentence;
  for (const tombstone of shared.tombstones) items[TOMBSTONE_PREFIX + tombstone.key] = tombstone.deletedAt;
  for (const { termKey, ...occurrence } of shared.occurrences) {
    ((items[OCCURRENCE_PREFIX + termKey] ??= []) as Occurrence[]).push(occurrence);
  }

  const existing = Object.keys(await browser.storage.local.get(null)).filter((key) => OWNED.some((prefix) => key.startsWith(prefix)));
  await browser.storage.local.remove(existing.filter((key) => !(key in items)));
  await browser.storage.local.set(items);
}
