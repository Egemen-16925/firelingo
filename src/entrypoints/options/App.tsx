import { useEffect, useState } from "react";
import { getGlobalOn, resetSiteDefaults, setGlobalOn } from "@/storage/siteRules";
import AiSection from "./AiSection";
import MarksSection from "./MarksSection";
import PenSection from "./PenSection";

export default function App() {
  const [globalOn, setOn] = useState<boolean | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => void getGlobalOn().then(setOn), []);

  if (globalOn === null) return null;

  async function toggleGlobal(on: boolean) {
    await setGlobalOn(on);
    setOn(on);
    setNotice("");
  }

  async function reset() {
    const ok = window.confirm(
      "Emin misiniz?\n\nTüm site tercihleri (hep açık / hep kapalı) ve “Her sitede açık” ayarı silinecek. API ayarlarına dokunulmaz.",
    );
    if (!ok) return;
    await resetSiteDefaults();
    setOn(false);
    setNotice("Site tercihleri sıfırlandı.");
  }

  return (
    <main>
      <h1>Firelingo Ayarları</h1>

      <section>
        <h2>Genel ayarlar</h2>

        <div className="rows">
          <label className="row">
            <span>
              <strong>Her sitede açık</strong>
              <small>Bir site için ayrı tercih yoksa Firelingo tüm sitelerde açık olur.</small>
            </span>
            <input type="checkbox" role="switch" checked={globalOn} onChange={(e) => toggleGlobal(e.target.checked)} />
          </label>

          <div className="row">
            <span>
              <strong>Varsayılanları sıfırla</strong>
              <small>Sitelerin açık/kapalı tercihlerini ve “Her sitede açık” ayarını siler. API ayarlarına dokunmaz.</small>
            </span>
            <button onClick={reset}>Sıfırla</button>
          </div>
        </div>

        <p className="notice" role="status">
          {notice}
        </p>
      </section>

      <MarksSection />

      <PenSection />

      <AiSection />
    </main>
  );
}
