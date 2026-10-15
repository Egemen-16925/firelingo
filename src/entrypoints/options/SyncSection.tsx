import { useEffect, useState } from "react";
import type { Result, SyncMessage } from "@/shared/messages";
import { GOOGLE_ORIGINS } from "@/sync/google";
import { getSyncState, SYNC_STATE_KEY, type SyncState } from "@/sync/state";

async function send(message: SyncMessage): Promise<void> {
  const result: Result<unknown> = await browser.runtime.sendMessage(message);
  if (!result.ok) throw new Error(result.error);
}

function when(time: number): string {
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  return new Date(time).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

/** Google Drive üzerinden DuoPDF ile eşitleme: istemci bilgisi, bağlantı ve durum. */
export default function SyncSection() {
  const [state, setState] = useState<SyncState | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  // "… dk önce" yazısı sayfa açık kaldıkça güncel kalsın.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void getSyncState().then((s) => {
      setState(s);
      setClientId(s.clientId);
    });
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === "local" && SYNC_STATE_KEY in changes) void getSyncState().then(setState);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  if (!state) return null;

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setWorking(false);
  };

  const saveClient = () =>
    run(async () => {
      await send({ type: "sync:saveClient", clientId, clientSecret: secret });
      setSecret("");
      setEditing(false);
    });

  const connect = async () => {
    // İzin isteği tıklamanın içindeki ilk bekleme olmalı; yoksa Firefox reddeder.
    const granted = await browser.permissions.request({ origins: GOOGLE_ORIGINS });
    if (!granted) return setError("Google adreslerine erişim izni verilmedi; bağlanılamaz.");
    await run(() => send({ type: "sync:connect" }));
  };

  const showForm = editing || !state.hasSecret;
  const busy = working || state.busy;

  return (
    <section>
      <h2>Google Drive eşitlemesi</h2>
      <p className="hint lead">
        Kelimelerin, cümle çevirilerin ve silme izlerin DuoPDF ile Google Drive üzerinden eşitlenir. Drive'ın gizli uygulama klasöründe DuoPDF'in
        kullandığı dosya kullanılır; Firelingo diğer Drive dosyalarını göremez ve DuoPDF'in belgelerine, çizimlerine, sınav geçmişine dokunmaz.
      </p>

      <div className="card">
        {showForm ? (
          <>
            <label className="field">
              <span>İstemci kimliği (client ID)</span>
              <input spellCheck={false} placeholder="…apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </label>
            <label className="field">
              <span>Gizli anahtar (client secret)</span>
              <input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} />
            </label>
            <p className="hint">
              DuoPDF'te kullandığın Google Cloud projesindeki <strong>“Desktop app”</strong> türündeki OAuth istemcisi. Gizli anahtar bu tarayıcıda
              şifreli saklanır.
            </p>
            <div className="actions">
              <button className="primary" disabled={busy || !clientId.trim() || !secret.trim()} onClick={saveClient}>
                Kaydet
              </button>
              {state.hasSecret && <button onClick={() => setEditing(false)}>Vazgeç</button>}
            </div>
          </>
        ) : state.connected ? (
          <>
            <div className="field">
              <strong>Bağlı{state.email ? `: ${state.email}` : ""}</strong>
              <p className="hint">
                {state.busy
                  ? "Eşitleniyor…"
                  : state.lastSyncAt
                    ? `Son eşitleme ${when(state.lastSyncAt)}${state.lastChanged ? " (yeni veri geldi)" : ""}.`
                    : "Henüz eşitlenmedi."}
              </p>
            </div>
            <label className="row inline-row">
              <span>Otomatik eşitle (açılışta, 5 dakikada bir ve kelime değişince)</span>
              <input type="checkbox" role="switch" checked={state.autoSync} onChange={(e) => void run(() => send({ type: "sync:auto", on: e.target.checked }))} />
            </label>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => void run(() => send({ type: "sync:now" }))}>
                {state.busy ? "Eşitleniyor…" : "Şimdi eşitle"}
              </button>
              <button disabled={busy} onClick={() => void run(() => send({ type: "sync:disconnect" }))}>
                Bağlantıyı kes
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              İstemci kayıtlı: <code>{state.clientId}</code>
            </p>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => void connect()}>
                {busy ? "Bağlanıyor…" : "Google'a bağlan"}
              </button>
              <button disabled={busy} onClick={() => setEditing(true)}>
                İstemciyi değiştir
              </button>
            </div>
          </>
        )}

        {(error || state.lastError) && (
          <p className="status error" role="alert">
            ✗ {error || state.lastError}
          </p>
        )}
      </div>
    </section>
  );
}
