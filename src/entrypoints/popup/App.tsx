import { useEffect, useState } from "react";
import { hostnameOf, resolveEnabled, type SiteRule } from "@/shared/siteRules";
import { getGlobalOn, getSiteRule, getTabOverride, setSiteRule, setTabOverride } from "@/storage/siteRules";

interface View {
  tabId: number;
  /** http/https dışındaki sayfalarda null. */
  hostname: string | null;
  rule?: SiteRule;
  tabOverride?: boolean;
  globalOn: boolean;
}

async function loadView(): Promise<View | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return null;
  const hostname = tab.url ? hostnameOf(tab.url) : null;
  const [rule, tabOverride, globalOn] = await Promise.all([
    hostname ? getSiteRule(hostname) : undefined,
    getTabOverride(tab.id),
    getGlobalOn(),
  ]);
  return { tabId: tab.id, hostname, rule, tabOverride, globalOn };
}

const RULE_OPTIONS: { value: SiteRule | undefined; label: string }[] = [
  { value: undefined, label: "Sor" },
  { value: "always_on", label: "Hep açık" },
  { value: "always_off", label: "Hep kapalı" },
];

/** Durumun nereden geldiği: kullanıcı geçici mi kalıcı mı olduğunu buradan anlar. */
function scopeText({ hostname, rule, tabOverride, globalOn }: View): string {
  if (!hostname) return "Yalnızca http/https sitelerinde çalışır";
  if (rule) return "Bu site için kalıcı";
  if (tabOverride !== undefined) return "Yalnızca bu sekmede · geçici";
  return globalOn ? "" : "Varsayılan olarak kapalı";
}

export default function App() {
  const [view, setView] = useState<View | null>(null);
  const reload = () => loadView().then(setView);
  useEffect(() => void reload(), []);

  if (!view) return null;
  const { tabId, hostname, rule, globalOn } = view;
  const enabled = hostname !== null && resolveEnabled(view);
  const change = (action: Promise<void>) => action.then(reload);
  // Site için tercih yokken "Her sitede açık" geçerliyse seçici "Hep açık"ı gösterir.
  const shownRule = rule ?? (globalOn && view.tabOverride === undefined ? "always_on" : undefined);

  // Düğme her zaman geçicidir (yalnızca bu sekme). Site kuralı sekme ayarını ezdiği için varsa kaldırılır.
  function togglePower() {
    if (!hostname) return;
    change((rule ? setSiteRule(hostname) : Promise.resolve()).then(() => setTabOverride(tabId, !enabled)));
  }

  return (
    <main className={enabled ? "on" : undefined}>
      <header>
        <img src="/icon/on.svg" alt="" />
        <span>Firelingo</span>
        <button
          className="settings"
          aria-label="Ayarlar"
          title="Ayarlar"
          onClick={() => browser.runtime.openOptionsPage().then(() => window.close())}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h8M16 18h4" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="8" cy="12" r="2" />
            <circle cx="14" cy="18" r="2" />
          </svg>
        </button>
      </header>

      <p className="host">{hostname ?? "Bu sayfa desteklenmiyor"}</p>

      <button
        className="power"
        aria-pressed={enabled}
        aria-label={enabled ? "Bu sitede kapat" : "Bu sitede aç"}
        disabled={!hostname}
        onClick={togglePower}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v9" />
          <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
        </svg>
      </button>

      <div className="status">
        <strong>{enabled ? "Açık" : "Kapalı"}</strong>
        <span>{scopeText(view)}</span>
      </div>

      {hostname && (
        <section>
          <h2>Bu site için</h2>
          <div className="segments" role="radiogroup" aria-label="Bu site için kural">
            {RULE_OPTIONS.map((option) => (
              <button
                key={option.label}
                role="radio"
                aria-checked={shownRule === option.value}
                onClick={() => change(setSiteRule(hostname, option.value))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
