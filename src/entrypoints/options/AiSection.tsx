import { useEffect, useState } from "react";
import type { ConnectionReport } from "@/ai/client";
import type { ModelTestResult } from "@/ai/modelTest";
import type { AiMessage, Result } from "@/shared/messages";
import {
  addProvider,
  getAiSettings,
  NEW_PROVIDER_NAME,
  PRESETS,
  removeProvider,
  setActiveProvider,
  setProviderKey,
  updateProvider,
  whenSaved,
  type AiSettings,
  type PresetId,
  type Provider,
} from "@/storage/settings";
import { decryptSecret, vaultStatus, type VaultStatus } from "@/storage/vault";
import VaultSection from "./VaultSection";

type Busy = "" | "models" | "connection" | "test";
type Status = { ok: boolean; text: string } | null;

export default function AiSection() {
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [vault, setVault] = useState<VaultStatus>("device");
  // Etkin sağlayıcının çözülmüş anahtarı; yalnızca bu sayfanın belleğinde durur.
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>("");
  const [status, setStatus] = useState<Status>(null);
  const [test, setTest] = useState<ModelTestResult | null>(null);

  /** Kayıtlı durumu yeniden okur (sağlayıcı değişince, kilit açılınca). */
  const reload = async () => {
    await whenSaved();
    const [next, nextVault] = await Promise.all([getAiSettings(), vaultStatus()]);
    const current = next.providers.find((p) => p.id === next.activeId);
    let key = "";
    let problem: Status = null;
    if (current && nextVault !== "locked") {
      try {
        key = await decryptSecret(current.apiKeyEnc);
      } catch (e) {
        problem = { ok: false, text: e instanceof Error ? e.message : String(e) };
      }
    }
    setSettings(next);
    setVault(nextVault);
    setKeyDraft(key);
    setShowKey(false);
    setModels([]);
    setTest(null);
    setStatus(problem);
  };
  useEffect(() => void reload(), []);

  if (!settings) return null;
  const active = settings.providers.find((p) => p.id === settings.activeId);
  const locked = vault === "locked";

  /** Alanı hemen ekranda günceller, kaydı sıraya koyar. */
  const edit = (provider: Provider, patch: Partial<Omit<Provider, "id" | "apiKeyEnc">>) => {
    setSettings({ ...settings, providers: settings.providers.map((p) => (p.id === provider.id ? { ...p, ...patch } : p)) });
    void updateProvider(provider.id, patch);
  };

  const choosePreset = (provider: Provider, id: PresetId) => {
    const preset = PRESETS.find((p) => p.id === id)!;
    const previous = PRESETS.find((p) => p.id === provider.preset)!;
    // Ad kullanıcı tarafından değiştirilmediyse ön ayarın adını alır.
    const rename = provider.name === previous.name || provider.name === NEW_PROVIDER_NAME;
    edit(provider, {
      preset: id,
      baseUrl: id === "custom" ? provider.baseUrl : preset.baseUrl,
      ...(rename && { name: preset.name }),
    });
    setModels([]);
  };

  const remove = (provider: Provider) => {
    if (window.confirm(`“${provider.name}” sağlayıcısı ve kayıtlı anahtarı silinsin mi?`)) void removeProvider(provider.id).then(reload);
  };

  /** Sağlayıcının adresi için izin ister, bekleyen kayıtları bekler ve isteği background'a yollar. */
  const ask = async <T,>(kind: Busy, provider: Provider, message: AiMessage): Promise<T | undefined> => {
    let url: URL;
    try {
      url = new URL(provider.baseUrl.trim());
    } catch {
      setStatus({ ok: false, text: "Temel adres geçerli bir URL değil." });
      return;
    }
    setStatus(null);
    // İzin isteği kullanıcı tıklamasının içindeki ilk bekleme olmalı; yoksa Firefox reddeder.
    const granted = await browser.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
    if (!granted) {
      setStatus({ ok: false, text: `${url.hostname} adresine erişim izni verilmedi; istek gönderilemez.` });
      return;
    }
    setBusy(kind);
    try {
      await whenSaved();
      const result: Result<T> = await browser.runtime.sendMessage(message);
      if (result.ok) return result.value;
      setStatus({ ok: false, text: result.error });
    } finally {
      setBusy("");
    }
  };

  const loadModels = async (provider: Provider) => {
    const list = await ask<string[]>("models", provider, { type: "ai:listModels" });
    if (!list) return;
    setModels(list);
    setStatus({ ok: true, text: list.length ? `${list.length} model listelendi; model kutusuna yazarak arayabilirsin.` : "Liste boş; model adını elle yaz." });
  };

  const testConnection = async (provider: Provider) => {
    const report = await ask<ConnectionReport>("connection", provider, { type: "ai:testConnection" });
    if (report) setStatus({ ok: report.ok, text: report.message });
  };

  const runTest = async (provider: Provider) => {
    const result = await ask<ModelTestResult>("test", provider, { type: "ai:modelTest", previous: test?.picked });
    if (result) setTest(result);
  };

  return (
    <section>
      <h2>Yapay zekâ sağlayıcıları</h2>

      <div className="tabs" role="tablist" aria-label="Sağlayıcılar">
        {settings.providers.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === settings.activeId}
            onClick={() => p.id !== settings.activeId && void setActiveProvider(p.id).then(reload)}
          >
            {p.name || "Adsız"}
          </button>
        ))}
        <button className="add" onClick={() => void addProvider().then(reload)}>
          + Ekle
        </button>
      </div>
      <p className="hint">Seçili sağlayıcı çeviride kullanılır. Her sağlayıcı kendi anahtarını ve modelini hatırlar.</p>

      {active && (
        <div className="card">
          <div className="pair">
            <label className="field">
              <span>Sağlayıcı</span>
              <select value={active.preset} onChange={(e) => choosePreset(active, e.target.value as PresetId)}>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Ad</span>
              <input value={active.name} onChange={(e) => edit(active, { name: e.target.value })} />
            </label>
          </div>

          <label className="field">
            <span>Temel adres (base URL)</span>
            <input
              type="url"
              spellCheck={false}
              placeholder="https://…/v1"
              value={active.baseUrl}
              onChange={(e) => edit(active, { baseUrl: e.target.value, preset: "custom" })}
            />
          </label>
          {active.preset === "ollama" && (
            <p className="hint">Ollama eklentiden gelen istekleri reddederse (403), Ollama'yı OLLAMA_ORIGINS ayarıyla başlatman gerekebilir.</p>
          )}

          <div className="field">
            <label htmlFor="api-key">API anahtarı</label>
            <div className="inline">
              <input
                id="api-key"
                type={showKey ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                disabled={locked}
                placeholder={locked ? "Kilitli — aşağıdan kilidi aç" : ""}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onBlur={() => void setProviderKey(active.id, keyDraft)}
              />
              <button disabled={locked} onClick={() => setShowKey(!showKey)}>
                {showKey ? "Gizle" : "Göster"}
              </button>
            </div>
            <p className="hint">Anahtar bu tarayıcıda şifreli saklanır ve yalnızca bu sağlayıcıya gönderilir.</p>
          </div>

          <div className="field">
            <label htmlFor="model">Model</label>
            <div className="inline">
              <input
                id="model"
                list="model-list"
                spellCheck={false}
                placeholder="model kimliği"
                value={active.model}
                onChange={(e) => edit(active, { model: e.target.value })}
              />
              <datalist id="model-list">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <button disabled={busy !== ""} onClick={() => loadModels(active)}>
                {busy === "models" ? "Listeleniyor…" : "Modelleri listele"}
              </button>
            </div>
          </div>

          <div className="actions">
            <button className="primary" disabled={busy !== ""} onClick={() => testConnection(active)}>
              {busy === "connection" ? "Test ediliyor…" : "Bağlantıyı test et"}
            </button>
            <button disabled={busy !== ""} onClick={() => runTest(active)}>
              {busy === "test" ? "Model deneniyor…" : test ? "Tekrar dene (başka örnek)" : "Modeli test et"}
            </button>
            <button className="danger" disabled={busy !== ""} onClick={() => remove(active)}>
              Sağlayıcıyı sil
            </button>
          </div>

          {status && (
            <p className={status.ok ? "status ok" : "status error"} role="status">
              {status.ok ? "✓ " : "✗ "}
              {status.text}
            </p>
          )}

          {test?.outcomes.map((o) => (
            <article key={o.title} className="outcome">
              <h3>{o.title}</h3>
              <p className="sample">{o.input}</p>
              <p className="meta">
                {o.status != null && <span>HTTP {o.status}</span>}
                {o.ms != null && <span>{o.ms} ms</span>}
                <span className={o.jsonValid ? "ok" : "error"}>JSON {o.jsonValid ? "✓" : "✗"}</span>
                {o.tokens != null && <span>{o.tokens} token</span>}
              </p>
              {o.output && <pre>{o.output}</pre>}
              {o.error && <p className="status error">{o.error}</p>}
            </article>
          ))}
        </div>
      )}

      <VaultSection status={vault} onChange={() => void reload()} />
    </section>
  );
}
