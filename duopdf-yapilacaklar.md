# DuoPDF'te yapılacaklar

Firelingo ile ortak kelime havuzu için DuoPDF tarafında gereken değişiklikler. Firelingo oturumu DuoPDF'e dokunmaz; bu dosya DuoPDF'in kendi Claude Code oturumunda uygulanmak üzere yazıldı. Oraya geçince "`../firelingo/duopdf-yapilacaklar.md` dosyasını oku ve uygula" demek yeterli.

İki iş birbirinden bağımsızdır. İlki ne zaman yapılırsa yapılsın sorun çıkarmaz; ikincisi Firelingo'nun Faz 6'sından (Google Drive eşitlemesi) önce bitmiş olmalı.

---

## 1. Terim ve cümle anahtarı kodunu ortak pakete taşı

**Neden:** Aynı kelimenin iki uygulamada aynı anahtara düşmesi gerekiyor. Kod artık tek yerde duruyor: [`duo-terms`](https://github.com/Egemen-16925/duo-terms) (yerelde `../duo-terms`). Firelingo bu paketi kullanıyor; DuoPDF kendi kopyasını kullanmaya devam ederse iki kopya zamanla ayrışabilir.

**Yapılacak:**

1. Paketi kur:
   ```bash
   npm install github:Egemen-16925/duo-terms#v1.1.0
   ```
2. Şu dosyaları sil ve içe aktarmaları `"duo-terms"` paketine çevir:
   - `src/learning/lemma.ts` → `tokenize`, `normalizeWord`, `lemmaCandidates`, `bestLocalLemma`, `Token`
   - `src/learning/matcher.ts` → `buildMatcher`, `patternFor`, `MatchableTerm`, `TermMatch`, `Matcher`, `TermStatus`
   - `src/learning/matcher.test.ts` (pakete taşındı)
   - `src/types/wink-lemmatizer.d.ts` (artık gerekmez)
3. `src/learning/terms.ts` içindeki `termKey` ve `mergePatterns` tanımlarını kaldır, paketten içe aktar. `termKey` başka yerlerden bu dosya üzerinden kullanılıyorsa yeniden dışa aktar ya da içe aktarmaları güncelle.
4. `src/learning/sentence.ts` içindeki `cleanText` ve `src/learning/sentences.ts` içindeki `sentenceKey` tanımlarını kaldır, paketten içe aktar. `segmentSentences` DuoPDF'te kalır.
5. `wink-lemmatizer` artık paketin bağımlılığı; DuoPDF'in `package.json`'ından çıkarılabilir.

**Pakette DuoPDF'e göre tek fark:** `MatchableTerm`, `TermMatch`, `Matcher` ve `buildMatcher` terim kimliğinin türünü parametre olarak alır (`MatchableTerm<Id = number>`). Varsayılan `number` olduğu için DuoPDF'in mevcut kodu değişmeden derlenmelidir. `lemma.ts` birebir aynıdır.

**Kabul ölçütü:** `npm run build` ve `npm test` değişiklik öncesiyle aynı sonucu verir; hiçbir testin beklentisi değişmez. Davranış değişikliği yoktur.

---

## 2. Geçişlere (occurrences) web kaynağı ekle

**Neden:** Firelingo kelimeleri web sayfalarında işaretliyor. Bir web sayfası DuoPDF'teki anlamda bir belge değil (hash'i, sayfa numarası yok). Karar: geçiş kaydına isteğe bağlı `url` ve `title` alanları eklenecek (Firelingo `main.md` bölüm 5, seçenek b).

**Bugünkü durum (neden değişiklik şart):**

- `src/sync/snapshot.ts` → `readSnapshot` geçişleri sabit alan listesiyle kuruyor (`termKey`, `docHash`, `page`, `view`, `sentence`, `createdAt`); buluttan gelen `url` / `title` ilk eşitlemede silinir.
- `readSnapshot` ve `applySnapshot`, belgesi bulunmayan geçişi atıyor (`docHash.has(o.documentId)`, `docId.has(o.docHash)`).
- `occurrenceKey` anahtarı `termKey + docHash + view + page + sentence` üzerinden kuruyor.

