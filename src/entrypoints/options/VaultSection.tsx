import { useState } from "react";
import { changeVaultPassword, forgetVaultPassword } from "@/storage/settings";
import { lockVault, unlockVault, type VaultStatus } from "@/storage/vault";

const MIN_LENGTH = 4;

/** Anahtar güvenliği: varsayılan tarayıcı içi şifreleme, isteğe bağlı ana parola. */
export default function VaultSection({ status, onChange }: { status: VaultStatus; onChange: () => void }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | void>) => {
    setBusy(true);
    setError("");
    try {
      const problem = await action();
      if (problem) return setError(problem);
      setPassword("");
      setRepeat("");
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setNew = () =>
    run(async () => {
      if (password.length < MIN_LENGTH) return `Parola en az ${MIN_LENGTH} karakter olmalı.`;
      if (password !== repeat) return "İki parola aynı değil.";
      await changeVaultPassword(password);
    });

  const unlock = () => run(async () => ((await unlockVault(password)) ? undefined : "Parola yanlış."));

  const forget = () => {
    const ok = window.confirm(
      "Emin misiniz?\n\nParola kaldırılacak ve kayıtlı tüm API anahtarları silinecek. Sağlayıcı adresleri ve modeller kalır; anahtarları yeniden girmen gerekir.",
    );
    if (ok) void run(() => forgetVaultPassword().then(() => undefined));
  };

  return (
    <div className="card">
      <div className="field">
        <strong>Anahtar güvenliği</strong>
        <p className="hint">
          {status === "device" &&
            "API anahtarları bu tarayıcıda şifreli saklanıyor. İstersen ek olarak bir ana parola koyabilirsin: o zaman anahtarlar parola olmadan çözülemez, ama Firefox'u her açtığında parolayı bir kez girmen gerekir."}
          {status === "unlocked" && "Ana parola etkin · kilit açık (Firefox kapanınca yeniden kilitlenir)."}
          {status === "locked" && "Ana parola etkin · kilitli. Çeviri ve testler için kilidi aç."}
        </p>
      </div>

      {status === "device" && (
        <form className="inline" onSubmit={(e) => (e.preventDefault(), void setNew())}>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Ana parola"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Parola (tekrar)"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          <button disabled={busy || !password}>Parola belirle</button>
        </form>
      )}

      {status === "locked" && (
        <>
          <form className="inline" onSubmit={(e) => (e.preventDefault(), void unlock())}>
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Ana parola"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="primary" disabled={busy || !password}>
              Kilidi aç
            </button>
          </form>
          <div className="actions">
            <button disabled={busy} onClick={forget}>
              Parolayı unuttum
            </button>
          </div>
        </>
      )}

      {status === "unlocked" && (
        <div className="actions">
          <button disabled={busy} onClick={() => run(lockVault)}>
            Şimdi kilitle
          </button>
          <button disabled={busy} onClick={() => run(() => changeVaultPassword(null).then(() => undefined))}>
            Parolayı kaldır
          </button>
        </div>
      )}

      {error && (
        <p className="status error" role="alert">
          ✗ {error}
        </p>
      )}
    </div>
  );
}
