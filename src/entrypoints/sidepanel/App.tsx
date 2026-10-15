import { useEffect, useMemo, useRef, useState } from "react";
import type { MeaningResult, Message, Result, TermMessage } from "@/shared/messages";
import type { TermStatus } from "@/shared/types";
import { OCCURRENCE_PREFIX, TERM_PREFIX } from "@/terms/keys";
import { filterRows, loadWordList, siteOf, sitesOf, type WordFilter, type WordRow } from "@/terms/wordList";
import { ExportPanel, ImportPanel } from "./Transfer";

const STATUSES: { value: TermStatus; label: string }[] = [
  { value: "unknown", label: "Bilmiyorum" },
  { value: "learning", label: "Az biliyorum" },
  { value: "known", label: "Biliyorum" },
];

/** Aynı sayfa kenar çubuğunda kart listesi, yeni sekmede (`?page`) geniş tablo olarak açılır. */
const FULL_PAGE = new URLSearchParams(location.search).has("page");

// Yazmalar yalnızca background'dan geçer; liste storage değişince kendiliğinden yenilenir.
async function send<T = unknown>(message: TermMessage): Promise<T> {
  const result: Result<T> = await browser.runtime.sendMessage(message);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

interface Question {
  text: string;
  detail?: string;
  action: () => void;
}

/** Silmeden önce soran pencere; Esc ya da dışarı tıklama vazgeçer. */
function ConfirmDialog({ question, onClose }: { question: Question; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={question.text} onClick={(e) => e.stopPropagation()}>
        <strong>{question.text}</strong>
        {question.detail && <p className="muted">{question.detail}</p>}
        <div className="actions">
          <button autoFocus onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="danger"
            onClick={() => {
              question.action();
              onClose();
            }}
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

interface RowProps {
  row: WordRow;
  selected: boolean;
  onSelect: (on: boolean) => void;
  ask: (question: Question) => void;
}

function Row({ row, selected, onSelect, ask }: RowProps) {
  const { term, occurrences } = row;
  const [meaning, setMeaning] = useState(term.meaning);
  const [open, setOpen] = useState(false);
  // Kayıt başka yerden değişirse (baloncuk, başka sekme) kutu da güncellensin.
  useEffect(() => setMeaning(term.meaning), [term.meaning]);

  const latest = occurrences[occurrences.length - 1];
  const saveMeaning = () => {
    if (meaning.trim() !== term.meaning) void send({ type: "term:update", key: term.key, patch: { meaning } });
  };

  // Çevirisi olmayan kelime (ör. düz listeden eklenen): anlamı, varsa geçtiği cümleye göre sorulur.
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");
  const translate = async () => {
    setTranslating(true);
    setTranslateError("");
    try {
      const { meaning: ai } = await send<MeaningResult>({ type: "word:meaning", word: term.surface, sentence: latest?.sentence ?? term.surface });
      await send({ type: "term:update", key: term.key, patch: { meaning: ai.anlam, explanation: ai.aciklama } });
    } catch (e) {
      setTranslateError(e instanceof Error ? e.message : String(e));
    }
    setTranslating(false);
  };

  return (
    <li className={`word ${term.status}`}>
      <input type="checkbox" aria-label={`${term.lemma} seç`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />

      <div className="term">
        <strong>{term.lemma}</strong>
        {term.surface.toLowerCase() !== term.lemma.toLowerCase() && <small>{term.surface}</small>}
      </div>

      <div className="meaning-cell">
        <input
          className="meaning"
          aria-label={`${term.lemma} çevirisi`}
          placeholder={translating ? "Çevriliyor…" : "çeviri yok"}
          value={meaning}
          onChange={(e) => setMeaning(e.target.value)}
          onBlur={saveMeaning}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {!term.meaning && (
          <button className="translate" disabled={translating} onClick={() => void translate()}>
            {translating ? "Çevriliyor…" : "Çevir"}
          </button>
        )}
        {translateError && <p className="error">{translateError}</p>}
      </div>

      <div className="statuses" role="radiogroup" aria-label={`${term.lemma} durumu`}>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            className={s.value}
            role="radio"
            aria-checked={term.status === s.value}
            title={s.label}
            onClick={() => term.status !== s.value && void send({ type: "term:update", key: term.key, patch: { status: s.value } })}
          >
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      <div className="context">
        {latest ? (
          <>
            <p>{latest.sentence}</p>
            {open &&
              occurrences
                .slice(0, -1)
                .reverse()
                .map((o) => (
                  <p key={o.createdAt + o.sentence}>
                    {o.sentence}{" "}
                    <a href={o.url} target="_blank" rel="noreferrer">
                      {siteOf(o.url)}
                    </a>
                  </p>
                ))}
            {occurrences.length > 1 && (
              <button className="link" onClick={() => setOpen(!open)}>
                {open ? "Daha az" : `+${occurrences.length - 1} cümle daha`}
              </button>
            )}
          </>
        ) : (
          <p className="muted">Bağlam cümlesi yok</p>
        )}
      </div>

      <div className="source">
        {latest && (
          <a href={latest.url} target="_blank" rel="noreferrer" title={latest.title}>
            {siteOf(latest.url)}
          </a>
        )}
      </div>

      <time className="date" dateTime={new Date(term.createdAt).toISOString()}>
        {new Date(term.createdAt).toLocaleDateString("tr-TR")}
      </time>

      <button
        className="link delete"
        onClick={() =>
          ask({
            text: `“${term.lemma}” kelime listenden silinsin mi?`,
            detail: "Geçtiği cümlelerin kaydı da silinir.",
            action: () => void send({ type: "term:delete", key: term.key }),
          })
        }
      >
        Sil
      </button>
    </li>
  );
}

export default function App() {
  const [rows, setRows] = useState<WordRow[] | null>(null);
  const [filter, setFilter] = useState<WordFilter>({ status: "all", site: "", query: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const [panel, setPanel] = useState<"export" | "import" | null>(null);

  const reload = useRef(() => void loadWordList().then(setRows)).current;
  useEffect(() => {
    reload();
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === "local" && Object.keys(changes).some((k) => k.startsWith(TERM_PREFIX) || k.startsWith(OCCURRENCE_PREFIX))) reload();
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const shown = useMemo(() => (rows ? filterRows(rows, filter) : []), [rows, filter]);
  const sites = useMemo(() => (rows ? sitesOf(rows) : []), [rows]);
  if (!rows) return null;

  // Süzgeç değişince görünmeyen seçimler toplu işleme girmesin.
  const picked = shown.filter((row) => selected.has(row.term.key)).map((row) => row.term.key);
  const allPicked = shown.length > 0 && picked.length === shown.length;

  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    setSelected(next);
  };

  async function bulk(message: (key: string) => TermMessage) {
    setError("");
    try {
      for (const key of picked) await send(message(key));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <main className={FULL_PAGE ? "page" : "panel"}>
      <header>
        <h1>Kelimeler</h1>
        <span className="muted">
          {shown.length === rows.length ? `${rows.length} kelime` : `${shown.length} / ${rows.length} kelime`}
        </span>
        {!FULL_PAGE && (
          <button
            className="link"
            onClick={() => {
              // Sekmeyi background açar: kenar çubuğu kapanınca bu sayfa da kapanır ve kendi isteği yarıda kalabilir.
              void browser.runtime.sendMessage({ type: "list:open" } satisfies Message);
              // Kenar çubuğu yalnızca tıklamanın içinden kapatılabilir; kapanmazsa liste yine açılır.
              try {
                void (browser as unknown as { sidebarAction: { close(): Promise<void> } }).sidebarAction.close().catch(() => undefined);
              } catch {
                // Kenar çubuğu açık kalır.
              }
            }}
          >
            Tam sayfada aç
          </button>
        )}
      </header>

      <div className="tabs">
        <button aria-pressed={panel === "export"} disabled={rows.length === 0} onClick={() => setPanel(panel === "export" ? null : "export")}>
          Dışa aktar
        </button>
        <button aria-pressed={panel === "import"} onClick={() => setPanel(panel === "import" ? null : "import")}>
          İçe aktar
        </button>
      </div>
      {panel === "export" && <ExportPanel shown={shown} />}
      {panel === "import" && <ImportPanel />}

      <div className="filters">
        <input
          type="search"
          placeholder="Kelime ya da çeviri ara"
          aria-label="Ara"
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        />
        <div className="chips" role="radiogroup" aria-label="Durum">
          {[{ value: "all" as const, label: "Tümü" }, ...STATUSES].map((s) => (
            <button key={s.value} role="radio" aria-checked={filter.status === s.value} onClick={() => setFilter({ ...filter, status: s.value })}>
              {s.label}
            </button>
          ))}
        </div>
        {sites.length > 0 && (
          <select aria-label="Kaynak site" value={filter.site} onChange={(e) => setFilter({ ...filter, site: e.target.value })}>
            <option value="">Tüm siteler</option>
            {sites.map((site) => (
              <option key={site}>{site}</option>
            ))}
          </select>
        )}
      </div>

      {shown.length > 0 && (
        <div className="bulk">
          <label>
            <input
              type="checkbox"
              checked={allPicked}
              onChange={(e) => setSelected(new Set(e.target.checked ? shown.map((row) => row.term.key) : []))}
            />
            {picked.length ? `${picked.length} seçili` : "Tümünü seç"}
          </label>
          {picked.length > 0 && (
            <>
              {STATUSES.map((s) => (
                <button key={s.value} className={s.value} onClick={() => void bulk((key) => ({ type: "term:update", key, patch: { status: s.value } }))}>
                  {s.label}
                </button>
              ))}
              <button
                className="delete"
                onClick={() =>
                  setQuestion({
                    text: `Seçili ${picked.length} kelime silinsin mi?`,
                    detail: "Geçtikleri cümlelerin kaydı da silinir.",
                    action: () => void bulk((key) => ({ type: "term:delete", key })),
                  })
                }
              >
                Sil
              </button>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="empty">
          Henüz kelime yok. Firelingo'yu bir sitede aç, bir kelime seç ve <strong>Bilmiyorum</strong> ya da <strong>Az biliyorum</strong> olarak
          işaretle; burada görünür.
        </p>
      ) : shown.length === 0 ? (
        <p className="empty">Bu süzgece uyan kelime yok.</p>
      ) : (
        <ul className="words">
          {shown.map((row) => (
            <Row key={row.term.key} row={row} selected={selected.has(row.term.key)} onSelect={(on) => toggle(row.term.key, on)} ask={setQuestion} />
          ))}
        </ul>
      )}

      {question && <ConfirmDialog question={question} onClose={() => setQuestion(null)} />}
    </main>
  );
}
