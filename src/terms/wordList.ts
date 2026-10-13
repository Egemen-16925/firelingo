import { browser } from "wxt/browser";
import type { Occurrence, Term, TermStatus } from "@/shared/types";
import { OCCURRENCE_PREFIX, TERM_PREFIX } from "./keys";

/** Kelime listesinin bir satırı: terim ve web'de geçtiği yerler. */
export interface WordRow {
  term: Term;
  occurrences: Occurrence[];
}

export interface WordFilter {
  status: TermStatus | "all";
  /** Kaynak sitenin hostname'i; boşsa tüm siteler. */
  site: string;
  query: string;
}

/** Tüm kelimeleri geçişleriyle okur (yalnızca okuma; yazmalar background'dan geçer). */
export async function loadWordList(): Promise<WordRow[]> {
  const all = await browser.storage.local.get(null);
  return Object.keys(all)
    .filter((key) => key.startsWith(TERM_PREFIX))
    .map((key) => {
      const term = all[key] as Term;
      return { term, occurrences: (all[OCCURRENCE_PREFIX + term.key] as Occurrence[] | undefined) ?? [] };
    });
}

export function siteOf(url: string | undefined): string {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return "";
  }
}

/** Listedeki kelimelerin geçtiği siteler, alfabetik. */
export function sitesOf(rows: WordRow[]): string[] {
  const sites = new Set(rows.flatMap((row) => row.occurrences.map((o) => siteOf(o.url))));
  sites.delete("");
  return [...sites].sort((a, b) => a.localeCompare(b));
}

const fold = (text: string) => text.toLocaleLowerCase("tr");

/** Duruma, siteye ve aramaya (kelime, görünen hâl, çeviri) göre süzer; en yeni kelime önce. */
export function filterRows(rows: WordRow[], { status, site, query }: WordFilter): WordRow[] {
  const needle = fold(query.trim());
  return rows
    .filter(({ term, occurrences }) => {
      if (status !== "all" && term.status !== status) return false;
      if (site && !occurrences.some((o) => siteOf(o.url) === site)) return false;
      return !needle || [term.lemma, term.surface, term.meaning].some((text) => fold(text).includes(needle));
    })
    .sort((a, b) => b.term.createdAt - a.term.createdAt);
}
