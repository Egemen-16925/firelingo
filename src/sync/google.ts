import { browser } from "wxt/browser";

/**
 * Google girişi (OAuth 2 + PKCE) ve Drive'ın gizli uygulama klasörü (appDataFolder). DuoPDF'in
 * `src/sync/google.ts` dosyasından uyarlandı. Sunucu yok: istekler doğrudan tarayıcıdan Google'a gider.
 * Yalnızca uygulamanın kendi klasörüne erişim istenir; kullanıcının diğer Drive dosyaları görülemez.
 *
 * Giriş Firefox'un `identity.launchWebAuthFlow` penceresinde yapılır. Google, eklentinin varsayılan
 * dönüş adresini (alan sahipliği doğrulanamadığı için) kabul etmez; Firefox'un izin verdiği yerel
 * adres (`http://127.0.0.1/mozoauth2/…`) kullanılır. Bu, DuoPDF'in "masaüstü uygulaması" türündeki
 * OAuth istemcisiyle çalışır: aynı Google Cloud projesi, aynı Drive klasörü, aynı eşitleme dosyası.
 */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const SCOPES = ["openid", "email", DRIVE_SCOPE];
export const SYNC_FILE = "duopdf-sync.json";

/** Bağlanırken istenen adres izinleri (eklentinin isteğe bağlı izinlerinden). */
export const GOOGLE_ORIGINS = ["https://oauth2.googleapis.com/*", "https://www.googleapis.com/*"];

export const DRIVE_PERMISSION_MISSING =
  "Google'da Drive izni verilmedi. Yeniden bağlanırken izin ekranındaki \"Google Drive'daki kendi yapılandırma verilerini görme, oluşturma ve silme\" kutusunu işaretle (ya da \"Tümünü seç\").";
export const DRIVE_API_DISABLED =
  "Google Cloud projende Google Drive API kapalı. Google Cloud Console → APIs & Services → Library → \"Google Drive API\" → Enable; sonra birkaç dakika bekleyip \"Şimdi eşitle\"ye bas.";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface Tokens {
  accessToken: string;
  /** Erişim anahtarının bittiği an (ms). */
  expiresAt: number;
  refreshToken?: string;
  email?: string;
  /** Kullanıcının gerçekten verdiği izinler (Google her birini ayrı onaylatabilir). */
  scopes?: string[];
}

/** Drive izni eksik: bağlantı yeniden kurulmalı. */
export class DrivePermissionMissing extends Error {
  constructor() {
    super(DRIVE_PERMISSION_MISSING);
    this.name = "DrivePermissionMissing";
  }
}

/** Google'ın reddettiği oturum (iptal edilmiş ya da süresi dolmuş): yeniden bağlanmak gerekir. */
export class SignInRequired extends Error {
  constructor(message = "Google bağlantısının süresi dolmuş ya da iptal edilmiş. Yeniden bağlan.") {
    super(message);
    this.name = "SignInRequired";
  }
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** id_token içindeki e-posta (imza doğrulaması gerekmez: token doğrudan Google'dan geldi). */
export function emailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent([...atob(payload)].map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
    return JSON.parse(json).email;
  } catch {
    return undefined;
  }
}

/** Firefox'un Google için kullanılabilen yerel dönüş adresi. */
export function redirectUri(): string {
  const subdomain = new URL(browser.identity.getRedirectURL()).hostname.split(".")[0];
  return `http://127.0.0.1/mozoauth2/${subdomain}`;
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new SignInRequired();
    if (data.error === "invalid_client") throw new Error("Google istemci kimliği ya da gizli anahtarı hatalı.");
    throw new Error(`Google girişi başarısız (${res.status}): ${String(data.error_description ?? data.error ?? "")}`);
  }
  const email = emailFromIdToken(data.id_token as string | undefined);
  return {
    accessToken: String(data.access_token),
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    ...(data.refresh_token ? { refreshToken: String(data.refresh_token) } : {}),
    ...(typeof data.scope === "string" ? { scopes: data.scope.split(" ") } : {}),
    ...(email ? { email } : {}),
  };
}

