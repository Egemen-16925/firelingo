import type { WordMeaning } from "@/ai/schemas";
import type { MarkInput } from "@/terms/terms";
import type { Sentence, Term } from "./types";

/** Content script → background: "bu sayfada açık mıyım?" Yanıt: HelloResponse. */
export interface HelloMessage {
  type: "hello";
}

/** Background → content script: ayar değişti, durumunu yeniden sor. */
export interface RefreshMessage {
  type: "refresh";
}

/** Background → content script: kelime listesi ya da görünüm ayarları değişti, sayfayı yeniden tara. */
export interface RescanMessage {
  type: "rescan";
}

/** Popup → content script: sayfanın durumu. Yanıt: PageState (eklenti o sayfada kapalıysa undefined). */
export interface PageStateMessage {
  type: "page:state";
}

/** Popup ya da kısayol → content script: fosforlu kalemi aç/kapat. Yanıt: PageState. */
export interface PenToggleMessage {
  type: "pen:toggle";
}

/** Content script → background: kalem bu sekmede açıldı/kapandı (sayfa değişince hatırlanır). */
export interface PenSetMessage {
  type: "pen:set";
  on: boolean;
}

export interface PageState {
  /** Bu sayfada geçen, listedeki farklı kelime sayısı. */
  count: number;
  /** Fosforlu kalem modu açık mı. */
  pen: boolean;
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
  /** Listeden düzenleme. Yanıt: Term (bu arada silindiyse undefined). */
  | { type: "term:update"; key: string; patch: Partial<Pick<Term, "status" | "meaning" | "explanation" | "note">> }
  | { type: "term:delete"; key: string }
  /** Cümle çevirisi. Yanıt: SentenceResult. */
  | { type: "sentence:translate"; text: string; force?: boolean }
  /** Eşitleme biçimindeki JSON'u ya da düz kelime listesini birleştirerek içe aktar. Yanıt: ImportSummary. */
  | { type: "data:import"; text: string }
  /** Sayfa metinlerinde listedeki kelimeleri bul (yapay zekâ çağırmaz). Yanıt: her metin için PageMatch[]. */
  | { type: "page:match"; texts: string[] };

export type RequestMessage = AiMessage | TermMessage;
/** Background → content script: sağ tık menüsünden "Firelingo ile çevir" seçildi (seçili metin için). */
export interface MenuMessage {
  type: "menu";
}

/** Content script → background: ayarlar sayfasını aç (sayfa betiği bunu kendisi yapamaz). */
export interface OpenOptionsMessage {
  type: "options:open";
}

export type PageMessage = RefreshMessage | RescanMessage | PageStateMessage | PenToggleMessage | MenuMessage;
export type Message = HelloMessage | PenSetMessage | OpenOptionsMessage | PageMessage | RequestMessage;

export interface HelloResponse {
  enabled: boolean;
  /** Kalem bu sekmede açık bırakılmış mı. */
  pen: boolean;
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
