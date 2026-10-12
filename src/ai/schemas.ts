import { z } from "zod";

// Eklenti sayfalarının CSP'si `eval`e izin vermez; zod hızlandırma için `new Function` denemesin.
z.config({ jitless: true });

// DuoPDF ile aynı şemalar: iki uygulama aynı kelimeye aynı biçimde anlam üretir.
export const wordMeaningSchema = z.object({
  lemma: z.string().min(1),
  anlam: z.string().min(1),
  aciklama: z.string(),
});
export type WordMeaning = z.infer<typeof wordMeaningSchema>;

export const sentenceTranslationSchema = z.object({
  ceviri: z.string().min(1),
  dilbilgisiNotu: z.string(),
});
export type SentenceTranslation = z.infer<typeof sentenceTranslationSchema>;