**Firelingo'nun yazacağı geçiş biçimi (eşitleme dosyasında):**

```ts
{
  termKey: "run",
  sentence: "We ran the tests.",
  url: "https://example.com/article",   // sayfanın adresi (# kısmı olmadan)
  title: "Example article",             // sayfa başlığı
  createdAt: 1760000000000
  // docHash, page, view YOK
}
```

**Yapılacak:**

1. `OccurrenceRecord` (`src/db/db.ts`): `url?: string`, `title?: string` ekle; web geçişinde `documentId`, `page`, `view` bulunmayabilir. Dexie şemasına gerekiyorsa yeni sürüm ekle (mevcut kayıtlar değişmeden kalmalı).
2. `SyncOccurrence` (`src/sync/snapshot.ts`): `url?`, `title?` ekle; `docHash`, `page`, `view` isteğe bağlı olsun.
3. `occurrenceKey`: web geçişinde `docHash` yerine `url` kullansın. Belge geçişlerinin anahtarı **değişmemeli** (yoksa mevcut kayıtlar çoğalır).
4. `readSnapshot` / `applySnapshot`: `url`'si olan geçişi belgesi olmadan da oku, yaz ve birleştir; `url` ve `title` gidiş-dönüşte korunmalı.
5. `mergeSnapshots`: terimi silinmiş web geçişleri de belge geçişleri gibi düşmeli (mevcut `termKeys.has` kuralı).
6. Arayüz: kelime listesinde web geçişi için "cümleye git", adresi varsayılan tarayıcıda açsın (ya da gizlensin); kaynak olarak başlık / site adı gösterilsin. Belgeye bağlı olduğunu varsayan yerler (ör. sınav için cümle seçimi) web geçişinde bozulmamalı; cümle metni yine kullanılabilir.
7. Yedek (`src/learning/backup.ts`): web geçişleri yedeğe girsin ve geri yüklensin; eski yedekler açılmaya devam etsin.

**Kabul ölçütü:**

- `url` / `title` içeren bir eşitleme dosyası indirilip yeniden yüklendiğinde bu alanlar yerinde durur (test).
- Belgesi olmayan web geçişi eşitlemede kaybolmaz (test).
- Eski eşitleme dosyaları ve eski yedekler hatasız açılır; belge geçişleri çoğalmaz (test).
- `SNAPSHOT_VERSION` değişmez. Sürüm yükseltilirse Firelingo dosyayı tanımaz; yükseltmek gerekirse önce Firelingo tarafına haber ver.

---

## Firelingo'nun DuoPDF'ten beklediği, değişmemesi gerekenler

Bunlar için iş yok; yalnızca ileride değiştirilirse Firelingo'yu bozar:

- Terim kaydının alanları: `key`, `lemma`, `surface`, `pattern`, `status` (`unknown | learning | known`), `meaning`, `explanation`, `note`, `createdAt`, `updatedAt`, `review`.
- Yeni terimin `review` varsayılanı: `{ intervalDays: 0, dueAt: now, streak: 0 }`. Firelingo yeni terimi bununla oluşturur, sonra `review`'a dokunmaz.
- Cümle kaydı: `key` (temizlenmiş metnin SHA-256'sı), `text`, `translation`, `grammarNote`, `createdAt`, `updatedAt`.
- Silme izleri: `term:<anahtar>` ve `sentence:<anahtar>`.
- Birleştirme kuralı: terim ve cümlede yeni `updatedAt` kazanır; silme izi yalnızca kayıttan yeniyse siler.
- Terim ve cümle kayıtlarındaki bilinmeyen alanların korunması (bugün korunuyor).
