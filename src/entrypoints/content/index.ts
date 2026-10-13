import type { HelloResponse, Message, PageState } from "@/shared/messages";
import { startBubble, type Bubble } from "./bubble";
import { startMarks, type Marks } from "./marks";
import { startPen, type Pen } from "./pen";
import "./marks.css";

// Her http/https sayfasına yüklenir, durumunu background'a sorar.
// Kapalıyken DOM'a dokunmaz ve sayfaya dinleyici eklemez; açılınca baloncuğu, işaretleri ve kalemi başlatır.
export default defineContentScript({
  matches: ["*://*/*"],
  main() {
    let active: { bubble: Bubble; marks: Marks; pen: Pen } | undefined;

    function apply({ enabled, pen }: HelloResponse) {
      if (enabled === (active !== undefined)) return;
      if (enabled) {
        const bubble = startBubble();
        const notify = (on: boolean) => void browser.runtime.sendMessage({ type: "pen:set", on } satisfies Message);
        active = { bubble, marks: startMarks(bubble), pen: startPen(bubble, notify) };
        // Bu sekmede kalem açık bırakıldıysa yeni sayfada da açık gelir.
        if (pen) active.pen.set(true);
      } else {
        active?.pen.stop();
        active?.marks.stop();
        active?.bubble.stop();
        active = undefined;
      }
    }

    async function sync() {
      const hello: Message = { type: "hello" };
      const response: HelloResponse | undefined = await browser.runtime.sendMessage(hello);
      if (response) apply(response);
    }

    const state = (): PageState | undefined => active && { count: active.marks.count(), pen: active.pen.active() };

    browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse: (state: PageState | undefined) => void) => {
      switch (message.type) {
        case "refresh":
          void sync();
          break;
        case "rescan":
          active?.marks.scan();
          active?.pen.reload();
          break;
        case "pen:toggle":
          active?.pen.set(!active.pen.active());
          sendResponse(state());
          break;
        case "page:state":
          sendResponse(state());
          break;
      }
    });
    void sync();
  },
});
