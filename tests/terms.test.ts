import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { cached } from "@/terms/cache";
import { translateSentence } from "@/terms/sentences";
import { deleteTerm, findWord, listTerms, markTerm, occurrencesOf } from "@/terms/terms";

// DuoPDF'in terms/sentences testlerindeki senaryolar; depolama bellek içi browser.storage taklididir.
beforeEach(() => {
  fakeBrowser.reset();
});

const occurrence = (sentence: string, url = "https://example.com/a") => ({ sentence, url, title: "Example" });

describe("markTerm", () => {
  it("creates a DuoPDF-shaped term whose pattern covers other inflections", async () => {
    const term = await markTerm({ surface: "ran", lemma: "run", status: "unknown", meaning: "çalıştırmak", occurrence: occurrence("We ran the tests.") }, 100);
    expect(term).toMatchObject({
      key: "run",
      lemma: "run",
      surface: "ran",
      status: "unknown",
      meaning: "çalıştırmak",
      explanation: "",
      note: "",
      createdAt: 100,
      updatedAt: 100,
      review: { intervalDays: 0, dueAt: 100, streak: 0 },
    });
    expect((await findWord("running")).existing?.key).toBe("run");
    expect(await occurrencesOf("run")).toEqual([{ ...occurrence("We ran the tests."), createdAt: 100 }]);
  });

  it("puts running and ran into the single record run", async () => {
    const first = await markTerm({ surface: "running", lemma: "run", status: "unknown", occurrence: occurrence("A") }, 1);
    const second = await markTerm({ surface: "ran", lemma: "run", status: "learning", occurrence: occurrence("B") }, 2);
    expect(second.key).toBe(first.key);
    expect(second).toMatchObject({ status: "learning", createdAt: 1, updatedAt: 2 });
    expect(await listTerms()).toHaveLength(1);
    expect(await occurrencesOf("run")).toHaveLength(2);
  });

  it("keeps the old meaning when none is given and skips duplicate sentences", async () => {
    const t = await markTerm({ surface: "commit", lemma: "commit", status: "unknown", meaning: "işlemek", occurrence: occurrence("S") });
    const again = await markTerm({ termKey: t.key, surface: "commit", lemma: "commit", status: "known", occurrence: occurrence("S") });
    expect(again.meaning).toBe("işlemek");
    expect(await occurrencesOf(t.key)).toHaveLength(1);
  });

  it("updates the found term even if the model now returns a different lemma", async () => {
    await markTerm({ surface: "data", lemma: "data", status: "unknown" });
    const again = await markTerm({ termKey: "data", surface: "data", lemma: "datum", status: "known" });
    expect(again.key).toBe("data");
    expect(await listTerms()).toHaveLength(1);
  });

  it("stores multi-word terms", async () => {
    const t = await markTerm({ surface: "carried out", lemma: "carry out", status: "unknown" });
    expect(t.key).toBe("carry out");
    expect((await findWord("carries out")).existing?.key).toBe("carry out");
  });

  it("preserves fields it does not know and never touches review", async () => {
    const review = { intervalDays: 7, dueAt: 999, streak: 3 };
    await fakeBrowser.storage.local.set({
      "term:run": { key: "run", lemma: "run", surface: "run", pattern: [["run"]], status: "learning", meaning: "koşmak", explanation: "", note: "n", createdAt: 1, updatedAt: 1, review, futureField: { a: 1 } },
    });
    const term = await markTerm({ surface: "ran", lemma: "run", status: "known" }, 50);
    expect(term).toMatchObject({ status: "known", note: "n", review, futureField: { a: 1 }, updatedAt: 50 });
  });

  it("keeps concurrent marks from overwriting each other", async () => {
    await Promise.all([
      markTerm({ surface: "running", lemma: "run", status: "unknown", occurrence: occurrence("A") }),
      markTerm({ surface: "ran", lemma: "run", status: "learning", occurrence: occurrence("B") }),
      markTerm({ surface: "tests", lemma: "test", status: "unknown" }),
    ]);
    expect((await listTerms()).map((t) => t.key).sort()).toEqual(["run", "test"]);
    expect(await occurrencesOf("run")).toHaveLength(2);
  });
});

describe("deleteTerm", () => {
  it("removes the term with its occurrences and leaves a tombstone", async () => {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown", occurrence: occurrence("A") });
    await deleteTerm("run", 5);
    expect(await listTerms()).toEqual([]);
    expect(await occurrencesOf("run")).toEqual([]);
    expect((await findWord("ran")).existing).toBeUndefined();
    expect((await fakeBrowser.storage.local.get("tomb:term:run"))["tomb:term:run"]).toBe(5);
  });

  it("clears the tombstone when the word is marked again", async () => {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown" });
    await deleteTerm("run", 5);
    await markTerm({ surface: "runs", lemma: "run", status: "learning" });
    expect(await fakeBrowser.storage.local.get("tomb:term:run")).toEqual({});
  });
});

describe("findWord", () => {
  it("offers a local lemma when the word is not in the list", async () => {
    expect(await findWord("studies")).toEqual({ existing: undefined, localLemma: "study" });
  });
});

describe("translateSentence", () => {
  const translation = { ceviri: " Testleri çalıştırdık. ", dilbilgisiNotu: "Geçmiş zaman." };

  it("translates once, then answers from the stored record", async () => {
    const translate = vi.fn(async () => translation);
    const first = await translateSentence("We  ran\nthe tests.", translate, { now: 10 });
    expect(first).toMatchObject({ fromCache: false, sentence: { text: "We ran the tests.", translation: "Testleri çalıştırdık.", grammarNote: "Geçmiş zaman.", createdAt: 10 } });
    const second = await translateSentence("We ran the tests.", translate);
    expect(second.fromCache).toBe(true);
    expect(second.sentence).toEqual(first.sentence);
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("re-translates on force and keeps the creation time", async () => {
    await translateSentence("Hi.", async () => translation, { now: 10 });
    const again = await translateSentence("Hi.", async () => ({ ceviri: "Selam.", dilbilgisiNotu: "" }), { force: true, now: 20 });
    expect(again.sentence).toMatchObject({ translation: "Selam.", createdAt: 10, updatedAt: 20 });
  });
});

describe("cached", () => {
  const op = { id: "wordMeaning", version: 1 };

  it("does not compute the same input twice", async () => {
    const compute = vi.fn(async () => ({ anlam: "koşmak" }));
    expect(await cached(op, { word: "ran", sentence: "S" }, compute)).toEqual({ value: { anlam: "koşmak" }, fromCache: false });
    expect(await cached(op, { word: "ran", sentence: "S" }, compute)).toEqual({ value: { anlam: "koşmak" }, fromCache: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("treats another sentence or prompt version as a different entry, and honors force", async () => {
    const compute = vi.fn(async () => 1);
    await cached(op, { word: "ran", sentence: "S" }, compute);
    await cached(op, { word: "ran", sentence: "T" }, compute);
    await cached({ ...op, version: 2 }, { word: "ran", sentence: "S" }, compute);
    await cached(op, { word: "ran", sentence: "S" }, compute, { force: true });
    expect(compute).toHaveBeenCalledTimes(4);
  });

  it("does not cache failures", async () => {
    await expect(cached(op, "x", async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await cached(op, "x", async () => 2)).toEqual({ value: 2, fromCache: false });
  });
});
