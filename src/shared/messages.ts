import type { WordMeaning } from "@/ai/schemas";
import type { MarkInput } from "@/terms/terms";
import type { Sentence } from "./types";

/** Content script → background: "bu sayfada açık mıyım?" Yanıt: HelloResponse. */
export interface HelloMessage {
  type: "hello";
}

/** Background → content script: ayar değişti, durumunu yeniden sor. */
export interface RefreshMessage {
  type: "refresh";
}

/** Background → content script: kelime listesi değişti, sayfayı yeniden tara. */
export interface RescanMessage {
  type: "rescan";
}

/** Popup → content script: bu sayfada listeden kaç farklı kelime geçiyor. Yanıt: sayı. */
export interface PageCountMessage {
  type: "page:count";
}

/**
 * Ayarlar sayfası → background: etkin sağlayıcıyla istek at. Yanıt: Result<…>.
 * Anahtar mesajda taşınmaz; background onu storage'dan okur.
 */
export type AiMessage =
  | { type: "ai:listModels" }
  | { type: "ai:testConnection" }
  | { type: "ai:modelTest"; previous?: [number, number] };

/** Sayfa → background: kelime ve cümle işlemleri. Yanıt: Result<…>. */
export type TermMessage =
  /** Seçilen kelime listede var mı (yapay zekâ çağırmaz). Yanıt: WordFound. */
  | { type: "word:find"; surface: string }
  /** Kelimenin cümledeki anlamı. Yanıt: MeaningResult. */
  | { type: "word:meaning"; word: string; sentence: string; force?: boolean }
  /** Kelimeyi işaretle ya da durumunu değiştir. Yanıt: Term. */
  | { type: "term:mark"; input: MarkInput }
  | { type: "term:delete"; key: string }
  /** Cümle çevirisi. Yanıt: SentenceResult. */
  | { type: "sentence:translate"; text: string; force?: boolean }
  /** Sayfa metinlerinde listedeki kelimeleri bul (yapay zekâ çağırmaz). Yanıt: her metin için PageMatch[]. */
  | { type: "page:match"; texts: string[] };

export type RequestMessage = AiMessage | TermMessage;
export type Message = HelloMessage | RefreshMessage | RescanMessage | PageCountMessage | RequestMessage;

export interface HelloResponse {
  enabled: boolean;
}

export interface MeaningResult {
  meaning: WordMeaning;
  fromCache: boolean;
}

export interface SentenceResult {
  sentence: Sentence;
  fromCache: boolean;
}

/** Hata nesneleri mesajla taşınamadığı için sonuç düz veri olarak döner. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
