import { browser } from "wxt/browser";

// API anahtarları storage.local'a AES-GCM ile şifreli yazılır.
// - Varsayılan: tarayıcıda üretilen, dışa aktarılamayan bir cihaz anahtarı (IndexedDB).
// - İsteğe bağlı ana parola: anahtar paroladan türetilir (PBKDF2) ve diske hiç yazılmaz;
//   kilit açıkken yalnızca storage.session'da (bellekte) durur, tarayıcı kapanınca gider.
// Bir eklenti Windows DPAPI'yi çağıramaz; bu, tarayıcının verdiği araçlarla yapılabilen karşılığıdır.

export const VAULT_META_KEY = "vault";
const SESSION_KEY = "vaultKey";
const CHECK = "firelingo";
const ITERATIONS = 600_000;

/** Yalnızca ana parola varken saklanır: tuz ve parolayı doğrulamak için şifreli bir sabit. */
export interface VaultMeta {
  salt: string;
  check: string;
}

/** device: parola yok. locked / unlocked: parola var. */
export type VaultStatus = "device" | "locked" | "unlocked";

export class VaultLockedError extends Error {
  constructor() {
    super("API anahtarları parola ile kilitli. Ayarlar sayfasından kilidi aç.");
    this.name = "VaultLockedError";
  }
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Boş metin şifrelenmez (anahtarsız sağlayıcılar için). */
export async function sealWith(key: CryptoKey, plain: string): Promise<string> {
  if (!plain) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `${toB64(iv)}.${toB64(new Uint8Array(data))}`;
}

export async function openWith(key: CryptoKey, sealed: string): Promise<string> {
  if (!sealed) return "";
  const [iv = "", data = ""] = sealed.split(".");
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, key, fromB64(data)));
  } catch {
    throw new Error("API anahtarı çözülemedi; ayarlar sayfasından yeniden gir.");
  }
}

export async function derivePasswordKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    // storage.session'a konabilmesi için dışa aktarılabilir.
    true,
    ["encrypt", "decrypt"],
  );
}

export async function newPasswordKey(password: string): Promise<{ key: CryptoKey; meta: VaultMeta }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await derivePasswordKey(password, salt);
  return { key, meta: { salt: toB64(salt), check: await sealWith(key, CHECK) } };
}

/** Paroladan türetilen anahtar doğruysa döner, yanlışsa undefined. */
export async function checkPassword(password: string, meta: VaultMeta): Promise<CryptoKey | undefined> {
  const key = await derivePasswordKey(password, fromB64(meta.salt));
  try {
    return (await openWith(key, meta.check)) === CHECK ? key : undefined;
  } catch {
    return undefined;
  }
}

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("firelingo-vault", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = run(open.result.transaction("keys", mode).objectStore("keys"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
}

/** Dışa aktarılamayan cihaz anahtarı; ilk kullanımda üretilir. */
export async function deviceKey(): Promise<CryptoKey> {
  const existing = await idb<CryptoKey | undefined>("readonly", (store) => store.get("device"));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  // Ayarlar sayfası ve background aynı anda üretirse ilki kalır (add ikincide hata verir).
  await idb("readwrite", (store) => store.add(key, "device")).catch(() => undefined);
  return idb<CryptoKey>("readonly", (store) => store.get("device"));
}

async function getMeta(): Promise<VaultMeta | undefined> {
  return (await browser.storage.local.get(VAULT_META_KEY))[VAULT_META_KEY] as VaultMeta | undefined;
}

async function sessionKey(): Promise<CryptoKey | undefined> {
  const raw = (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] as string | undefined;
  if (!raw) return undefined;
  return crypto.subtle.importKey("raw", fromB64(raw), "AES-GCM", true, ["encrypt", "decrypt"]);
}

export async function rememberSessionKey(key: CryptoKey): Promise<void> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
  await browser.storage.session.set({ [SESSION_KEY]: toB64(raw) });
}

export async function lockVault(): Promise<void> {
  await browser.storage.session.remove(SESSION_KEY);
}

async function currentKey(): Promise<CryptoKey> {
  if (!(await getMeta())) return deviceKey();
  const key = await sessionKey();
  if (!key) throw new VaultLockedError();
  return key;
}

export async function vaultStatus(): Promise<VaultStatus> {
  if (!(await getMeta())) return "device";
  return (await sessionKey()) ? "unlocked" : "locked";
}

/** Parola doğruysa kilidi tarayıcı kapanana kadar açar. */
export async function unlockVault(password: string): Promise<boolean> {
  const meta = await getMeta();
  if (!meta) return true;
  const key = await checkPassword(password, meta);
  if (!key) return false;
  await rememberSessionKey(key);
  return true;
}

export const encryptSecret = async (plain: string) => sealWith(await currentKey(), plain);
export const decryptSecret = async (sealed: string) => openWith(await currentKey(), sealed);
