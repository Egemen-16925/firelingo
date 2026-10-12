import type { HelloResponse, Message } from "@/shared/messages";
import { hostnameOf } from "@/shared/siteRules";
import { GLOBAL_ON_KEY, isEnabled, setTabOverride, SITE_RULES_KEY, TAB_PREFIX } from "@/storage/siteRules";

export default defineBackground(() => {
  // Content script durumunu sorar; yanıtla birlikte o sekmenin ikonu da güncellenir.
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse: (response: HelloResponse) => void) => {
    const tabId = sender.tab?.id;
    const hostname = sender.url ? hostnameOf(sender.url) : null;
    if (message.type !== "hello" || tabId == null || !hostname) return;
    void (async () => {
      const enabled = await isEnabled(tabId, hostname);
      await browser.action.setIcon({ tabId, path: enabled ? "/icon/on.svg" : "/icon/off.svg" });
      sendResponse({ enabled });
    })();
    return true;
  });

  // Ayar değişince açık sekmelerdeki content script'ler durumlarını yeniden sorar.
  browser.storage.onChanged.addListener(async (changes, area) => {
    const keys = Object.keys(changes);
    const relevant =
      area === "local"
        ? keys.includes(SITE_RULES_KEY) || keys.includes(GLOBAL_ON_KEY)
        : area === "session" && keys.some((k) => k.startsWith(TAB_PREFIX));
    if (!relevant) return;
    const refresh: Message = { type: "refresh" };
    for (const tab of await browser.tabs.query({})) {
      // Content script'i olmayan sekmeler (about:, eklenti sayfaları) hata verir; yok sayılır.
      if (tab.id != null) browser.tabs.sendMessage(tab.id, refresh).catch(() => undefined);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => setTabOverride(tabId));
});
