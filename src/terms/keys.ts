// Kelime verisinin storage.local anahtar önekleri. Kayıt başına bir anahtar:
//   term:<anahtar> → Term            occ:<anahtar> → Occurrence[]
//   sentence:<sha256> → Sentence     tomb:term:<anahtar> → silinme zamanı
// Ayrı dosyada durur ki kelime listesi sayfası, duo-terms'i (≈1,7 MB) içeren terms.ts'i yüklemeden okuyabilsin.
export const TERM_PREFIX = "term:";
export const OCCURRENCE_PREFIX = "occ:";
export const SENTENCE_PREFIX = "sentence:";
export const TOMBSTONE_PREFIX = "tomb:";
