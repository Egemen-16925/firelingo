import type { Result, TermMessage } from "@/shared/messages";

/** Background'a istek yollar; hata dönerse mesajıyla fırlatır. */
export async function request<T>(message: TermMessage): Promise<T> {
  let result: Result<T> | undefined;
  try {
    result = await browser.runtime.sendMessage(message);
  } catch {
    // Eklenti güncellenince ya da yeniden yüklenince eski sayfa betiği background'a ulaşamaz.
    result = undefined;
  }
  if (!result) throw new Error("Firelingo'ya ulaşılamadı (eklenti güncellenmiş olabilir). Sayfayı yenileyip tekrar dene.");
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
