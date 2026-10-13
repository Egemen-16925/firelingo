import { generate, listModels, testConnection, type AiTarget } from "@/ai/client";
import { AiError, describeAiError } from "@/ai/errors";
import { runModelTest } from "@/ai/modelTest";
import { translateSentencePrompt } from "@/ai/prompts/translateSentence";
import { wordMeaningPrompt } from "@/ai/prompts/wordMeaning";
import type { HelloResponse, Message, RequestMessage, Result } from "@/shared/messages";
import { hostnameOf } from "@/shared/siteRules";
import { getActiveTarget } from "@/storage/settings";
import { GLOBAL_ON_KEY, isEnabled, setTabOverride, SITE_RULES_KEY, TAB_PREFIX } from "@/storage/siteRules";
import { cached } from "@/terms/cache";
import { translateSentence } from "@/terms/sentences";
import { deleteTerm, findWord, markTerm } from "@/terms/terms";

/**
 * Çeviri için etkin sağlayıcı. Adres izni yoksa istek CORS'a takılır ve ağ hatası gibi
 * görünür; nedenini açıkça söylemek için izin önce denetlenir.
 */
async function translationTarget(): Promise<AiTarget> {
  const target = await getActiveTarget();
  let origin: string;
  try {
    const url = new URL(target.baseUrl.trim());
    origin = `${url.protocol}//${url.hostname}/*`;
  } catch {
    throw new AiError("config", "Sağlayıcının temel adresi geçerli değil. Ayarlar sayfasından düzelt.");
  }
  if (!(await browser.permissions.contains({ origins: [origin] }))) {
    throw new AiError("config", "Sağlayıcının adresine erişim izni yok. Ayarlar sayfasında “Bağlantıyı test et”e basıp izin ver.");
  }
  return target;
}

/** AI çağrıları yalnızca buradan çıkar; anahtar burada çözülür ve yanıta hiç girmez. */
async function handleRequest(message: RequestMessage): Promise<Result<unknown>> {
  try {
    return { ok: true, value: await respond(message) };
  } catch (e) {
    return { ok: false, error: describeAiError(e) };
  }
}

async function respond(message: RequestMessage): Promise<unknown> {
  switch (message.type) {
    case "ai:listModels":
      return listModels(await getActiveTarget());
    case "ai:testConnection":
      return testConnection(await getActiveTarget());
    case "ai:modelTest":
      return runModelTest(await getActiveTarget(), message.previous);
    case "word:find":
      return findWord(message.surface);
    case "word:meaning": {
      const input = { word: message.word, sentence: message.sentence };
      const { value, fromCache } = await cached(
        wordMeaningPrompt,
        input,
        async () => generate(await translationTarget(), wordMeaningPrompt, input),
        { force: message.force },
      );
      return { meaning: value, fromCache };
    }
    case "term:mark":
      return markTerm(message.input);
    case "term:delete":
      return deleteTerm(message.key);
    case "sentence:translate":
      return translateSentence(
        message.text,
        async (sentence) => generate(await translationTarget(), translateSentencePrompt, { sentence }),
        { force: message.force },
      );
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse: (response: unknown) => void) => {
    if (message.type === "refresh") return;

    if (message.type !== "hello") {
      void handleRequest(message).then(sendResponse);
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
