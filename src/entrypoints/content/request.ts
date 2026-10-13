import type { Result, TermMessage } from "@/shared/messages";

/** Background'a istek yollar; hata dönerse mesajıyla fırlatır. */
export async function request<T>(message: TermMessage): Promise<T> {
  const result: Result<T> = await browser.runtime.sendMessage(message);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
