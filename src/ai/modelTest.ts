import samples from "../assets/test-samples.json";
import { runPrompt, type AiTarget, type PromptRun } from "./client";
import { AiError, describeAiError } from "./errors";
import { translateSentencePrompt } from "./prompts/translateSentence";
import { wordMeaningPrompt } from "./prompts/wordMeaning";

export interface TestOutcome {
  title: string;
  /** Modele gönderilen örnek (kullanıcıya gösterilir). */
  input: string;
  status?: number;
  ms?: number;
  jsonValid: boolean;
  tokens?: number;
  output?: string;
  error?: string;
}

export interface ModelTestResult {
  /** Seçilen kelime ve cümle örneğinin sırası; "başka örnek" için geri gönderilir. */
  picked: [number, number];
  outcomes: TestOutcome[];
}

function pick(length: number, previous?: number): number {
  const i = Math.floor(Math.random() * length);
  return i === previous ? (i + 1) % length : i;
}

async function outcome(title: string, input: string, run: Promise<PromptRun<unknown>>): Promise<TestOutcome> {
  try {
    const r = await run;
    return {
      title,
      input,
      status: r.status,
      ms: r.ms,
      jsonValid: r.data !== undefined,
      tokens: r.tokens,
      output: r.data !== undefined ? JSON.stringify(r.data, null, 2) : r.text,
      error: r.validationError,
    };
  } catch (e) {
    return { title, input, status: e instanceof AiError ? e.status : undefined, jsonValid: false, error: describeAiError(e) };
  }
}

/** Rastgele bir kelimeyi (bağlamıyla) ve bir cümleyi seçili modelle çevirir. */
export async function runModelTest(target: AiTarget, previous?: [number, number]): Promise<ModelTestResult> {
  const w = pick(samples.words.length, previous?.[0]);
  const s = pick(samples.sentences.length, previous?.[1]);
  const word = samples.words[w]!;
  const sentence = samples.sentences[s]!;
  const outcomes = await Promise.all([
    outcome("Kelime anlamı", `“${word.word}” — ${word.sentence}`, runPrompt(target, wordMeaningPrompt, word, { retries: 0 })),
    outcome("Cümle çevirisi", sentence, runPrompt(target, translateSentencePrompt, { sentence }, { retries: 0 })),
  ]);
  return { picked: [w, s], outcomes };
}
