import { tokenize } from "duo-terms";
import { findWord, listTerms, markTerm, serialized, updateTerm } from "@/terms/terms";
import { applyShared, mergeShared, parseSnapshot, readShared } from "./snapshot";

export interface ImportSummary {
  added: number;
  updated: number;
  removed: number;
  /** İçe aktarmadan sonraki toplam kelime sayısı. */
  total: number;
  /** Düz listede kelime olarak okunamayan satır sayısı. */
  skipped?: number;
}

/** Yapıştırılan metin `{` ile başlıyorsa eşitleme biçimindeki JSON, değilse satır satır kelime listesi sayılır. */
export function importData(text: string, now = Date.now()): Promise<ImportSummary> {
  return text.trimStart().startsWith("{") ? importSnapshot(text, now) : importWordList(text, now);
}

/**
 * Eşitleme biçimindeki JSON'u yerel veriyle birleştirir (mevcut veri silinmez). Kelime
 * yazmalarıyla aynı sırada çalışır; yalnızca background'da kullanılır.
 *
 * Eşitlemeden tek farkı: kullanıcı dosyayı bilerek içe aldığı için, dışa aktarımdan sonra
 * yerelde silinmiş bir kelime dosyada duruyorsa geri gelir. Böyle bir kelime "şimdi değişmiş"
 * sayılır ki eski silme izi (bu cihazda ya da eşitlenen başka bir cihazda) onu yeniden silmesin.
 * Dosyanın kendi silme izleri ise normal kuralla uygulanır.
 */
export function importSnapshot(json: string, now = Date.now()): Promise<ImportSummary> {
  return serialized(async () => {
    const incoming = parseSnapshot(json);
    const local = await readShared();

    const deletedAt = (tombstones: typeof local.tombstones, key: string) => tombstones.find((t) => t.key === key)?.deletedAt ?? -Infinity;
    const terms = incoming.terms.map((term) => {
      const key = `term:${term.key}`;
      const deletedHere = deletedAt(local.tombstones, key) >= term.updatedAt;
      const deletedInFile = deletedAt(incoming.tombstones, key) >= term.updatedAt;
      return deletedHere && !deletedInFile ? { ...term, updatedAt: now } : term;
    });

    const merged = mergeShared(local, { ...incoming, terms });
    await applyShared(merged);

    const before = new Map(local.terms.map((t) => [t.key, t.updatedAt]));
    const after = new Map(merged.terms.map((t) => [t.key, t.updatedAt]));
    return {
      added: [...after.keys()].filter((key) => !before.has(key)).length,
      updated: [...after].filter(([key, updatedAt]) => before.has(key) && before.get(key) !== updatedAt).length,
      removed: [...before.keys()].filter((key) => !after.has(key)).length,
      total: after.size,
    };
  });
}

export interface ListEntry {
  word: string;
  meaning: string;
  sentence: string;
}

const MAX_TERM_WORDS = 6;

/**
 * Düz kelime listesini okur: her satırda bir kelime ya da öbek. İsteğe bağlı çeviri ve örnek cümle
 * sekmeyle (Firelingo'nun TSV çıktısı) ya da çeviri ` — ` / ` - ` ile ayrılabilir. Baştaki madde
 * işareti ve numara atılır. İngilizce kelime olmayan ya da 6 kelimeden uzun satırlar atlanır.
 */
export function parseWordList(text: string): { entries: ListEntry[]; skipped: number } {
  const entries: ListEntry[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const raw = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!raw) continue;
    const [first = "", meaning = "", sentence = ""] = raw.includes("\t") ? raw.split("\t") : raw.split(/\s+[—–-]\s+/, 2);
    const words = tokenize(first).map((t) => first.slice(t.start, t.end));
    if (words.length === 0 || words.length > MAX_TERM_WORDS || !/^[A-Za-z'’\s-]+$/.test(first)) {
      skipped++;
      continue;
    }
    entries.push({ word: words.join(" "), meaning: meaning.trim(), sentence: sentence.trim() });
  }
  return { entries, skipped };
}

/**
 * Düz listedeki kelimeleri "bilmiyorum" olarak ekler. Listede zaten olan kelimeye (çekimli hâli
 * dahil) dokunulmaz; yalnızca çevirisi boşsa ve satırda çeviri varsa doldurulur.
 */
export async function importWordList(text: string, now = Date.now()): Promise<ImportSummary> {
  const { entries, skipped } = parseWordList(text);
  if (entries.length === 0) {
    throw new Error("Metin tanınmadı. Eşitleme biçiminde JSON ya da her satırda bir İngilizce kelime (isteğe bağlı “kelime — çeviri”) olmalı.");
  }
  let added = 0;
  let updated = 0;
  for (const entry of entries) {
    const { existing } = await findWord(entry.word);
    if (existing) {
      if (!existing.meaning && entry.meaning) {
        await updateTerm(existing.key, { meaning: entry.meaning }, now);
        updated++;
      }
      continue;
    }
    await markTerm(
      { surface: entry.word, lemma: entry.word, status: "unknown", meaning: entry.meaning, occurrence: entry.sentence ? { sentence: entry.sentence } : undefined },
      now,
    );
    added++;
  }
  return { added, updated, removed: 0, total: (await listTerms()).length, skipped };
}
