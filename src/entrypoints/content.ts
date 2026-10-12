import type { HelloResponse, Message } from "@/shared/messages";

// Hafif bootstrap: her http/https sayfasına yüklenir, durumunu background'a sorar.
// Kapalıyken DOM'a dokunmaz ve sayfaya dinleyici eklemez.
export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    let active = false;

    function apply(enabled: boolean) {
      if (enabled === active) return;
      active = enabled;
      // Faz 2: asıl modül (baloncuk, işaretler) burada başlatılıp durdurulacak.
      console.debug(`[Firelingo] ${enabled ? "açık" : "kapalı"}: ${location.hostname}`);
    }

    async function sync() {
      const hello: Message = { type: "hello" };
      const response: HelloResponse | undefined = await browser.runtime.sendMessage(hello);
      if (response) apply(response.enabled);
    }

    browser.runtime.onMessage.addListener((message: Message) => {
      if (message.type === "refresh") void sync();
    });
    void sync();
  },
});
