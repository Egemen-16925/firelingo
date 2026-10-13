// Seçimi okuyan yardımcılar. duo-terms buraya alınmaz (sayfaya ≈1,7 MB yükler);
// kelime kalıbı paketin `tokenize` kalıbıyla aynıdır, kök bulma background'da yapılır.
const WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

/** Bu kadar kelimeye kadar olan, tek cümle içindeki seçim bir terim sayılır (DuoPDF ile aynı). */
export const MAX_TERM_WORDS = 6;
const MAX_SELECTION_CHARS = 2000;
const MAX_BLOCK_CHARS = 20_000;
const BLOCKS = "p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6,div,section,article,main,body";

export function wordsIn(text: string): string[] {
  return text.match(WORD) ?? [];
}

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * `text` içinde [start, end) aralığına değen cümle(ler). `single`: aralık tek cümlenin içinde mi.
 */
export function sentenceAt(text: string, start: number, end: number): { sentence: string; single: boolean } {
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  let first = -1;
  let last = -1;
  let count = 0;
  // Sayfa kaynağındaki satır sonları cümle sonu sayılmasın; boşluğa çevirmek konumları kaydırmaz.
  for (const segment of segmenter.segment(text.replace(/\s/g, " "))) {
    const segmentEnd = segment.index + segment.segment.length;
    if (segment.index >= end || segmentEnd <= start) continue;
    if (first < 0) first = segment.index;
    last = segmentEnd;
    count++;
  }
  if (first < 0) return { sentence: collapse(text.slice(start, end)), single: true };
  return { sentence: collapse(text.slice(first, last)), single: count === 1 };
}

export interface Pick {
  /** term: en çok 6 kelimelik, tek cümle içindeki seçim. sentence: daha uzun ya da cümle sınırını aşan seçim. */
  kind: "term" | "sentence";
  /** Terimde yalnızca kelimeler ("carried out"), cümlede seçilen metin. */
  text: string;
  /** Terimin içinde geçtiği cümle (yapay zekâya bağlam olarak gider). */
  sentence: string;
  rect: DOMRect;
}

const elementOf = (range: Range) => {
  const container = range.commonAncestorContainer;
  return container instanceof Element ? container : container.parentElement;
};

/** Aralığın içinde geçtiği cümle: en yakın blok öğesinin metni cümlelere bölünür. */
export function contextOf(range: Range): { sentence: string; single: boolean } {
  const raw = range.toString();
  const element = elementOf(range);
  const block = element?.closest(BLOCKS) ?? element;
  const blockText = block?.textContent ?? "";
  if (!block || blockText.length > MAX_BLOCK_CHARS) return { sentence: collapse(raw), single: true };
  // Aralığın blok metni içindeki konumu: bloğun başından aralığın başına kadar olan metnin uzunluğu.
  const before = document.createRange();
  before.selectNodeContents(block);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length + (raw.length - raw.trimStart().length);
  return sentenceAt(blockText, start, start + raw.trim().length);
}

/** Sayfadaki geçerli metin seçimini okur. */
export function readPick(): Pick | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  return pickFromRange(selection.getRangeAt(0));
}

/** Aralıktaki metni terim ya da cümle olarak okur; İngilizce kelime içermiyorsa ya da düzenlenebilir alandaysa null. */
export function pickFromRange(range: Range): Pick | null {
  const text = collapse(range.toString());
  const words = wordsIn(text);
  if (words.length === 0 || text.length > MAX_SELECTION_CHARS) return null;
  if (!elementOf(range) || elementOf(range)!.closest("input,textarea,[contenteditable=''],[contenteditable='true']")) return null;

  const context = contextOf(range);
  const rect = range.getBoundingClientRect();
  if (words.length <= MAX_TERM_WORDS && context.single) {
    return { kind: "term", text: words.join(" "), sentence: context.sentence, rect };
  }
  return { kind: "sentence", text, sentence: text, rect };
}
