import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { Term } from "@/shared/types";
import { localFingerprint, syncWithDrive } from "@/sync/drive";
import { readShared, toSnapshot, type Shared, type Snapshot } from "@/sync/snapshot";
import { deleteTerm, findWord, markTerm } from "@/terms/terms";

/* ---- Sahte Google Drive: tek dosyalık appDataFolder ---- */
let file: { id: string; version: number; body: string } | null;
let uploads: string[];
/** İndirmeden sonra ve yazmadan önce başka bir uygulamanın yazmasını taklit eder. */
let foreignWrites: string[];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const drive = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token");
  if (url.pathname === "/drive/v3/files" && method === "GET") {
    expect(url.searchParams.get("spaces")).toBe("appDataFolder");
    return json({ files: file ? [{ id: file.id, version: String(file.version) }] : [] });
  }
  if (url.pathname.startsWith("/drive/v3/files/") && url.searchParams.get("alt") === "media") return new Response(file!.body);
  if (url.pathname.startsWith("/drive/v3/files/") && url.searchParams.get("fields") === "version") {
    const next = foreignWrites.shift();
    if (next !== undefined) file = { ...file!, version: file!.version + 1, body: next };
    return json({ version: String(file!.version) });
  }
  if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
    const body = String(init!.body);
    const content = body.split("\r\n").filter((line) => line.startsWith("{")).at(-1)!;
    file = { id: "f1", version: 1, body: content };
    uploads.push(content);
    return json({ id: "f1" });
  }
  if (url.pathname === "/upload/drive/v3/files/f1" && method === "PATCH") {
    file = { ...file!, version: file!.version + 1, body: String(init!.body) };
    uploads.push(String(init!.body));
    return json({ id: "f1" });
  }
  throw new Error(`Beklenmeyen istek: ${method} ${url}`);
});

