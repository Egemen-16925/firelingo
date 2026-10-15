import { browser } from "wxt/browser";
import { decryptSecret, encryptSecret } from "@/storage/vault";
import { localFingerprint, syncWithDrive } from "./drive";
import { DrivePermissionMissing, refreshAccess, revoke, signIn, SignInRequired, type GoogleClient } from "./google";
import { getSyncPrivate, getSyncState, SYNC_PRIVATE_KEY, SYNC_STATE_KEY, type SyncPrivate, type SyncState } from "./state";

// Drive eşitlemesinin oturumu ve zamanlaması. Yalnızca background'da çalışır.

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function patchState(patch: Partial<SyncState>): Promise<SyncState> {
  const next = { ...(await getSyncState()), ...patch };
  await browser.storage.local.set({ [SYNC_STATE_KEY]: next });
  return next;
}

async function patchPrivate(patch: Partial<SyncPrivate>): Promise<void> {
  await browser.storage.local.set({ [SYNC_PRIVATE_KEY]: { ...(await getSyncPrivate()), ...patch } });
}

/** Google Cloud'daki masaüstü istemcisinin kimliği ve gizli anahtarı. İstemci değişirse mevcut oturum kapanır. */
export async function saveClient(clientId: string, clientSecret: string): Promise<void> {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id.endsWith(".apps.googleusercontent.com")) throw new Error("İstemci kimliği \".apps.googleusercontent.com\" ile bitmeli.");
  if (!secret) throw new Error("Gizli anahtar boş olamaz.");
  const state = await getSyncState();
  const sameClient = state.clientId === id;
  await patchPrivate({ clientSecretEnc: await encryptSecret(secret), ...(sameClient ? {} : { refreshTokenEnc: undefined, fingerprint: undefined }) });
  await patchState({ clientId: id, hasSecret: true, ...(sameClient ? {} : { connected: false, email: undefined, lastError: undefined }) });
}

async function loadClient(): Promise<GoogleClient> {
  const state = await getSyncState();
  const secret = await decryptSecret((await getSyncPrivate()).clientSecretEnc ?? "");
  if (!state.clientId || !secret) throw new Error("Önce istemci kimliğini ve gizli anahtarı kaydet.");
  return { clientId: state.clientId, clientSecret: secret };
}

// Erişim anahtarı bellekte tutulur; background uyuyunca kaybolur ve oturum anahtarından yenilenir.
let access: { token: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (access && access.expiresAt - 60_000 > Date.now()) return access.token;
  const client = await loadClient();
  const refreshToken = await decryptSecret((await getSyncPrivate()).refreshTokenEnc ?? "");
  if (!refreshToken) throw new SignInRequired("Google'a bağlı değilsin.");
  try {
    const tokens = await refreshAccess(client, refreshToken);
    access = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    return access.token;
  } catch (e) {
    if (e instanceof SignInRequired) await forgetSession();
    throw e;
  }
}

async function forgetSession(): Promise<void> {
  access = null;
  await patchPrivate({ refreshTokenEnc: undefined, fingerprint: undefined });
  await patchState({ connected: false, email: undefined });
}

/** Firefox'un Google giriş penceresini açar; izin verilince ilk eşitlemeyi yapar. */
export async function connect(): Promise<void> {
  const client = await loadClient();
  await patchState({ lastError: undefined });
  const tokens = await signIn(client);
  access = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
  await patchPrivate({ refreshTokenEnc: await encryptSecret(tokens.refreshToken!) });
  await patchState({ connected: true, email: tokens.email });
  await syncNow();
}

/** Google'daki izni geri alır ve oturumu kapatır. Buluttaki dosyaya ve yerel veriye dokunmaz. */
export async function disconnect(): Promise<void> {
  const refreshToken = await decryptSecret((await getSyncPrivate()).refreshTokenEnc ?? "").catch(() => "");
  if (refreshToken) await revoke(refreshToken);
  await forgetSession();
  await patchState({ lastError: undefined });
}

export async function setAutoSync(on: boolean): Promise<void> {
  await patchState({ autoSync: on });
}

let running: Promise<void> | null = null;

/** Eşitler; aynı anda tek eşitleme çalışır (ikinci istek ilkini bekler). */
export function syncNow(): Promise<void> {
  running ??= (async () => {
    await patchState({ busy: true, lastError: undefined });
    try {
      const outcome = await syncWithDrive(await accessToken());
      await patchPrivate({ fingerprint: outcome.fingerprint });
      await patchState({ busy: false, lastSyncAt: Date.now(), lastChanged: outcome.changedLocally });
    } catch (e) {
      // Drive izni olmadan kurulmuş bağlantı: kesilir, kullanıcı izinle yeniden bağlanır.
      if (e instanceof DrivePermissionMissing) await forgetSession();
      await patchState({ busy: false, lastError: message(e) });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Otomatik eşitleme (açılışta, zamanlayıcıyla, kelime değişince). Bağlı değilse ya da kapalıysa
 * bir şey yapmaz. `onlyIfChanged`: yerel veri son eşitlemeden beri değişmediyse Drive'a gidilmez.
 */
export async function autoSync({ onlyIfChanged = false } = {}): Promise<void> {
  const state = await getSyncState();
  if (!state.connected || !state.autoSync) return;
  if (onlyIfChanged && (await getSyncPrivate()).fingerprint === (await localFingerprint())) return;
  await syncNow().catch(() => undefined);
}

/** Background her başladığında: yarıda kalmış bir eşitlemenin "sürüyor" işareti temizlenir. */
export async function resetBusy(): Promise<void> {
  if ((await getSyncState()).busy) await patchState({ busy: false });
}
