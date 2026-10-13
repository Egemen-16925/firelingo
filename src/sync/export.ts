import type { TermStatus } from "@/shared/types";
import { siteOf, type WordRow } from "@/terms/wordList";
import { toSnapshot, type Shared } from "./snapshot";

// Kelime listesini panoya ya da dosyaya yazılacak metne çevirir.

const STATUS_LABELS: Record<TermStatus, string> = { unknown: "Bilmiyorum", learning: "Az biliyorum", known: "Biliyorum" };

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();
const latest = (row: WordRow) => row.occurrences[row.occurrences.length - 1];

/** Düz liste: her satırda `kelime — çeviri`. */
export function toPlainList(rows: WordRow[]): string {
  return rows.map(({ term }) => (term.meaning ? `${term.lemma} — ${term.meaning}` : term.lemma)).join("\n");
}

/** Anki'nin içe aktardığı biçim: sekmeyle ayrılmış ön yüz, arka yüz ve örnek cümle. */
export function toTsv(rows: WordRow[]): string {
  return rows.map((row) => [row.term.lemma, row.term.meaning, latest(row)?.sentence ?? ""].map(oneLine).join("\t")).join("\n");
}

export function toMarkdown(rows: WordRow[]): string {
  const cell = (text: string) => oneLine(text).replace(/\|/g, "\\|");
  const lines = rows.map((row) => {
    const occurrence = latest(row);
    const cells = [row.term.lemma, row.term.meaning, STATUS_LABELS[row.term.status], occurrence?.sentence ?? "", siteOf(occurrence?.url ?? "")];
    return `| ${cells.map(cell).join(" | ")} |`;
  });
  return ["| Kelime | Çeviri | Durum | Cümle | Kaynak |", "| --- | --- | --- | --- | --- |", ...lines].join("\n");
}

/**
 * DuoPDF eşitleme biçiminde JSON. `rows` verilirse yalnızca o kelimeler ve geçişleri yazılır
 * (süzülmüş liste); cümle çevirileri ve silme izleri her zaman tamdır.
 */
export function toJson(shared: Shared, rows?: WordRow[]): string {
  const keys = rows && new Set(rows.map((row) => row.term.key));
  const picked: Shared = keys
    ? { ...shared, terms: shared.terms.filter((t) => keys.has(t.key)), occurrences: shared.occurrences.filter((o) => keys.has(o.termKey)) }
    : shared;
  return JSON.stringify(toSnapshot(picked), null, 2);
}
