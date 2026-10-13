import type { HelloResponse, Message } from "@/shared/messages";
import { startBubble, type Bubble } from "./bubble";
import { startMarks, type Marks } from "./marks";
import "./marks.css";

// Her http/https sayfasına yüklenir, durumunu background'a sorar.
// Kapalıyken DOM'a dokunmaz ve sayfaya dinleyici eklemez; açılınca baloncuğu ve işaretleri başlatır.
export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    let active: { bubble: Bubble; marks: Marks } | undefined;

    function apply(enabled: boolean) {
      if (enabled === (active !== undefined)) return;
      if (enabled) {
        const bubble = startBubble();
        active = { bubble, marks: startMarks(bubble) };
      } else {
        active?.marks.stop();
        active?.bubble.stop();
        active = undefined;
      }
    }

    async function sync() {
      const hello: Message = { type: "hello" };
      const response: HelloResponse | undefined = await browser.runtime.sendMessage(hello);
      if (response) apply(response.enabled);
    }

    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse: (count: number) => void) => {
      if (message.type === "refresh") void sync();
      else if (message.type === "rescan") active?.marks.scan();
      else if (message.type === "page:count") sendResponse(active?.marks.count() ?? 0);
    });
    void sync();
  },
});
