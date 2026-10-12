import { listModels, testConnection } from "@/ai/client";
import { describeAiError } from "@/ai/errors";
import { runModelTest } from "@/ai/modelTest";
import type { AiMessage, HelloResponse, Message, Result } from "@/shared/messages";
import { hostnameOf } from "@/shared/siteRules";
import { getActiveTarget } from "@/storage/settings";
import { GLOBAL_ON_KEY, isEnabled, setTabOverride, SITE_RULES_KEY, TAB_PREFIX } from "@/storage/siteRules";

/** AI çağrıları yalnızca buradan çıkar; anahtar burada çözülür ve yanıta hiç girmez. */
async function handleAi(message: AiMessage): Promise<Result<unknown>> {
  try {
    const target = await getActiveTarget();
    switch (message.type) {
      case "ai:listModels":
        return { ok: true, value: await listModels(target) };
      case "ai:testConnection":
        return { ok: true, value: await testConnection(target) };
      case "ai:modelTest":
        return { ok: true, value: await runModelTest(target, message.previous) };
    }
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse: (response: unknown) => void) => {
    if (message.type === "refresh") return;

    if (message.type !== "hello") {
      void handleAi(message).then(sendResponse);
      return true;
    }

    // Content script durumunu sorar; yanıtla birlikte o sekmenin ikonu da güncellenir.
    const tabId = sender.tab?.id;
    const hostname = sender.url ? hostnameOf(sender.url) : null;
    if (tabId == null || !hostname) return;
    void (async () => {
      const enabled = await isEnabled(tabId, hostname);
      await browser.action.setIcon({ tabId, path: enabled ? "/icon/on.svg" : "/icon/off.svg" });
      sendResponse({ enabled } satisfies HelloResponse);
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
