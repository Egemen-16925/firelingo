import { buildMatcher, patternFor, termKey, tokenize } from "duo-terms";
import { describe, expect, it } from "vitest";

// Anahtar üretimi DuoPDF ile ortak pakettedir; bu test paketin kurulu sürümünün
// Faz 2 kabul ölçütündeki girdilerde beklenen sonucu verdiğini doğrular.
describe("duo-terms (shared with DuoPDF)", () => {
  it("puts running and ran under the single key run", () => {
    const pattern = patternFor(["running"], ["run"]);
    const matcher = buildMatcher([{ id: termKey("run"), status: "unknown" as const, pattern }]);
    expect(matcher.findExact(tokenize("ran"))?.id).toBe("run");
    expect(matcher.findExact(tokenize("running"))?.id).toBe("run");
  });

  it("keys multi-word terms by their lemma", () => {
    expect(termKey("Carry  Out")).toBe("carry out");
    const matcher = buildMatcher([{ id: "carry out", status: "learning" as const, pattern: patternFor(["carried", "out"], ["carry", "out"]) }]);
    expect(matcher.findExact(tokenize("carries out"))?.id).toBe("carry out");
  });
});
