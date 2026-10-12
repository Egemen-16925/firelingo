import { browser } from "wxt/browser";
import type { AiTarget } from "@/ai/client";
import { AiError } from "@/ai/errors";
import {
  decryptSecret,
  deviceKey,
  encryptSecret,
  lockVault,
  newPasswordKey,
  rememberSessionKey,
  sealWith,
  VAULT_META_KEY,
} from "./vault";

/** Sağlayıcı ön ayarları: temel adresi doldurur. "custom" adresi kullanıcıya bırakır. */
export const PRESETS = [
  { id: "nvidia", name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "ollama", name: "Ollama (yerel)", baseUrl: "http://localhost:11434/v1" },
  { id: "custom", name: "Özel", baseUrl: "" },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

/** Kayıtlı bir sağlayıcı; her biri kendi adresini, anahtarını ve modelini tutar. */
export interface Provider {
  id: string;
  name: string;
  preset: PresetId;
  baseUrl: string;
  /** Şifreli anahtar (vault.ts); düz metin hiçbir zaman saklanmaz. Anahtar yoksa boş. */
  apiKeyEnc: string;
  model: string;
}

export interface AiSettings {
  providers: Provider[];
  /** Çeviride kullanılan sağlayıcı. */
  activeId: string | null;
}

const AI_KEY = "aiSettings";
export const NEW_PROVIDER_NAME = "Yeni sağlayıcı";

const defaultSettings = (): AiSettings => ({
  providers: [{ id: "p1", name: PRESETS[0].name, preset: "nvidia", baseUrl: PRESETS[0].baseUrl, apiKeyEnc: "", model: "" }],
  activeId: "p1",
});

export async function getAiSettings(): Promise<AiSettings> {
  const stored = (await browser.storage.local.get(AI_KEY))[AI_KEY] as AiSettings | undefined;
  return stored?.providers ? stored : defaultSettings();
}

// Değişiklikler sırayla uygulanır: her biri güncel kaydı okur, değiştirir, yazar.
let queue: Promise<unknown> = Promise.resolve();

function mutate(change: (settings: AiSettings) => AiSettings | Promise<AiSettings>): Promise<AiSettings> {
  const run = queue.then(async () => {
    const next = await change(await getAiSettings());
    await browser.storage.local.set({ [AI_KEY]: next });
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Bekleyen kayıtlar bitince çözülür (test isteği göndermeden önce beklenir). */
export const whenSaved = (): Promise<unknown> => queue;

const patchProvider = (settings: AiSettings, id: string, patch: Partial<Provider>): AiSettings => ({
  ...settings,
  providers: settings.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

export const updateProvider = (id: string, patch: Partial<Omit<Provider, "id" | "apiKeyEnc">>) =>
  mutate((settings) => patchProvider(settings, id, patch));

export const setProviderKey = (id: string, apiKey: string) =>
  mutate(async (settings) => patchProvider(settings, id, { apiKeyEnc: await encryptSecret(apiKey.trim()) }));

/** Yeni sağlayıcı ekler ve etkin yapar. */
export const addProvider = () =>
  mutate((settings) => {
    const provider: Provider = { id: crypto.randomUUID(), name: NEW_PROVIDER_NAME, preset: "custom", baseUrl: "", apiKeyEnc: "", model: "" };
    return { providers: [...settings.providers, provider], activeId: provider.id };
  });

export const removeProvider = (id: string) =>
  mutate((settings) => {
    const providers = settings.providers.filter((p) => p.id !== id);
    return { providers, activeId: settings.activeId === id ? (providers[0]?.id ?? null) : settings.activeId };
  });

export const setActiveProvider = (id: string) => mutate((settings) => ({ ...settings, activeId: id }));

/** Etkin sağlayıcı, anahtarı çözülmüş olarak. Yalnızca background'da kullanılır. */
export async function getActiveTarget(): Promise<AiTarget> {
  const { providers, activeId } = await getAiSettings();
  const provider = providers.find((p) => p.id === activeId);
  if (!provider) throw new AiError("config", "Sağlayıcı seçilmemiş. Ayarlar sayfasından bir sağlayıcı ekle.");
  return { baseUrl: provider.baseUrl, model: provider.model, apiKey: await decryptSecret(provider.apiKeyEnc) };
}

/**
 * Ana parolayı belirler (ya da `null` ile kaldırır): tüm anahtarlar eski anahtarla çözülüp
 * yenisiyle şifrelenir. Kilit açıkken çağrılmalıdır.
 */
export const changeVaultPassword = (password: string | null) =>
  mutate(async (settings) => {
    const plain = await Promise.all(settings.providers.map((p) => decryptSecret(p.apiKeyEnc)));
    const next = password ? await newPasswordKey(password) : { key: await deviceKey(), meta: undefined };
    const providers = await Promise.all(
      settings.providers.map(async (p, i) => ({ ...p, apiKeyEnc: await sealWith(next.key, plain[i]!) })),
    );
    if (next.meta) {
      await browser.storage.local.set({ [VAULT_META_KEY]: next.meta });
      await rememberSessionKey(next.key);
    } else {
      await browser.storage.local.remove(VAULT_META_KEY);
      await lockVault();
    }
    return { ...settings, providers };
  });

/** Parola unutulduysa: kayıtlı anahtarlar silinir, parola kaldırılır. Adresler ve modeller kalır. */
export const forgetVaultPassword = () =>
  mutate(async (settings) => {
    await browser.storage.local.remove(VAULT_META_KEY);
    await lockVault();
    return { ...settings, providers: settings.providers.map((p) => ({ ...p, apiKeyEnc: "" })) };
  });
