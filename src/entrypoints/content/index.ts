import type { HelloResponse, Message } from "@/shared/messages";
import { startBubble } from "./bubble";

// Her http/https sayfasına yüklenir, durumunu background'a sorar.
// Kapalıyken DOM'a dokunmaz ve sayfaya dinleyici eklemez; açılınca baloncuğu başlatır.
export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    let stop: (() => void) | undefined;

    function apply(enabled: boolean) {
      if (enabled === (stop !== undefined)) return;
      if (enabled) {
        stop = startBubble();
      } else {
        stop?.();
        stop = undefined;
      }
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
