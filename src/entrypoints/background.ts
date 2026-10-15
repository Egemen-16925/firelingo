import { generate, listModels, testConnection, type AiTarget } from "@/ai/client";
import { AiError, describeAiError } from "@/ai/errors";
import { runModelTest } from "@/ai/modelTest";
import { translateSentencePrompt } from "@/ai/prompts/translateSentence";
import { wordMeaningPrompt } from "@/ai/prompts/wordMeaning";
import type { HelloResponse, Message, RequestMessage, Result } from "@/shared/messages";
import { hostnameOf } from "@/shared/siteRules";
import { MARK_SETTINGS_KEY } from "@/storage/markSettings";
import { PEN_SETTINGS_KEY } from "@/storage/penSettings";
import { getActiveTarget } from "@/storage/settings";
import { importData } from "@/sync/import";
import { GLOBAL_ON_KEY, isEnabled, setTabOverride, SITE_RULES_KEY, TAB_PREFIX } from "@/storage/siteRules";
import { cached } from "@/terms/cache";
import { translateSentence } from "@/terms/sentences";
import { TERM_PREFIX } from "@/terms/keys";
import { deleteTerm, findWord, markTerm, matchTexts, updateTerm } from "@/terms/terms";

/**
 * Çeviri için etkin sağlayıcı. Adres izni yoksa istek CORS'a takılır ve ağ hatası gibi
 * görünür; nedenini açıkça söylemek için izin önce denetlenir.
 */
async function translationTarget(): Promise<AiTarget> {
  const target = await getActiveTarget();
  if (!target.model.trim()) throw new AiError("config", "Çeviri için model seçilmemiş. Firelingo ayarlarından bir sağlayıcı ve model seç.");
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

// Kalemin açık olduğu sekmeler oturum boyunca hatırlanır; sayfa değişince kalem açık gelir.
const penKey = (tabId: number) => `pen:${tabId}`;

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
    case "term:update":
      return updateTerm(message.key, message.patch);
    case "term:delete":
      return deleteTerm(message.key);
    case "page:match":
      return matchTexts(message.texts);
    case "data:import":
      return importData(message.text);
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
    if (["refresh", "rescan", "page:state", "pen:toggle", "menu"].includes(message.type)) return;
    if (message.type === "options:open") return void browser.runtime.openOptionsPage();

    const tabId = sender.tab?.id;
    if (message.type === "pen:set") {
      if (tabId == null) return;
      if (message.on) void browser.storage.session.set({ [penKey(tabId)]: true });
      else void browser.storage.session.remove(penKey(tabId));
      return;
    }

    if (message.type !== "hello") {
      void handleRequest(message as RequestMessage).then(sendResponse);
      return true;
    }

    // Content script durumunu sorar; yanıtla birlikte o sekmenin ikonu da güncellenir.
    const hostname = sender.url ? hostnameOf(sender.url) : null;
    if (tabId == null || !hostname) return;
    void (async () => {
      const enabled = await isEnabled(tabId, hostname);
      await browser.action.setIcon({ tabId, path: enabled ? "/icon/on.svg" : "/icon/off.svg" });
      const pen = (await browser.storage.session.get(penKey(tabId)))[penKey(tabId)] === true;
      sendResponse({ enabled, pen } satisfies HelloResponse);
    })();
    return true;
  });

  // Ayar değişince açık sekmelerdeki content script'ler durumlarını yeniden sorar;
  // kelime listesi ya da işaret ayarları değişince sayfalarını yeniden tarar.
  browser.storage.onChanged.addListener(async (changes, area) => {
    const keys = Object.keys(changes);
    const settingsChanged =
      area === "local"
        ? keys.includes(SITE_RULES_KEY) || keys.includes(GLOBAL_ON_KEY)
        : area === "session" && keys.some((k) => k.startsWith(TAB_PREFIX));
    const termsChanged = area === "local" && keys.some((k) => k.startsWith(TERM_PREFIX) || k === MARK_SETTINGS_KEY || k === PEN_SETTINGS_KEY);
    if (!settingsChanged && !termsChanged) return;
    const notice: Message = { type: settingsChanged ? "refresh" : "rescan" };
    for (const tab of await browser.tabs.query({})) {
      // Content script'i olmayan sekmeler (about:, eklenti sayfaları) hata verir; yok sayılır.
      if (tab.id != null) browser.tabs.sendMessage(tab.id, notice).catch(() => undefined);
    }
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void setTabOverride(tabId);
    void browser.storage.session.remove(penKey(tabId));
  });

  // Sağ tık menüsü: seçili metinde tek öğe. Firefox tek öğeyi alt menüye koymadan doğrudan gösterir.
  // Arka plan betiği her uyandığında yeniden kurulur.
  void browser.contextMenus.removeAll().then(() => {
    browser.contextMenus.create({ id: "translate", title: "Firelingo ile çevir", contexts: ["selection"] });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id == null || info.menuItemId !== "translate") return;
    const menu: Message = { type: "menu" };
    browser.tabs.sendMessage(tab.id, menu).catch(() => undefined);
  });

  // Kısayol (varsayılan Alt+Shift+H): etkin sekmede fosforlu kalemi açar/kapatır.
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-pen") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const toggle: Message = { type: "pen:toggle" };
    if (tab?.id != null) browser.tabs.sendMessage(tab.id, toggle).catch(() => undefined);
  });
});
