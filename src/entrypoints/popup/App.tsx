import { useEffect, useRef, useState } from "react";
import type { Message, PageState } from "@/shared/messages";
import { hostnameOf, resolveEnabled, type SiteRule } from "@/shared/siteRules";
import { getGlobalOn, getSiteRule, getTabOverride, setSiteRule, setTabOverride } from "@/storage/siteRules";

interface View {
  tabId: number;
  /** http/https dışındaki sayfalarda null. */
  hostname: string | null;
  rule?: SiteRule;
  tabOverride?: boolean;
  globalOn: boolean;
  /** Sayfa betiği yoksa ya da eklenti o sayfada kapalıysa undefined. */
  page?: PageState;
}

async function loadView(): Promise<View | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return null;
  const hostname = tab.url ? hostnameOf(tab.url) : null;
  const state: Message = { type: "page:state" };
  const [rule, tabOverride, globalOn, page] = await Promise.all([
    hostname ? getSiteRule(hostname) : undefined,
    getTabOverride(tab.id),
    getGlobalOn(),
    browser.tabs.sendMessage(tab.id, state).catch(() => undefined) as Promise<PageState | undefined>,
  ]);
  return { tabId: tab.id, hostname, rule, tabOverride, globalOn, page };
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

  // Eklenti yeni açıldıysa sayfa betiği durumunu biraz sonra bildirir; gelene kadar birkaç kez yeniden sorulur.
  const retries = useRef(0);
  const waiting = view != null && view.hostname !== null && resolveEnabled(view) && !view.page;
  useEffect(() => {
    if (!waiting) return void (retries.current = 0);
    if (retries.current++ >= 10) return;
    const timer = setTimeout(reload, 150);
    return () => clearTimeout(timer);
  }, [view]);

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

  // Kalem açılınca popup kapanır ki sayfada hemen çizilebilsin.
  async function togglePen() {
    const toggle: Message = { type: "pen:toggle" };
    const page: PageState | undefined = await browser.tabs.sendMessage(tabId, toggle).catch(() => undefined);
    if (page?.pen) window.close();
    else await reload();
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
        {enabled && view.page && <span>Bu sayfada {view.page.count} işaretli kelime</span>}
      </div>

      {enabled && view.page && (
        <button className="pen" aria-pressed={view.page.pen} onClick={togglePen}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h5l10-10-5-5L4 15v5z" />
            <path d="M13 6l5 5" />
          </svg>
          Fosforlu kalem: {view.page.pen ? "Açık" : "Kapalı"}
        </button>
      )}

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
