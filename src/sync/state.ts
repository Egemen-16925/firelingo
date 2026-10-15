import { browser } from "wxt/browser";

// Drive eşitlemesinin kayıtları. Ayarlar sayfası yalnızca görünür durumu okur; gizli alanlar
// (gizli anahtar, oturum anahtarı) API anahtarları gibi vault ile şifrelidir ve yalnızca background çözer.
// Bu dosya hafiftir: ayarlar sayfası duo-terms'i içeren eşitleme kodunu yüklemeden okuyabilsin.
export const SYNC_STATE_KEY = "syncState";
export const SYNC_PRIVATE_KEY = "syncPrivate";

export interface SyncState {
  /** Google Cloud'daki masaüstü OAuth istemcisinin kimliği (gizli değil). */
  clientId: string;
  /** Gizli anahtar kayıtlı mı. */
  hasSecret: boolean;
  connected: boolean;
  email?: string;
  autoSync: boolean;
  busy: boolean;
  lastSyncAt?: number;
  lastError?: string;
  /** Son eşitlemede buluttan yeni veri geldi mi. */
  lastChanged?: boolean;
}

export interface SyncPrivate {
  clientSecretEnc?: string;
  refreshTokenEnc?: string;
  /** Son eşitlemedeki ortak verinin özeti; yerel veri değişmediyse eşitleme atlanır. */
  fingerprint?: string;
}

export const DEFAULT_SYNC_STATE: SyncState = { clientId: "", hasSecret: false, connected: false, autoSync: true, busy: false };

export async function getSyncState(): Promise<SyncState> {
  const stored = (await browser.storage.local.get(SYNC_STATE_KEY))[SYNC_STATE_KEY] as Partial<SyncState> | undefined;
  return { ...DEFAULT_SYNC_STATE, ...stored };
}

export async function getSyncPrivate(): Promise<SyncPrivate> {
  return ((await browser.storage.local.get(SYNC_PRIVATE_KEY))[SYNC_PRIVATE_KEY] as SyncPrivate | undefined) ?? {};
}
