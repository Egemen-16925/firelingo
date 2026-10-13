import { describe, expect, it } from "vitest";
import { sentenceAt, wordsIn } from "@/entrypoints/content/selection";

describe("wordsIn", () => {
  it("finds English words, keeping apostrophes and inner hyphens", () => {
    expect(wordsIn("The compiler’s real-time output, isn't it?")).toEqual(["The", "compiler’s", "real-time", "output", "isn't", "it"]);
  });

  it("returns nothing for text without English words", () => {
    expect(wordsIn("123 — 456 …")).toEqual([]);
  });
});

describe("sentenceAt", () => {
  const text = "The bridge was closed.  It reopened in May after\n  months of inspections. Nobody complained.";
  const at = (part: string) => {
    const start = text.indexOf(part);
    return sentenceAt(text, start, start + part.length);
  };

  it("returns the sentence around a word, with whitespace collapsed", () => {
    expect(at("reopened")).toEqual({ sentence: "It reopened in May after months of inspections.", single: true });
    expect(at("bridge")).toEqual({ sentence: "The bridge was closed.", single: true });
  });

  it("reports a selection that crosses a sentence boundary", () => {
    expect(at("closed.  It reopened")).toEqual({
      sentence: "The bridge was closed. It reopened in May after months of inspections.",
      single: false,
    });
  });

  it("falls back to the selected text when nothing overlaps", () => {
    expect(sentenceAt("", 0, 0)).toEqual({ sentence: "", single: true });
  });
});
