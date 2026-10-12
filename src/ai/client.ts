import { z } from "zod";
import { AiError, errorForStatus } from "./errors";
import { extractJson, stripThinking } from "./json";
import type { ChatMessage, PromptTemplate } from "./prompts/types";

// DuoPDF'in aiClient'ından uyarlandı. İstekler background script'ten çıkar; izin verilen
// adreslere tarayıcı CORS uygulamaz ve API anahtarı sayfaya hiç girmez.

const DEFAULT_TIMEOUT_MS = 90_000;

/** OpenAI uyumlu bir uç: temel adres, anahtar (Ollama'da boş olabilir) ve model. */
export interface AiTarget {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
  /** 429 gelince kaç kez bekleyip yeniden denensin. */
  retries?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  status: number;
  ms: number;
  text: string;
  /** Sağlayıcı bildirdiyse toplam token kullanımı. */
  tokens?: number;
}

function endpoint(target: AiTarget, path: string): string {
  if (!target.baseUrl.trim()) throw new AiError("config", "Temel adres (base URL) girilmemiş.");
  return target.baseUrl.trim().replace(/\/+$/, "") + path;
}

function headers(target: AiTarget): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (target.apiKey.trim()) h.Authorization = `Bearer ${target.apiKey.trim()}`;
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: string; retryAfter: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return { status: res.status, body: await res.text(), retryAfter: res.headers.get("retry-after") };
  } catch (e) {
    if (controller.signal.aborted) {
      throw new AiError("timeout", `Yanıt ${Math.round(timeoutMs / 1000)} saniyede gelmedi (zaman aşımı).`);
    }
    throw new AiError(
      "network",
      "Sunucuya ulaşılamadı. İnternet bağlantısını ve temel adresi kontrol et.",
      undefined,
      String(e),
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(target: AiTarget, opts: ChatOptions): Promise<ChatResult> {
  if (!target.model.trim()) throw new AiError("config", "Model seçilmemiş.");
  const url = endpoint(target, "/chat/completions");
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let useResponseFormat = opts.jsonMode ?? false;
  let retriesLeft = opts.retries ?? 2;
  let attempt = 0;
  const started = performance.now();

  for (;;) {
    const body: Record<string, unknown> = {
      model: target.model.trim(),
      messages: opts.messages,
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false,
    };
    if (useResponseFormat) body.response_format = { type: "json_object" };

    const res = await send(url, { method: "POST", headers: headers(target), body: JSON.stringify(body) }, timeoutMs);

    if (res.status === 429 && retriesLeft > 0) {
      retriesLeft--;
      const waitSec = Number(res.retryAfter);
      await sleep(Number.isFinite(waitSec) && waitSec > 0 ? waitSec * 1000 : 2000 * 2 ** attempt++);
      continue;
    }
    // Bazı modeller response_format'ı desteklemez; o zaman şema zaten istemde, onsuz dene.
    if ((res.status === 400 || res.status === 422) && useResponseFormat) {
      useResponseFormat = false;
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw errorForStatus(res.status, res.body);

    let data: any;
    try {
      data = JSON.parse(res.body);
    } catch {
      throw new AiError("badResponse", "Sağlayıcıdan anlaşılmayan bir yanıt geldi.", res.status, res.body.slice(0, 300));
    }
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AiError(
        "badResponse",
        "Model boş yanıt döndü (uzun düşünme çıktısı yanıt sınırını doldurmuş olabilir).",
        res.status,
      );
    }
    const tokens: unknown = data?.usage?.total_tokens;
    return {
      status: res.status,
      ms: Math.round(performance.now() - started),
      text: stripThinking(content).text,
      tokens: typeof tokens === "number" ? tokens : undefined,
    };
  }
}

export interface PromptRun<T> extends ChatResult {
  data?: T;
  /** JSON ayrıştırılamadıysa veya şemaya uymadıysa açıklama. */
  validationError?: string;
}

function validate<T>(schema: z.ZodType<T>, text: string): { data?: T; error?: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { error: `JSON ayrıştırılamadı: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : { error: z.prettifyError(parsed.error) };
}

/**
 * Şablonu çalıştırır ve yanıtı şemayla doğrular. Doğrulama hatasını fırlatmaz,
 * sonuçta raporlar. `repair` açıksa geçersiz yanıtta hatayı modele gösterip bir kez yeniden dener.
 */
export async function runPrompt<I, O>(
  target: AiTarget,
  template: PromptTemplate<I, O>,
  input: I,
  opts: { repair?: boolean; retries?: number; timeoutMs?: number } = {},
): Promise<PromptRun<O>> {
  const messages = template.build(input);
  const common = { jsonMode: true, retries: opts.retries, timeoutMs: opts.timeoutMs };
  const first = await chat(target, { ...common, messages });
  const checked = validate(template.schema, first.text);
  if (checked.data !== undefined || !opts.repair) {
    return { ...first, data: checked.data, validationError: checked.error };
  }

  const second = await chat(target, {
    ...common,
    messages: [
      ...messages,
      { role: "assistant", content: first.text },
      {
        role: "user",
        content: `Yanıtın geçerli değildi:\n${checked.error}\nYalnızca istenen biçimde geçerli bir JSON nesnesi döndür.`,
      },
    ],
  });
  const rechecked = validate(template.schema, second.text);
  return { ...second, ms: first.ms + second.ms, data: rechecked.data, validationError: rechecked.error };
}

/** Şablonu çalıştırır; geçerli veri gelmezse anlaşılır bir AiError fırlatır. */
export async function generate<I, O>(target: AiTarget, template: PromptTemplate<I, O>, input: I): Promise<O> {
  const run = await runPrompt(target, template, input, { repair: true });
  if (run.data === undefined) {
    throw new AiError("badResponse", "Model geçerli bir yanıt üretemedi. Tekrar dene veya başka model seç.", run.status, run.validationError);
  }
  return run.data;
}

export async function listModels(target: AiTarget): Promise<string[]> {
  const res = await send(endpoint(target, "/models"), { method: "GET", headers: headers(target) }, 30_000);
  if (res.status < 200 || res.status >= 300) throw errorForStatus(res.status, res.body);
  try {
    const data = JSON.parse(res.body);
    const ids: string[] = (data?.data ?? data?.models ?? []).map((m: any) => m?.id ?? m?.name).filter(Boolean);
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  } catch {
    throw new AiError("badResponse", "Model listesi okunamadı.", res.status, res.body.slice(0, 300));
  }
}

export interface ConnectionReport {
  ok: boolean;
  message: string;
}

/**
 * Seçili modele çok küçük bir sohbet isteği atar. Yalnızca `/models` yetmez:
 * NVIDIA'da model listesi anahtarsız da döner, yani anahtarı doğrulamaz.
 */
export async function testConnection(target: AiTarget): Promise<ConnectionReport> {
  const res = await chat(target, {
    messages: [{ role: "user", content: "Reply with: OK" }],
    maxTokens: 16,
    retries: 0,
    timeoutMs: 60_000,
  }).catch((e) => {
    // Kısa yanıt sınırı düşünen modellerde boş yanıta yol açabilir; HTTP 200 geldiyse bağlantı sağlamdır.
    if (e instanceof AiError && e.kind === "badResponse" && e.status === 200) return null;
    // Hatalı anahtar anında reddedilir; zaman aşımı, isteğin kabul edilip modelde beklediğini gösterir.
    if (e instanceof AiError && e.kind === "timeout") return "timeout" as const;
    throw e;
  });
  const model = target.model.trim();
  if (res === "timeout") {
    return {
      ok: false,
      message:
        `Anahtar kabul edildi gibi görünüyor (yetki hatası gelmedi), ama "${model}" 60 saniyede yanıt vermedi. ` +
        "Model şu an yoğun olabilir; başka bir model seçip tekrar dene.",
    };
  }
  const ms = res ? ` ${res.ms} ms.` : "";
  return { ok: true, message: `Bağlantı başarılı: anahtar geçerli, "${model}" yanıt verdi.${ms}` };
}
