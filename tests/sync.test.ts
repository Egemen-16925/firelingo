import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { Sentence, Term } from "@/shared/types";
import { toJson, toMarkdown, toPlainList, toTsv } from "@/sync/export";
import { importSnapshot } from "@/sync/import";
import { mergeShared, parseSnapshot, readShared, toSnapshot, type Shared } from "@/sync/snapshot";
import { deleteTerm, findWord, markTerm } from "@/terms/terms";
import { loadWordList } from "@/terms/wordList";

beforeEach(() => {
  fakeBrowser.reset();
});

const term = (key: string, updatedAt: number, extra: Partial<Term> = {}): Term => ({
  key,
  lemma: key,
  surface: key,
  pattern: [[key]],
  status: "unknown",
  meaning: "",
  explanation: "",
  note: "",
  createdAt: 1,
  updatedAt,
  review: { intervalDays: 0, dueAt: 1, streak: 0 },
  ...extra,
});
const sentence = (key: string, updatedAt: number, translation: string): Sentence => ({ key, text: key, translation, grammarNote: "", createdAt: 1, updatedAt });
const shared = (part: Partial<Shared>): Shared => ({ terms: [], occurrences: [], sentences: [], tombstones: [], ...part });
const file = (part: Partial<Shared>) => JSON.stringify(toSnapshot(shared(part)));

describe("mergeShared (DuoPDF's merge rules)", () => {
  it("keeps the newer term and the newer translation, in either order", () => {
    const a = shared({ terms: [term("run", 5, { meaning: "eski" })], sentences: [sentence("s", 9, "yeni")] });
    const b = shared({ terms: [term("run", 8, { meaning: "yeni" })], sentences: [sentence("s", 2, "eski")] });
    for (const merged of [mergeShared(a, b), mergeShared(b, a)]) {
      expect(merged.terms).toEqual([term("run", 8, { meaning: "yeni" })]);
      expect(merged.sentences[0]!.translation).toBe("yeni");
    }
  });

  it("unions occurrences, treating the same sentence on the same page as one", () => {
    const web = { termKey: "run", sentence: "He ran.", url: "https://a.test/x", title: "X", createdAt: 1 };
    const merged = mergeShared(
      shared({ terms: [term("run", 1)], occurrences: [web, { ...web, url: "https://b.test/y" }] }),
      shared({ terms: [term("run", 1)], occurrences: [{ ...web, createdAt: 9 }, { termKey: "run", sentence: "He ran.", docHash: "h1", page: 2, view: "text", createdAt: 3 }] }),
    );
    expect(merged.occurrences).toHaveLength(3);
  });

  it("lets a tombstone delete only a record that is not newer than it", () => {
    const merged = mergeShared(
      shared({ terms: [term("old", 5), term("revived", 20)], occurrences: [{ termKey: "old", sentence: "S", url: "https://a.test", title: "", createdAt: 1 }] }),
      shared({ tombstones: [{ key: "term:old", deletedAt: 10 }, { key: "term:revived", deletedAt: 10 }] }),
    );
    expect(merged.terms.map((t) => t.key)).toEqual(["revived"]);
    expect(merged.occurrences).toEqual([]);
    expect(merged.tombstones).toHaveLength(2);
  });
});

describe("parseSnapshot", () => {
  it("rejects text that is not JSON and files in another format", () => {
    expect(() => parseSnapshot("not json")).toThrow("JSON");
    expect(() => parseSnapshot(JSON.stringify({ format: "duopdf-backup", version: 1 }))).toThrow("tanınmadı");
    expect(() => parseSnapshot(JSON.stringify({ format: "duopdf-sync", version: 2 }))).toThrow("tanınmadı");
  });

  it("fills in sections a file leaves out", () => {
    expect(parseSnapshot(JSON.stringify({ format: "duopdf-sync", version: 1, terms: [term("run", 1)] }))).toMatchObject({ occurrences: [], sentences: [], tombstones: [] });
  });
});

