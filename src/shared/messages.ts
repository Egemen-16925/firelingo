/** Content script → background: "bu sayfada açık mıyım?" Yanıt: HelloResponse. */
export interface HelloMessage {
  type: "hello";
}

/** Background → content script: ayar değişti, durumunu yeniden sor. */
export interface RefreshMessage {
  type: "refresh";
}

export type Message = HelloMessage | RefreshMessage;

export interface HelloResponse {
  enabled: boolean;
}
