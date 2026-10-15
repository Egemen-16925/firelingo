import { generate, listModels, testConnection, type AiTarget } from "@/ai/client";
import { AiError, describeAiError } from "@/ai/errors";
import { runModelTest } from "@/ai/modelTest";
import { translateSentencePrompt } from "@/ai/prompts/translateSentence";
import { wordMeaningPrompt } from "@/ai/prompts/wordMeaning";
import type { FrameHelloResponse, HelloResponse, Message, RequestMessage, Result } from "@/shared/messages";
import { hostnameOf } from "@/shared/siteRules";
import { MARK_SETTINGS_KEY } from "@/storage/markSettings";
import { PEN_SETTINGS_KEY } from "@/storage/penSettings";
import { getActiveTarget } from "@/storage/settings";
import { importData } from "@/sync/import";
import { autoSync, connect, disconnect, resetBusy, saveClient, setAutoSync, syncNow } from "@/sync/manager";
import { OCCURRENCE_PREFIX, SENTENCE_PREFIX, TOMBSTONE_PREFIX } from "@/terms/keys";
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

const SYNC_ALARM = "firelingo-sync";

// Kalemin açık olduğu sekmeler oturum boyunca hatırlanır; sayfa değişince kalem açık gelir.
// Değer `{ drawing }`: panelden duraklatıldıysa çerçevelerde de çizilmez.
const penKey = (tabId: number) => `pen:${tabId}`;

async function penOf(tabId: number): Promise<{ drawing: boolean } | undefined> {
  const value = (await browser.storage.session.get(penKey(tabId)))[penKey(tabId)];
  // Eski sürüm `true` yazıyordu.
  return value === true ? { drawing: true } : (value as { drawing: boolean } | undefined);
}

/** Yalnızca sekmenin ana sayfasına (çerçevelere değil) mesaj. */
const toPage = (tabId: number, message: Message) => browser.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(() => undefined);

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
    case "data:import": {
      const summary = await importData(message.text);
      // Kullanıcı bilerek içe aktardı: Drive'a beklemeden gitsin (kelime işaretlemedeki 10 sn gecikme yok).
      void autoSync();
      return summary;
    }
    case "sync:saveClient":
      return saveClient(message.clientId, message.clientSecret);
    case "sync:connect":
      return connect();
    case "sync:disconnect":
      return disconnect();
    case "sync:now":
      return syncNow();
    case "sync:auto":
      return setAutoSync(message.on);
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
    if (["refresh", "rescan", "page:state", "pen:toggle", "menu", "pen:frames"].includes(message.type)) return;
    if (message.type === "options:open") return void browser.runtime.openOptionsPage();
    if (message.type === "list:open") return void browser.tabs.create({ url: browser.runtime.getURL("/sidepanel.html?page") });

    const tabId = sender.tab?.id;
    if (message.type === "pen:set") {
      if (tabId == null) return;
      if (message.on) void browser.storage.session.set({ [penKey(tabId)]: { drawing: message.drawing } });
      else void browser.storage.session.remove(penKey(tabId));
      // Sekmedeki çerçevelere (iframe) haber: kalem açık ve çizim sürüyorsa onlarda da çizilir.
      const frames: Message = { type: "pen:frames", active: message.on && message.drawing };
      browser.tabs.sendMessage(tabId, frames).catch(() => undefined);
      return;
    }

    if (message.type === "frame:hello") {
      if (tabId == null) return;
      void penOf(tabId).then((pen) => sendResponse({ active: pen?.drawing === true } satisfies FrameHelloResponse));
      return true;
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
      const pen = (await penOf(tabId)) !== undefined;
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
      // Yalnızca kalem ayarı değiştiyse çerçevelerdeki kalem de yeni rengi alsın.
      if (tab.id == null) continue;
      if (keys.includes(PEN_SETTINGS_KEY)) browser.tabs.sendMessage(tab.id, notice).catch(() => undefined);
      else void toPage(tab.id, notice);
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
    // Seçili metin de gönderilir: metin kutusundaki ya da çerçevedeki seçim sayfadan okunamaz.
    void toPage(tab.id, { type: "menu", text: info.selectionText });
  });

  // Google Drive eşitlemesi (bağlıysa ve açıksa): açılışta, 5 dakikada bir ve kelime verisi değişince ~10 sn sonra.
  void resetBusy();
  browser.runtime.onStartup.addListener(() => void autoSync());
  // Yalnızca yoksa kurulur: her uyanışta yeniden kurmak süreyi sıfırlar ve sayfa gezerken hiç çalmayabilir.
  void browser.alarms.get(SYNC_ALARM).then((alarm) => {
    if (!alarm) void browser.alarms.create(SYNC_ALARM, { periodInMinutes: 5 });
  });
  browser.alarms.onAlarm.addListener((alarm) => alarm.name === SYNC_ALARM && void autoSync());
  let pending: ReturnType<typeof setTimeout> | undefined;
  browser.storage.onChanged.addListener((changes, area) => {
    const learning = [TERM_PREFIX, OCCURRENCE_PREFIX, SENTENCE_PREFIX, TOMBSTONE_PREFIX];
    if (area !== "local" || !Object.keys(changes).some((key) => learning.some((prefix) => key.startsWith(prefix)))) return;
    clearTimeout(pending);
    pending = setTimeout(() => void autoSync({ onlyIfChanged: true }), 10_000);
  });

  // Kısayol (varsayılan Alt+Shift+H): etkin sekmede fosforlu kalemi açar/kapatır.
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-pen") return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) void toPage(tab.id, { type: "pen:toggle" });
  });
});