beforeEach(() => {
  fakeBrowser.reset();
  file = null;
  uploads = [];
  foreignWrites = [];
  drive.mockClear();
  vi.stubGlobal("fetch", drive);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const term = (key: string, updatedAt: number, extra: Partial<Term> = {}): Term => ({
  key,
  lemma: key,
  surface: key,
  pattern: [[key]],
  status: "unknown",
  meaning: "",
  explanation: "",
  note: "",
  createdAt: 1,
  updatedAt,
  review: { intervalDays: 0, dueAt: 1, streak: 0 },
  ...extra,
});

/** DuoPDF'in yazdığı bir eşitleme dosyası: belgeler, çizimler, sınav cevapları ve belge geçişleriyle. */
function duopdfFile(part: Partial<Shared> = {}): Snapshot {
  return {
    ...toSnapshot({ terms: [term("compile", 5, { meaning: "derlemek" })], occurrences: [], sentences: [], tombstones: [], ...part }),
    documents: [{ hash: "h1", name: "ders.pdf", format: "pdf", pageCount: 9, addedAt: 1 }],
    strokes: [{ id: "s1", docHash: "h1", page: 1, points: [0, 0, 1], updatedAt: 3 }],
    quizAttempts: [{ id: "q1", termKeys: ["compile"], correct: true, updatedAt: 4 }],
  };
}

const remote = () => JSON.parse(file!.body) as Snapshot;

describe("syncWithDrive", () => {
  it("creates the file in the app folder on the first sync", async () => {
    await markTerm({ surface: "ran", lemma: "run", status: "unknown", occurrence: { sentence: "He ran.", url: "https://a.test", title: "A" } }, 10);
    const outcome = await syncWithDrive("token");
    expect(outcome).toMatchObject({ changedLocally: false, uploaded: true });
    expect(remote()).toMatchObject({ format: "duopdf-sync", version: 1, documents: [], strokes: [], quizAttempts: [] });
    expect(remote().terms.map((t) => t.key)).toEqual(["run"]);
    expect(remote().occurrences).toEqual([{ termKey: "run", sentence: "He ran.", url: "https://a.test", title: "A", createdAt: 10 }]);
  });

  it("brings DuoPDF's words in and keeps DuoPDF's own sections untouched", async () => {
    const original = duopdfFile({ occurrences: [{ termKey: "compile", sentence: "We compile it.", docHash: "h1", page: 2, view: "text", createdAt: 2 }] });
    file = { id: "f1", version: 7, body: JSON.stringify(original) };
    await markTerm({ surface: "ran", lemma: "run", status: "learning" }, 10);

    const outcome = await syncWithDrive("token");
    expect(outcome).toMatchObject({ changedLocally: true, uploaded: true });
    expect((await findWord("compiles")).existing).toMatchObject({ key: "compile", meaning: "derlemek" });

    const written = remote();
    expect(written.documents).toEqual(original.documents);
    expect(written.strokes).toEqual(original.strokes);
    expect(written.quizAttempts).toEqual(original.quizAttempts);
    expect(written.terms.map((t) => t.key)).toEqual(["compile", "run"]);
    expect(written.occurrences).toEqual(original.occurrences);
  });

  it("does not upload when nothing changed, and a second sync is a no-op", async () => {
    file = { id: "f1", version: 1, body: JSON.stringify(duopdfFile()) };
    await syncWithDrive("token");
    expect(uploads).toHaveLength(0);
    const fingerprint = await localFingerprint();
    const again = await syncWithDrive("token");
    expect(again).toEqual({ changedLocally: false, uploaded: false, fingerprint });
  });

  it("applies deletions both ways", async () => {
    file = { id: "f1", version: 1, body: JSON.stringify(duopdfFile({ terms: [term("compile", 5), term("gone", 5)], tombstones: [{ key: "term:gone", deletedAt: 8 }] })) };
    await markTerm({ surface: "gone", lemma: "gone", status: "unknown" }, 6);
    await markTerm({ surface: "ran", lemma: "run", status: "unknown" }, 6);
    await deleteTerm("run", 9);
    await syncWithDrive("token");
    expect((await readShared()).terms.map((t) => t.key)).toEqual(["compile"]);
    expect(remote().terms.map((t) => t.key)).toEqual(["compile"]);
    expect(remote().tombstones.map((t) => t.key).sort()).toEqual(["term:gone", "term:run"]);
  });

  it("starts over when DuoPDF writes the file between download and upload, keeping both changes", async () => {
    file = { id: "f1", version: 1, body: JSON.stringify(duopdfFile()) };
    await markTerm({ surface: "ran", lemma: "run", status: "unknown" }, 10);
    foreignWrites = [JSON.stringify(duopdfFile({ terms: [term("compile", 5), term("debug", 20)] }))];

    const outcome = await syncWithDrive("token");
    expect(outcome.uploaded).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(remote().terms.map((t) => t.key)).toEqual(["compile", "debug", "run"]);
    expect((await readShared()).terms.map((t) => t.key).sort()).toEqual(["compile", "debug", "run"]);
  });

  it("gives up with a clear message if the file keeps changing", async () => {
    file = { id: "f1", version: 1, body: JSON.stringify(duopdfFile()) };
    await markTerm({ surface: "ran", lemma: "run", status: "unknown" }, 10);
    foreignWrites = [JSON.stringify(duopdfFile()), JSON.stringify(duopdfFile()), JSON.stringify(duopdfFile())];
    await expect(syncWithDrive("token")).rejects.toThrow("sürekli değişiyor");
    expect(uploads).toHaveLength(0);
  });

  it("refuses a file it does not recognise without touching local data", async () => {
    file = { id: "f1", version: 1, body: JSON.stringify({ format: "something-else" }) };
    await markTerm({ surface: "ran", lemma: "run", status: "unknown" }, 10);
    const before = await readShared();
    await expect(syncWithDrive("token")).rejects.toThrow("tanınmadı");
    expect(await readShared()).toEqual(before);
    expect(uploads).toHaveLength(0);
  });
});