describe("export then import", () => {
  async function seed() {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown", meaning: "koşmak", occurrence: { sentence: "He ran.", url: "https://en.wikipedia.org/wiki/Run", title: "Run" } }, 10);
    await markTerm({ surface: "carried out", lemma: "carry out", status: "learning", meaning: "yürütmek | uygulamak" }, 20);
    await markTerm({ surface: "gone", lemma: "go", status: "known" }, 30);
    await deleteTerm("go", 40);
  }

  it("does not multiply or change data when the same file is imported again", async () => {
    await seed();
    const before = await readShared();
    const json = toJson(before);
    expect(await importSnapshot(json)).toEqual({ added: 0, updated: 0, removed: 0, total: 2 });
    expect(await readShared()).toEqual(before);
  });

  it("restores everything into an empty store, tombstones included", async () => {
    await seed();
    const before = await readShared();
    const json = toJson(before);
    fakeBrowser.reset();
    expect(await importSnapshot(json)).toEqual({ added: 2, updated: 0, removed: 0, total: 2 });
    const after = await readShared();
    expect(after.terms.map((t) => t.key).sort()).toEqual(["carry out", "run"]);
    expect(after.occurrences).toEqual(before.occurrences);
    expect(after.tombstones).toEqual([{ key: "term:go", deletedAt: 40 }]);
    expect((await findWord("running")).existing?.key).toBe("run");
  });

  it("merges instead of replacing: newer wins, local-only words stay, tombstones delete", async () => {
    await seed();
    const summary = await importSnapshot(
      file({
        terms: [term("run", 99, { meaning: "çalıştırmak" }), term("carry out", 1, { meaning: "eski" }), term("fresh", 5)],
        tombstones: [{ key: "term:carry out", deletedAt: 50 }],
      }),
    );
    expect(summary).toEqual({ added: 1, updated: 1, removed: 1, total: 2 });
    const rows = await loadWordList();
    expect(rows.map((r) => r.term.key).sort()).toEqual(["fresh", "run"]);
    expect(rows.find((r) => r.term.key === "run")!.term.meaning).toBe("çalıştırmak");
    expect((await findWord("carried out")).existing).toBeUndefined();
  });

  it("keeps DuoPDF document occurrences and unknown term fields through a round trip", async () => {
    const docOccurrence = { termKey: "run", sentence: "We ran it.", docHash: "h1", page: 3, view: "text", createdAt: 7 };
    await importSnapshot(file({ terms: [{ ...term("run", 5), futureField: 1 } as Term], occurrences: [docOccurrence] }));
    const back = parseSnapshot(toJson(await readShared()));
    expect(back.terms[0]).toMatchObject({ key: "run", futureField: 1 });
    expect(back.occurrences).toEqual([docOccurrence]);
  });

  it("leaves the data untouched when the file is not recognised", async () => {
    await seed();
    const before = await readShared();
    await expect(importSnapshot("{}")).rejects.toThrow("tanınmadı");
    expect(await readShared()).toEqual(before);
  });
});

describe("clipboard formats", () => {
  async function rows() {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown", meaning: "koşmak", occurrence: { sentence: "He ran\n fast.", url: "https://en.wikipedia.org/wiki/Run", title: "Run" } }, 10);
    await markTerm({ surface: "carried out", lemma: "carry out", status: "learning", meaning: "yürütmek | uygulamak" }, 20);
    await markTerm({ surface: "sudden", lemma: "sudden", status: "known" }, 30);
    return (await loadWordList()).sort((a, b) => a.term.createdAt - b.term.createdAt);
  }

  it("writes a plain list", async () => {
    expect(toPlainList(await rows())).toBe("run — koşmak\ncarry out — yürütmek | uygulamak\nsudden");
  });

  it("writes Anki TSV with one card per line", async () => {
    expect(toTsv(await rows())).toBe("run\tkoşmak\tHe ran fast.\ncarry out\tyürütmek | uygulamak\t\nsudden\t\t");
  });

  it("writes a Markdown table and escapes pipes", async () => {
    expect(toMarkdown(await rows()).split("\n")).toEqual([
      "| Kelime | Çeviri | Durum | Cümle | Kaynak |",
      "| --- | --- | --- | --- | --- |",
      "| run | koşmak | Bilmiyorum | He ran fast. | en.wikipedia.org |",
      "| carry out | yürütmek \\| uygulamak | Az biliyorum |  |  |",
      "| sudden |  | Biliyorum |  |  |",
    ]);
  });

  it("writes JSON in the DuoPDF sync format, optionally only the filtered words", async () => {
    const list = await rows();
    const everything = parseSnapshot(toJson(await readShared()));
    expect(everything).toMatchObject({ format: "duopdf-sync", version: 1, documents: [], strokes: [], quizAttempts: [] });
    expect(everything.terms).toHaveLength(3);

    const filtered = parseSnapshot(toJson(await readShared(), [list[0]!]));
    expect(filtered.terms.map((t) => t.key)).toEqual(["run"]);
    expect(filtered.occurrences).toHaveLength(1);
  });
});
