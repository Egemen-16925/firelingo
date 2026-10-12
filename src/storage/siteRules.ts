import { browser } from "wxt/browser";
import { resolveEnabled, type SiteRule } from "@/shared/siteRules";

// Kalıcı (storage.local): site kuralları ve global anahtar.
// Oturumluk (storage.session): sekme bazlı seçim; tarayıcı kapanınca silinir.
export const SITE_RULES_KEY = "siteRules";
export const GLOBAL_ON_KEY = "globalOn";
export const TAB_PREFIX = "tab:";

const tabKey = (tabId: number) => `${TAB_PREFIX}${tabId}`;

async function getSiteRules(): Promise<Record<string, SiteRule>> {
  const data = await browser.storage.local.get(SITE_RULES_KEY);
  return (data[SITE_RULES_KEY] as Record<string, SiteRule> | undefined) ?? {};
}

export async function getSiteRule(hostname: string): Promise<SiteRule | undefined> {
  return (await getSiteRules())[hostname];
}

/** `rule` verilmezse kural kaldırılır. */
export async function setSiteRule(hostname: string, rule?: SiteRule): Promise<void> {
  const rules = await getSiteRules();
  if (rule) rules[hostname] = rule;
  else delete rules[hostname];
  await browser.storage.local.set({ [SITE_RULES_KEY]: rules });
}

export async function getGlobalOn(): Promise<boolean> {
  const data = await browser.storage.local.get(GLOBAL_ON_KEY);
  return data[GLOBAL_ON_KEY] === true;
}

export async function setGlobalOn(on: boolean): Promise<void> {
  await browser.storage.local.set({ [GLOBAL_ON_KEY]: on });
}

export async function getTabOverride(tabId: number): Promise<boolean | undefined> {
  const data = await browser.storage.session.get(tabKey(tabId));
  return data[tabKey(tabId)] as boolean | undefined;
}

/** `on` verilmezse sekme seçimi kaldırılır. */
export async function setTabOverride(tabId: number, on?: boolean): Promise<void> {
  if (on === undefined) await browser.storage.session.remove(tabKey(tabId));
  else await browser.storage.session.set({ [tabKey(tabId)]: on });
}

/** Site kurallarını, global anahtarı ve sekme seçimlerini siler; başka hiçbir ayara dokunmaz. */
export async function resetSiteDefaults(): Promise<void> {
  await browser.storage.local.remove([SITE_RULES_KEY, GLOBAL_ON_KEY]);
  const session = await browser.storage.session.get(null);
  await browser.storage.session.remove(Object.keys(session).filter((key) => key.startsWith(TAB_PREFIX)));
}

export async function isEnabled(tabId: number, hostname: string): Promise<boolean> {
  const [rule, tabOverride, globalOn] = await Promise.all([getSiteRule(hostname), getTabOverride(tabId), getGlobalOn()]);
  return resolveEnabled({ rule, tabOverride, globalOn });
}
