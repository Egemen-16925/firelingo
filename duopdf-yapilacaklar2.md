# DuoPDF'te yapılacaklar — 2

`duopdf-yapilacaklar.md` içindeki iki iş tamamlandı (ortak `duo-terms` paketi, web geçişlerinde `url` / `title`). Bu dosya ondan sonra çıkan tek işi içerir. DuoPDF'in kendi Claude Code oturumunda "`../firelingo/duopdf-yapilacaklar2.md` dosyasını oku ve uygula" demek yeterli.

---

## 1. Eşitleme biçimindeki dosyayı birleştirerek içe aktar

**Neden:** Firelingo kelime listesini JSON olarak dışa aktarıyor. Biçim, DuoPDF'in Google Drive'da tuttuğu dosyayla aynı: `format: "duopdf-sync"`, `version: 1` (`src/sync/snapshot.ts` içindeki `Snapshot`). Drive bağlamadan da iki uygulama arasında elle aktarma yapılabilsin diye DuoPDF'in bu dosyayı **mevcut veriyi silmeden** içe alabilmesi gerekiyor.

Bugünkü "İçe aktar" (`src/learning/backup.ts`, `format: "duopdf-backup"`) mevcut veriyi tek işlemde tamamen değiştiriyor. Firelingo dosyasıyla bu yapılırsa belgeler, çizimler ve sınav geçmişi silinir; o yüzden ayrı bir yol gerekli.

**Firelingo'nun ürettiği dosya:**

```jsonc
{
  "format": "duopdf-sync",
  "version": 1,
  "documents": [],          // Firelingo belge yazmaz
  "terms": [ /* SyncTerm: key, lemma, surface, pattern, status, meaning, explanation, note, createdAt, updatedAt, review */ ],
  "occurrences": [ /* web geçişi: termKey, sentence, url, title, createdAt — docHash/page/view yok */ ],
  "sentences": [ /* key, text, translation, grammarNote, createdAt, updatedAt */ ],
  "strokes": [],            // Firelingo çizim yazmaz
  "quizAttempts": [],       // Firelingo sınav cevabı yazmaz
  "tombstones": [ /* { key: "term:<anahtar>", deletedAt } */ ]
}
```

**Yapılacak:**

1. Yedek ekranına (dışa/içe aktarmanın olduğu yer) ayrı bir eylem ekle: **"Birleştirerek içe aktar"**. Mevcut "İçe aktar" (tümünü değiştir) olduğu gibi kalsın; ikisinin farkı arayüzde açıkça yazsın.
2. Seçilen dosya `parseSnapshot` ile okunur (`format` / `version` tanınmıyorsa mevcut anlaşılır hata gösterilir).
3. Birleştirme eşitlemedekiyle **aynı kod yolundan** geçer; yeni bir birleştirme kuralı yazma:
   ```ts
   const local = await readSnapshot(db);
   const merged = mergeSnapshots(local, imported);
   if (!sameSnapshot(merged, local)) await applySnapshot(db, merged);
   await refreshTerms();
   ```
   Böylece kurallar aynı kalır: terim ve çeviride yeni `updatedAt` kazanır, geçişler birleşir, silme izi yalnızca kayıttan yeniyse siler.
4. Sonuç kullanıcıya özetlensin: kaç yeni kelime eklendi, kaçı güncellendi, kaçı silindi (birleştirme öncesi ve sonrası terim listelerinin farkından hesaplanabilir).
5. İsteğe bağlı ama yararlı: "Eşitleme biçiminde dışa aktar". DuoPDF'in kelimeleri de aynı biçimde dosyaya yazılırsa Firelingo onları içe alabilir (Firelingo `documents`, `strokes` ve `quizAttempts` bölümlerini yok sayar, terimleri, web geçişlerini ve cümle çevirilerini alır).

**Dikkat:**

- Bu işlem Drive eşitlemesi bağlıyken de güvenli olmalı: içe alınan kayıtlar bir sonraki eşitlemede normal yoldan buluta gider. Ayrı bir işlem gerekmez.
- Firelingo dosyasındaki `tombstones`, DuoPDF'te o kelimeyi de siler (kayıt silme izinden eskiyse). Bu beklenen davranıştır; özet ekranında "silinen" sayısında görünmeli.
- `SNAPSHOT_VERSION` değişmemeli.

**Kabul ölçütü:**

- Belgeleri, çizimleri ve sınav geçmişi olan bir veritabanına Firelingo dosyası birleştirilerek içe alındığında bunların hiçbiri değişmez (test).
- Aynı dosya ikinci kez içe alındığında hiçbir şey değişmez; kayıt çoğalmaz (test).
- Dosyadaki kelime yereldekinden eskiyse yereldeki korunur; yeniyse dosyadaki yazılır (test).
- `url` / `title` içeren web geçişleri içe alınır ve kelime listesinde kaynak olarak görünür.
- Biçimi tanınmayan dosyada veri değişmez ve anlaşılır bir hata gösterilir (test).