/** Firefox'un giriş penceresinde Google girişini açar, izni bekler ve oturum anahtarlarını döndürür. */
export async function signIn(client: GoogleClient): Promise<Tokens> {
  const redirect = redirectUri();
  const { verifier, challenge } = await pkcePair();
  const state = randomString(16);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  }).toString();

  let responseUrl: string;
  try {
    responseUrl = (await browser.identity.launchWebAuthFlow({ url: url.toString(), interactive: true })) ?? "";
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(/cancel|closed|denied/i.test(reason) ? "Google bağlantısından vazgeçildi." : `Google girişi tamamlanamadı: ${reason}`);
  }
  if (!responseUrl) throw new Error("Google girişinden dönüş gelmedi.");
  const params = new URL(responseUrl).searchParams;
  if (params.get("state") !== state) throw new Error("Google'dan beklenmeyen bir yanıt geldi (state uyuşmuyor).");
  if (params.get("error")) {
    throw new Error(params.get("error") === "access_denied" ? "Google'da izin verilmedi." : `Google hatası: ${params.get("error")}`);
  }
  const code = params.get("code");
  if (!code) throw new Error("Google'dan izin kodu gelmedi.");

  const tokens = await tokenRequest({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirect,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  if (tokens.scopes && !tokens.scopes.includes(DRIVE_SCOPE)) {
    // Drive kutusu işaretlenmemiş: verilen izni geri al ki bir sonraki girişte izin ekranı yeniden sorsun.
    await revoke(tokens.refreshToken ?? tokens.accessToken);
    throw new DrivePermissionMissing();
  }
  if (!tokens.refreshToken) throw new Error("Google kalıcı oturum anahtarı vermedi; bağlantıyı kesip yeniden bağlan.");
  return tokens;
}

export function refreshAccess(client: GoogleClient, refreshToken: string): Promise<Tokens> {
  return tokenRequest({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/** Google'daki izni geri alır (bağlantıyı kesince). Hata olsa da yerel bağlantı kesilir. */
export async function revoke(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

/** Google'ın hata gövdesinden neden kodları ve mesaj (ör. SERVICE_DISABLED, insufficientPermissions). */
export function driveErrorInfo(text: string): { reasons: string[]; message: string } {
  try {
    const error = JSON.parse(text)?.error ?? {};
    const reasons = [
      ...(error.errors ?? []).map((e: { reason?: string }) => e.reason),
      ...(error.details ?? []).map((d: { reason?: string }) => d.reason),
      error.status,
    ].filter((r): r is string => typeof r === "string");
    return { reasons, message: typeof error.message === "string" ? error.message : text.slice(0, 200) };
  } catch {
    return { reasons: [], message: text.slice(0, 200) };
  }
}

async function driveRequest(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  } catch {
    throw new Error("Google Drive'a ulaşılamadı. İnternet bağlantını kontrol et.");
  }
  if (res.status === 401) throw new SignInRequired();
  if (!res.ok) {
    const { reasons, message } = driveErrorInfo(await res.text().catch(() => ""));
    if (reasons.some((r) => r === "SERVICE_DISABLED" || r === "accessNotConfigured") || /has not been used|is disabled/i.test(message)) {
      throw new Error(DRIVE_API_DISABLED);
    }
    if (res.status === 403 && (reasons.some((r) => /insufficient|SCOPE/i.test(r)) || /insufficient authentication scopes/i.test(message))) {
      throw new DrivePermissionMissing();
    }
    throw new Error(`Google Drive hatası (${res.status}): ${message}`);
  }
  return res;
}

/** Drive'daki dosya: kimlik ve her değişiklikte artan sürüm numarası. */
export interface DriveFile {
  id: string;
  version: string;
}

/** Uygulama klasöründeki eşitleme dosyası (yoksa null). */
export async function findSyncFile(token: string): Promise<DriveFile | null> {
  const url = new URL(FILES_URL);
  url.search = new URLSearchParams({ spaces: "appDataFolder", q: `name='${SYNC_FILE}'`, fields: "files(id,version)" }).toString();
  const data = (await (await driveRequest(token, url.toString())).json()) as { files?: DriveFile[] };
  return data.files?.[0] ?? null;
}

/** Dosyanın güncel sürüm numarası (yazmadan önce başkası yazdı mı diye bakmak için). */
export async function fileVersion(token: string, id: string): Promise<string> {
  return ((await (await driveRequest(token, `${FILES_URL}/${id}?fields=version`)).json()) as { version: string }).version;
}

export async function downloadSyncFile(token: string, id: string): Promise<string> {
  return (await driveRequest(token, `${FILES_URL}/${id}?alt=media`)).text();
}

/** Dosyayı ilk kez oluşturur (uygulama klasörüne) ya da içeriğini değiştirir. */
export async function uploadSyncFile(token: string, id: string | null, json: string): Promise<void> {
  if (id) {
    await driveRequest(token, `${UPLOAD_URL}/${id}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: json,
    });
    return;
  }
  const boundary = `firelingo-${randomString(12)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: SYNC_FILE, parents: ["appDataFolder"] }),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    json,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  await driveRequest(token, `${UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}
