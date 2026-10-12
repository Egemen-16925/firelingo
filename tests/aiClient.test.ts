import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat, generate, listModels, runPrompt, testConnection, type AiTarget } from "../src/ai/client";
import { AiError, describeAiError } from "../src/ai/errors";
import { runModelTest } from "../src/ai/modelTest";
import { translateSentencePrompt } from "../src/ai/prompts/translateSentence";

// DuoPDF'in aiClient testlerinden uyarlandı; gerçek ağ çağrısı yapılmaz.
const fetchMock = vi.fn();

const target: AiTarget = { baseUrl: "https://example.test/v1/", apiKey: "test-key", model: "fast/model" };

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(headers),
  };
}

const completion = (content: string, extra: Record<string, unknown> = {}) =>
  response(200, { choices: [{ message: { content } }], ...extra });

const call = (index: number) => fetchMock.mock.calls[index]!;
const sentBody = (index: number) => JSON.parse(call(index)[1].body);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("chat", () => {
  it("posts to the normalized endpoint with the bearer key", async () => {
    fetchMock.mockResolvedValueOnce(completion("Merhaba", { usage: { total_tokens: 42 } }));
    const res = await chat(target, { messages: [{ role: "user", content: "hi" }] });
    expect(res).toMatchObject({ text: "Merhaba", status: 200, tokens: 42 });
    const [url, init] = call(0);
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(sentBody(0).model).toBe("fast/model");
  });

  it("sends no Authorization header without a key (Ollama)", async () => {
    fetchMock.mockResolvedValueOnce(completion("ok"));
    await chat({ ...target, apiKey: " " }, { messages: [] });
    expect(call(0)[1].headers.Authorization).toBeUndefined();
  });

  it("maps 401 and 403 to Turkish auth errors", async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: { message: "Invalid key" } }));
    const err = await chat(target, { messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err).toMatchObject({ kind: "auth", detail: "Invalid key" });
    expect(err.message).toContain("API anahtarı");

    fetchMock.mockResolvedValueOnce(response(403, { detail: "Authorization failed" }));
    await expect(chat(target, { messages: [] })).rejects.toMatchObject({ kind: "auth", detail: "Authorization failed" });
  });

  it("maps 404 to notFound", async () => {
    fetchMock.mockResolvedValueOnce(response(404, { detail: "Function not found" }));
    await expect(chat(target, { messages: [] })).rejects.toMatchObject({ kind: "notFound", status: 404 });
  });

  it("waits and retries on 429 using Retry-After", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response(429, "slow down", { "retry-after": "1" }));
    fetchMock.mockResolvedValueOnce(completion("tamam"));
    const promise = chat(target, { messages: [], retries: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ text: "tamam" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports 429 when retries are disabled", async () => {
    fetchMock.mockResolvedValueOnce(response(429, "slow down"));
    await expect(chat(target, { messages: [], retries: 0 })).rejects.toMatchObject({ kind: "rateLimit" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops response_format when the provider rejects it", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: { message: "response_format not supported" } }));
    fetchMock.mockResolvedValueOnce(completion('{"a":1}'));
    await chat(target, { messages: [], jsonMode: true });
    expect(sentBody(0).response_format).toEqual({ type: "json_object" });
    expect(sentBody(1).response_format).toBeUndefined();
  });

  it("strips thinking output", async () => {
    fetchMock.mockResolvedValueOnce(completion("<think>uzun düşünce</think>Cevap"));
    await expect(chat(target, { messages: [] })).resolves.toMatchObject({ text: "Cevap" });
  });

  it("treats empty content as a bad response", async () => {
    fetchMock.mockResolvedValueOnce(completion(""));
    await expect(chat(target, { messages: [] })).rejects.toMatchObject({ kind: "badResponse" });
  });

  it("maps a thrown fetch to a network error", async () => {
    fetchMock.mockRejectedValueOnce("dns error");
    await expect(chat(target, { messages: [] })).rejects.toMatchObject({ kind: "network" });
  });

  it("refuses to send without a model or base URL", async () => {
    await expect(chat({ ...target, model: " " }, { messages: [] })).rejects.toMatchObject({ kind: "config" });
    await expect(chat({ ...target, baseUrl: "" }, { messages: [] })).rejects.toMatchObject({ kind: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never puts the API key into error text", async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: { message: "Invalid key" } }));
    const err = await chat(target, { messages: [] }).catch((e) => e);
    expect(describeAiError(err)).not.toContain("test-key");
  });
});

describe("runPrompt / generate", () => {
  const valid = '{"ceviri": "Çeviri", "dilbilgisiNotu": "Not"}';

  it("validates the result against the schema", async () => {
    fetchMock.mockResolvedValueOnce(completion(valid));
    const run = await runPrompt(target, translateSentencePrompt, { sentence: "Hi." });
    expect(run.data).toEqual({ ceviri: "Çeviri", dilbilgisiNotu: "Not" });
    expect(run.validationError).toBeUndefined();
  });

  it("reports invalid JSON without retrying when repair is off", async () => {
    fetchMock.mockResolvedValueOnce(completion('{"translation": "x"}'));
    const run = await runPrompt(target, translateSentencePrompt, { sentence: "Hi." });
    expect(run.data).toBeUndefined();
    expect(run.validationError).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the error to the model once when repair is on", async () => {
    fetchMock.mockResolvedValueOnce(completion("not json"));
    fetchMock.mockResolvedValueOnce(completion(valid));
    const data = await generate(target, translateSentencePrompt, { sentence: "Hi." });
    expect(data.ceviri).toBe("Çeviri");
    const repairMessages = sentBody(1).messages;
    expect(repairMessages.at(-2)).toEqual({ role: "assistant", content: "not json" });
    expect(repairMessages.at(-1).content).toContain("geçerli değildi");
  });

  it("gives up with a clear error after one failed repair", async () => {
    fetchMock.mockResolvedValue(completion("still not json"));
    await expect(generate(target, translateSentencePrompt, { sentence: "Hi." })).rejects.toMatchObject({ kind: "badResponse" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("listModels / testConnection", () => {
  it("returns sorted unique model ids", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [{ id: "b" }, { id: "a" }, { id: "b" }] }));
    await expect(listModels(target)).resolves.toEqual(["a", "b"]);
    expect(call(0)[0]).toBe("https://example.test/v1/models");
  });

  it("validates the key with a small chat request, not the model list", async () => {
    fetchMock.mockResolvedValueOnce(completion("OK"));
    const report = await testConnection(target);
    expect(report.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call(0)[0]).toBe("https://example.test/v1/chat/completions");
  });

  it("asks for a model when none is selected", async () => {
    await expect(testConnection({ ...target, model: "" })).rejects.toMatchObject({ kind: "config" });
  });

  it("surfaces a bad key", async () => {
    fetchMock.mockResolvedValueOnce(response(401, "Unauthorized"));
    await expect(testConnection(target)).rejects.toMatchObject({ kind: "auth" });
  });

  it("explains a model timeout as an accepted key with a busy model", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const promise = testConnection(target);
    await vi.advanceTimersByTimeAsync(60_000);
    const report = await promise;
    expect(report.ok).toBe(false);
    expect(report.message).toContain("fast/model");
  });
});

describe("runModelTest", () => {
  it("runs one word and one sentence sample and reports each outcome", async () => {
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      const isWord = JSON.parse(init.body).messages[1].content.startsWith("Kelime:");
      return completion(isWord ? '{"lemma": "run", "anlam": "yönetmek", "aciklama": "x"}' : "bozuk yanıt");
    });
    const result = await runModelTest(target);
    expect(result.outcomes.map((o) => o.jsonValid)).toEqual([true, false]);
    expect(result.outcomes[1]!.error).toBeTruthy();
  });

  it("picks different samples on retry", async () => {
    fetchMock.mockResolvedValue(response(500, "boom"));
    const first = await runModelTest(target);
    const second = await runModelTest(target, first.picked);
    expect(second.picked[0]).not.toBe(first.picked[0]);
    expect(second.picked[1]).not.toBe(first.picked[1]);
    expect(second.outcomes[0]!).toMatchObject({ jsonValid: false, status: 500 });
  });
});
