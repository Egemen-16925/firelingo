/** Content script → background: "bu sayfada açık mıyım?" Yanıt: HelloResponse. */
export interface HelloMessage {
  type: "hello";
}

/** Background → content script: ayar değişti, durumunu yeniden sor. */
export interface RefreshMessage {
  type: "refresh";
}

/**
 * Ayarlar sayfası → background: kayıtlı API ayarlarıyla istek at. Yanıt: Result<…>.
 * Anahtar mesajda taşınmaz; background onu storage'dan okur.
 */
export type AiMessage =
  | { type: "ai:listModels" }
  | { type: "ai:testConnection" }
  | { type: "ai:modelTest"; previous?: [number, number] };

export type Message = HelloMessage | RefreshMessage | AiMessage;

export interface HelloResponse {
  enabled: boolean;
}

/** Hata nesneleri mesajla taşınamadığı için sonuç düz veri olarak döner. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
