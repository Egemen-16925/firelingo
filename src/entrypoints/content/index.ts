import type { FrameHelloResponse, HelloResponse, Message, PageState } from "@/shared/messages";
import { startBubble, type Bubble } from "./bubble";
import { startMarks, type Marks } from "./marks";
import { startPen, type Pen } from "./pen";
import { pickFromText, readPick } from "./selection";
import "./marks.css";

// Her http/https sayfasına (ve sayfa içindeki çerçevelere) yüklenir, durumunu background'a sorar.
// Kapalıyken DOM'a dokunmaz ve sayfaya dinleyici eklemez; açılınca baloncuğu, işaretleri ve kalemi başlatır.
// Çerçevelerde (iframe) yalnızca fosforlu kalem çalışır: ana sayfada kalem açıkken çerçevenin içine de çizilebilir.
export default defineContentScript({
  matches: ["*://*/*"],
  allFrames: true,
  main() {
    if (window !== window.top) startFrame();
    else startPage();
  },
});

/** Eklenti yeniden yüklenince eski betik background'a ulaşamaz; sayfa konsoluna hata düşmesin. */
async function ask<T>(message: Message): Promise<T | undefined> {
  try {
    return await browser.runtime.sendMessage(message);
  } catch {
    return undefined;
  }
}

function startPage() {
  let active: { bubble: Bubble; marks: Marks; pen: Pen } | undefined;

  function apply({ enabled, pen }: HelloResponse) {
    if (enabled === (active !== undefined)) return;
    if (enabled) {
      const bubble = startBubble();
      const notify = ({ on, drawing }: { on: boolean; drawing: boolean }) => void ask({ type: "pen:set", on, drawing });
      active = { bubble, marks: startMarks(bubble), pen: startPen(bubble, notify) };
      // Bu sekmede kalem açık bırakıldıysa yeni sayfada da açık gelir.
      if (pen) active.pen.set(true);
    } else {
      // Kalem kapatılarak durdurulur ki çerçevelere de haber gitsin.
      active?.pen.set(false);
      active?.marks.stop();
      active?.bubble.stop();
      active = undefined;
    }
  }

  async function sync() {
    const response = await ask<HelloResponse>({ type: "hello" });
    if (response) apply(response);
  }

  // Sağ tık menüsü eklenti o sitede kapalıyken de çalışır: baloncuk yalnızca o seçim için açılır.
  // Seçim sayfada okunamazsa (metin kutusu, çerçeve) Firefox'un verdiği metin kullanılır.
  function translateSelection(text?: string) {
    const pick = readPick() ?? (text ? pickFromText(text) : null);
    if (!pick) return;
    let bubble = active?.bubble;
    if (!bubble) {
      const temporary = startBubble(() => queueMicrotask(() => temporary.stop()));
      bubble = temporary;
    }
    bubble.open(pick, "selection");
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
      case "menu":
        translateSelection(message.text);
        break;
    }
  });
  void sync();
}

/** Çerçeve: ana sayfada kalem açık ve çizim sürüyorsa burada da çizilir; başka hiçbir özellik çalışmaz. */
function startFrame() {
  let active: { bubble: Bubble; pen: Pen } | undefined;

  function apply(on: boolean) {
    if (on === (active !== undefined)) return;
    if (on) {
      const bubble = startBubble(undefined, { selection: false });
      const pen = startPen(bubble, () => undefined, { toolbar: false });
      pen.set(true);
      active = { bubble, pen };
    } else {
      active?.pen.stop();
      active?.bubble.stop();
      active = undefined;
    }
  }

  browser.runtime.onMessage.addListener((message: Message) => {
    if (message.type === "pen:frames") apply(message.active);
    else if (message.type === "rescan") active?.pen.reload();
  });
  void ask<FrameHelloResponse>({ type: "frame:hello" }).then((response) => response && apply(response.active));
}
