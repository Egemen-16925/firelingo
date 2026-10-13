import { cleanText, sentenceKey } from "duo-terms";
import { browser } from "wxt/browser";
import type { SentenceTranslation } from "@/ai/schemas";
import type { Sentence } from "@/shared/types";

export const SENTENCE_PREFIX = "sentence:";

/**
 * Cümlenin çevirisini döndürür. Daha önce çevrildiyse kayıttan (internetsiz de çalışır);
 * değilse `translate` ile çevirir ve kaydeder. Kayıt anahtarında sağlayıcı/model yoktur.
 */
export async function translateSentence(
  text: string,
  translate: (sentence: string) => Promise<SentenceTranslation>,
  opts: { force?: boolean; now?: number } = {},
): Promise<{ sentence: Sentence; fromCache: boolean }> {
  const clean = cleanText(text);
  const key = await sentenceKey(clean);
  const storageKey = SENTENCE_PREFIX + key;
  const existing = (await browser.storage.local.get(storageKey))[storageKey] as Sentence | undefined;
  if (existing && !opts.force) return { sentence: existing, fromCache: true };

  const result = await translate(clean);
  const now = opts.now ?? Date.now();
  const sentence: Sentence = {
    ...(existing ?? { createdAt: now }),
    key,
    text: clean,
    translation: result.ceviri.trim(),
    grammarNote: result.dilbilgisiNotu.trim(),
    updatedAt: now,
  };
  await browser.storage.local.set({ [storageKey]: sentence });
  return { sentence, fromCache: false };
}
