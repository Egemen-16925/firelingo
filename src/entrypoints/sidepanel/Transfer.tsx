import { useState } from "react";
import type { Result, TermMessage } from "@/shared/messages";
import { toJson, toMarkdown, toPlainList, toTsv } from "@/sync/export";
import type { ImportSummary } from "@/sync/import";
import { readShared } from "@/sync/snapshot";
import type { WordRow } from "@/terms/wordList";

type Note = { ok: boolean; text: string } | null;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Dışa aktarma: süzgeçteki kelimeler panoya (dört biçim), tüm veri JSON dosyasına. */
export function ExportPanel({ shown }: { shown: WordRow[] }) {
  const [note, setNote] = useState<Note>(null);

  const copy = async (label: string, text: () => string | Promise<string>) => {
    try {
      await navigator.clipboard.writeText(await text());
      setNote({ ok: true, text: `${shown.length} kelime ${label} olarak panoya kopyalandı.` });
    } catch (e) {
      setNote({ ok: false, text: `Panoya kopyalanamadı: ${message(e)}` });
    }
  };

  const download = async () => {
    const url = URL.createObjectURL(new Blob([toJson(await readShared())], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `firelingo-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNote({ ok: true, text: "Tüm veri JSON dosyası olarak indirildi." });
  };

  return (
    <section className="transfer">
      <p className="muted">Süzgeçteki {shown.length} kelimeyi panoya kopyala:</p>
      <div className="actions">
        <button onClick={() => copy("düz liste", () => toPlainList(shown))}>Düz liste</button>
        <button onClick={() => copy("TSV (Anki)", () => toTsv(shown))}>TSV (Anki)</button>
        <button onClick={() => copy("Markdown tablo", () => toMarkdown(shown))}>Markdown</button>
        <button onClick={() => copy("JSON", async () => toJson(await readShared(), shown))}>JSON</button>
      </div>
      <p className="muted">Tüm kelimeler, cümle çevirileri ve silme izleri (DuoPDF eşitleme biçimi):</p>
      <div className="actions">
        <button onClick={download}>JSON dosyası indir</button>
      </div>
      {note && (
        <p className={note.ok ? "ok" : "error"} role="status">
          {note.text}
        </p>
      )}
    </section>
  );
}

/** İçe aktarma: JSON yapıştır ya da dosya seç; mevcut veri silinmez, birleştirilir. */
export function ImportPanel() {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const request: TermMessage = { type: "data:import", json };
      const result: Result<ImportSummary> = await browser.runtime.sendMessage(request);
      if (!result.ok) throw new Error(result.error);
      const { added, updated, removed, total } = result.value;
      setNote({ ok: true, text: `Birleştirildi: ${added} yeni, ${updated} güncellendi, ${removed} silindi. Toplam ${total} kelime.` });
      setJson("");
    } catch (e) {
      setNote({ ok: false, text: message(e) });
    }
    setBusy(false);
  };

  return (
    <section className="transfer">
      <p className="muted">
        Firelingo ya da DuoPDF eşitleme biçimindeki JSON'u yapıştır ya da dosya seç. Mevcut kelimelerin silinmez: aynı kelimede en son değiştirilen
        kalır.
      </p>
      <textarea
        aria-label="İçe aktarılacak JSON"
        placeholder='{ "format": "duopdf-sync", … }'
        spellCheck={false}
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      <div className="actions">
        <input
          type="file"
          accept=".json,application/json"
          aria-label="JSON dosyası seç"
          onChange={(e) => void e.target.files?.[0]?.text().then(setJson)}
        />
        <button className="primary" disabled={busy || !json.trim()} onClick={run}>
          {busy ? "Birleştiriliyor…" : "Birleştirerek içe aktar"}
        </button>
      </div>
      {note && (
        <p className={note.ok ? "ok" : "error"} role="status">
          {note.text}
        </p>
      )}
    </section>
  );
}
