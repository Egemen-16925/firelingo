import type { TermStatus } from "duo-terms";

export type { TermStatus };

/**
 * Kelime kaydı. Alanlar DuoPDF'in `terms` kaydıyla aynıdır (eşitlemede aynı kayıt olurlar).
 * DuoPDF'in eklediği, burada bilinmeyen alanlar kayıt güncellenirken korunur.
 */
export interface Term {
  /** Kararlı anahtar: küçük harfli kök hâli ("run", "carry out"). */
  key: string;
  lemma: string;
  /** İlk işaretlendiği hâli ("ran"). */
  surface: string;
  /** Eşleştirme kalıbı: her kelime konumu için kabul edilen kökler. */
  pattern: string[][];
  status: TermStatus;
  /** Türkçe anlam (son sorulan cümleye göre). */
  meaning: string;
  explanation: string;
  note: string;
  createdAt: number;
  /** Eşitlemede belirleyici: yeni olan kazanır. */
  updatedAt: number;
  /** Aralıklı tekrar DuoPDF'in işidir; Firelingo yalnızca varsayılanla oluşturur, sonra dokunmaz. */
  review: { intervalDays: number; dueAt: number; streak: number };
}

/**
 * Kelimenin geçtiği yer. Firelingo web geçişi yazar (`url`, `title`); DuoPDF'ten içe alınan
 * belge geçişlerinde bunlar yoktur, onların kendi alanları (`docHash`, `page`, `view`) olduğu gibi korunur.
 */
export interface Occurrence {
  sentence: string;
  url?: string;
  title?: string;
  createdAt: number;
}

/** Çevirisi istenmiş cümle; anahtar temizlenmiş metnin SHA-256'sıdır (DuoPDF ile aynı). */
export interface Sentence {
  key: string;
  text: string;
  translation: string;
  grammarNote: string;
  createdAt: number;
  updatedAt: number;
}
