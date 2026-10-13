import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { deleteTerm, markTerm, updateTerm } from "@/terms/terms";
import { filterRows, loadWordList, sitesOf, type WordFilter } from "@/terms/wordList";

beforeEach(() => {
  fakeBrowser.reset();
});

const all: WordFilter = { status: "all", site: "", query: "" };

async function seed() {
  await markTerm({ surface: "ran", lemma: "run", status: "unknown", meaning: "koşmak", occurrence: { sentence: "He ran.", url: "https://en.wikipedia.org/wiki/Run", title: "Run" } }, 1);
  await markTerm({ surface: "carried out", lemma: "carry out", status: "learning", meaning: "yürütmek", occurrence: { sentence: "They carried out tests.", url: "https://example.com/a", title: "A" } }, 2);
  await markTerm({ surface: "Işık", lemma: "light", status: "known", meaning: "IŞIK" }, 3);
  return loadWordList();
}

describe("loadWordList / filterRows", () => {
  it("lists every term with its occurrences, newest first", async () => {
    const rows = filterRows(await seed(), all);
    expect(rows.map((r) => r.term.key)).toEqual(["light", "carry out", "run"]);
    expect(rows[2]!.occurrences).toHaveLength(1);
    expect(rows[0]!.occurrences).toEqual([]);
  });

  it("filters by status and by source site", async () => {
    const rows = await seed();
    expect(filterRows(rows, { ...all, status: "learning" }).map((r) => r.term.key)).toEqual(["carry out"]);
    expect(filterRows(rows, { ...all, site: "en.wikipedia.org" }).map((r) => r.term.key)).toEqual(["run"]);
    expect(sitesOf(rows)).toEqual(["en.wikipedia.org", "example.com"]);
  });

  it("searches word, surface and meaning, ignoring case with Turkish letters", async () => {
    const rows = await seed();
    expect(filterRows(rows, { ...all, query: " RAN " }).map((r) => r.term.key)).toEqual(["run"]);
    expect(filterRows(rows, { ...all, query: "yürüt" }).map((r) => r.term.key)).toEqual(["carry out"]);
    expect(filterRows(rows, { ...all, query: "ışık" }).map((r) => r.term.key)).toEqual(["light"]);
    expect(filterRows(rows, { ...all, query: "zzz" })).toEqual([]);
  });
});

describe("updateTerm", () => {
  it("changes only the given fields, bumps updatedAt and keeps review and unknown fields", async () => {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown", meaning: "koşmak" }, 1);
    const stored = (await fakeBrowser.storage.local.get("term:run"))["term:run"] as object;
    await fakeBrowser.storage.local.set({ "term:run": { ...stored, review: { intervalDays: 3, dueAt: 9, streak: 2 }, extra: true } });

    const term = await updateTerm("run", { meaning: " çalıştırmak ", status: "known" }, 50);
    expect(term).toMatchObject({ meaning: "çalıştırmak", status: "known", updatedAt: 50, createdAt: 1, review: { intervalDays: 3, dueAt: 9, streak: 2 }, extra: true });
  });

  it("ignores a term that no longer exists", async () => {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown" });
    await deleteTerm("run");
    expect(await updateTerm("run", { status: "known" })).toBeUndefined();
    expect(await loadWordList()).toEqual([]);
  });
});
