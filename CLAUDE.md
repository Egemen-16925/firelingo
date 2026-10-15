# Firelingo — Claude Code çalışma talimatı

Firefox için AI destekli kelime öğrenme eklentisi (WXT + React + TypeScript, MV3). Kardeş proje DuoPDF (`../Duopdf`) ile aynı kelime havuzunu paylaşır.

**Her oturumun başında `main.md`'yi oku.** Asıl belge odur: özellikler, veri modeli, fazlar, kabul kriterleri ve açık sorular orada. Bu dosya yalnızca kuralların özeti ve ilerleme durumudur.

## Çalışma kuralları (özet — tam hali `main.md` bölüm 0)

1. **Otomatik ilerleme yok.** Kod yazmadan önce adımın planını kısaca anlat, onay bekle.
2. **Mutlaka sor:** yeni npm paketi, klasör yapısı ya da veri şeması değişikliği, `manifest` izinleri, UI/görsel tasarım kararları, faz geçişi, git commit (mesajı öner, onay bekle), belgede belirsiz kalan her şey.
3. **Tahmin etme, sor.** Seçenekleri artı/eksileriyle sun.
4. **Küçük adımlar.** Her adımın sonunda: ne yapıldı, Firefox'ta nasıl test edilir, sıradaki adım.
5. **`main.md`'yi güncel tut.** Karar verilince ilgili bölümü ve bölüm 12'yi güncellemeyi öner.
6. Kullanıcıyla **Türkçe** konuş; kod, değişken adları ve commit mesajları İngilizce.
7. **DuoPDF'e dokunma.** `../Duopdf` yalnızca okunur. Orada değişiklik gerekiyorsa ne gerektiğini yaz, kullanıcıya bırak.
8. **API anahtarı asla repoya girmesin.** Sohbete yapıştırılan anahtarı kullanma; ayarlar sayfasından girilir.
9. **Test edemediğin şeyi "çalışıyor" diye bildirme.** Kendi doğruladığını (build, tip kontrolü, birim testleri) ve kullanıcının denemesi gerekeni ayrı yaz.
10. **Kapsamı büyütme.** Belgede olmayan özelliği öner, onay bekle.

## Komutlar

- `npm run dev` — geliştirme derlemesi (`.output/firefox-mv3-dev/`); `web-ext` Firefox'u ayrı profille açar, açılmazsa `about:debugging` → "Geçici eklenti yükle". PowerShell betik ilkesine takılırsa `npm.cmd run dev`.
- `npm run build` — `.output/firefox-mv3/` altına derler
- `npm run compile` — tip kontrolü
- `npm test` — birim testleri (Vitest)

**Aynı anda tek `npm run dev` çalışsın.** Birden çok sunucu aynı `.output` klasörüne yazınca popup boş/takılı kalır. Claude önizleme panelini (preview) bu proje için başlatma; popup orada çalışmaz ve ikinci bir sunucu açar.

## İlerleme durumu

- [x] Faz 0 — Kurulum
- [x] Faz 1 — Aç/kapa + ayarlar
- [x] Faz 2 — Baloncuk + çeviri + durumlar
- [x] Faz 3 — Fosforlu kalem
- [x] Faz 4 — Sidebar + dışa/içe aktarma
- [x] Faz 5 — Cila
- [ ] Faz 6 — Google Drive ile DuoPDF senkronu
- [ ] Faz 7 — Yayın

## Karar günlüğü

- 2026-10-12: UI framework React (DuoPDF ile aynı). Lisans MIT. Depo herkese açık.
- 2026-10-12: TypeScript `~6.0.3` (DuoPDF ile aynı sürüm hattı).
- 2026-10-12: Eklenti kimliği `firelingo@egemen-16925.github.io` (AMO'ya yüklendikten sonra değişmez). Depo `Egemen-16925/firelingo`.
- 2026-10-12: `.claude/launch.json` yerel ayardır, depoya girmez (DuoPDF'teki gibi).
- 2026-10-12: Content script her http/https sitesinde hafif bootstrap (`*://*/*`); durumunu background'a mesajla sorar, ayar değişince background `refresh` yollar. `tabs` izni yok; izinler `storage` + `activeTab`.
- 2026-10-12: Site kuralı anahtarı tam hostname. Kurallar ve global anahtar `storage.local`'da, sekme seçimi `storage.session`'da (`tab:<id>`).
- 2026-10-12: Popup: güç düğmesi her zaman geçicidir (yalnızca sekme); site kuralı varsa kaldırır. Seçici Sor / Hep açık / Hep kapalı. "Her sitede açık" ve "Varsayılanları sıfırla" (onaylı, API ayarlarına dokunmaz) ayarlar sayfasında.
- 2026-10-12: Prompt'lar ve şemalar DuoPDF'ten aynen (`wordMeaning@1`, `translateSentence@1`). Paketler: `zod`, `vitest`, `web-ext`.
- 2026-10-12: AI katmanı `src/ai/` DuoPDF'ten uyarlandı (tek model, yedek model yok). Çağrılar background'dan çıkar; ayarlar sayfası `ai:*` mesajı yollar, anahtar mesajda taşınmaz. API ayarları `storage.local` `aiSettings` anahtarında.
- 2026-10-12: API adresleri için `optional_host_permissions: *://*/*`; her sağlayıcı adresi ayarlar sayfasında tıklama anında ayrı istenir. Bağlantı testi yalnızca küçük bir sohbet isteğidir (`/models` anahtarı doğrulamaz); anahtar zorunlu değil (Ollama).
- 2026-10-12: Birden fazla sağlayıcı: `aiSettings = { providers[], activeId }`; seçili sağlayıcı çeviride kullanılır, her biri kendi anahtarını ve modelini tutar. Kayıtlar `settings.ts`'teki sıralı `mutate` ile yazılır.
- 2026-10-12: API anahtarları şifreli (`src/storage/vault.ts`): varsayılan dışa aktarılamayan cihaz anahtarı (IndexedDB), isteğe bağlı ana parola (PBKDF2 → AES-GCM, kilit açıkken anahtar `storage.session`'da). DPAPI eklentiden çağrılamadığı için elendi (Native Messaging gerekir).
- 2026-10-12: Faz 1 Egemen tarafından test edildi (aç/kapa, sağlayıcılar, şifreleme, NVIDIA ile bağlantı ve model testi). Gemini ön ayarı eklendi; ana parola en az 4 karakter.
- 2026-10-12: Faz 2 kararları: yerel depolama `browser.storage.local`; web geçişleri `url`/`title` alanıyla (seçenek b, DuoPDF'te değişiklik ister); terim anahtarı/lemma/eşleştirici ortak paket `duo-terms` (`../duo-terms`, `github:Egemen-16925/duo-terms#v1.0.0`).
- 2026-10-12: `duo-terms` (wink-lemmatizer) bir betiğe ~1,7 MB ekler; her sayfaya yüklenen bootstrap'a asla girmemeli.
- 2026-10-13: Kelime verisi `storage.local`'da kayıt başına anahtarla: `term:<anahtar>`, `occ:<anahtar>` (geçiş dizisi: cümle, url, başlık), `sentence:<sha256>`, `tomb:term:<anahtar>`, `cache:<istem@sürüm:özet>`. Tek yazan background'dır (`src/terms/`); yazmalar sıralıdır, eşleştirici bellekte tutulur ve her yazmada yenilenir.
- 2026-10-13: `duo-terms` v1.1.0: cümle anahtarı (`cleanText`, `sentenceKey`) da ortak pakette. Testler WXT'nin `WxtVitest` eklentisi ve bellek içi `fakeBrowser` ile çalışır (`vitest.config.ts`).
- 2026-10-13: Seçim baloncuğu (`src/entrypoints/content/`) düz DOM ile, kapalı Shadow DOM içinde; React ve `duo-terms` sayfa betiğine girmez (betik ≈11 kB). En çok 6 kelimelik, tek cümle içindeki seçim terim; daha uzunu ya da cümle sınırını aşanı cümle çevirisi. Bağlam cümlesi `Intl.Segmenter` ile bloktan çıkarılır. Çeviri yalnızca düğmeye basınca istenir.
- 2026-10-13: DuoPDF tarafında gereken işler `duopdf-yapilacaklar.md` dosyasında.
- 2026-10-13: Egemen'in isteğiyle çeviri otomatik: metin seçilince baloncuk anlamı/çeviriyi kendiliğinden ister, "Çevir" düğmesi yok, "Yeniden çevir" var (DuoPDF'teki gibi). `main.md` bölüm 11 buna göre güncellendi.
- 2026-10-13: Sayfa işaretleri (`content/marks.ts`): metin düğümleri background'a gönderilir (`page:match`), dönen konumlar CSS Custom Highlight API ile arka plan rengiyle vurgulanır; "biliyorum" renklenmez. Üzerinde durunca baloncuk kayıtlı anlamla açılır (AI çağırmaz). Kelime listesi değişince background tüm sekmelere `rescan` yollar; DOM değişiminde 800 ms gecikmeli yeniden tarama. Çok kelimeli terimler satır içi etiketle bölünmüşse eşleşmez (metin düğümü başına eşleştirme).
- 2026-10-13: İşaret ayarları (`storage/markSettings.ts`, ayarlar sayfasında "Sayfadaki işaretler"): durum başına renklendirme anahtarı (biliyorum varsayılan kapalı) ve ortak renk yoğunluğu (%10–%60, 10'ar). Sayfaya stil yazmamak için her durum × yoğunluk için hazır `::highlight` kuralı var (`marks.css`, 18 kural).
- 2026-10-13: Faz 2 kapandı. Baloncuk Firefox'ta Egemen tarafından denendi; sayfa işaretleri (2c) ve işaret ayarları yalnızca Chromium tabanlı test sayfasında doğrulandı, Firefox'ta denendiği bildirilmedi.
- 2026-10-13: Fosforlu kalem (`content/pen.ts`), Egemen'in isteğiyle DuoPDF'teki gibi **serbest çizim**: iz üst katmanda (Shadow DOM içinde SVG, `pointer-events: none`) çizilir; bırakınca izin geçtiği metin bulunur, kelime sınırlarına genişletilir ve baloncuk açılır. Yeni iz başlayınca öncekiler solar, yoksa gecikmeden sonra solar. Sayfada sürüklenebilen kalem paneli (duraklat, renkler, kapat); konum ve ayarlar `penSettings`'te. Kalemin açık olduğu sekme `storage.session` `pen:<tabId>` ile hatırlanır (`hello` yanıtında döner). Bağlantıların üzerinden de çizilir: 6 pikselden az oynayan basış tıklama sayılır, sürüklemeden sonraki tıklama yutulur. Kısayol manifest `commands` ile `Alt+Shift+H`; popup'ta düğme (popup, sayfa betiğinin durumunu birkaç kez yeniden sorar; eklenti yeni açıldığında düğme gecikmeden görünsün diye).
- 2026-10-13: Faz 3 kapandı. Kalem Egemen tarafından Firefox'ta kullanıldı (panel, bağlantı sorunu ve popup gecikmesi onun bildirimleriyle düzeltildi); son düzeltmelerin ve `Alt+Shift+H` kısayolunun Firefox'ta denendiği bildirilmedi.
- 2026-10-13: DuoPDF, `duopdf-yapilacaklar.md`'deki iki işi yaptı (`duo-terms` v1.1.0'a geçti; web geçişlerinde `url`/`title`, eşitleme anahtarı `terim + url + cümle`). Sıradaki DuoPDF işi `duopdf-yapilacaklar2.md`: eşitleme biçimindeki dosyayı birleştirerek içe aktarma.
- 2026-10-13: Kelime listesi (`entrypoints/sidepanel`): tek sayfa, kenar çubuğunda kart, `?page` ile yeni sekmede tablo (760 px üstü). Liste `storage.local`'dan doğrudan okur (`terms/wordList.ts`, `duo-terms` içermez) ve `storage.onChanged` ile yenilenir; düzenleme `term:update` / `term:delete` mesajlarıyla background'dan geçer. Silme onayı sayfa içi onay penceresi (ilk sürümdeki iki tıklamalı düğme okunmadığı için değiştirildi). Önek sabitleri `terms/keys.ts`'te. JSON biçimi `duopdf-sync` olacak.
- 2026-10-13: Dışa/içe aktarma (`src/sync/`): `snapshot.ts` DuoPDF'in `duopdf-sync` biçimini ve birleştirme kurallarını taşır (yalnızca terimler, geçişler, cümleler, silme izleri; belgeler/çizimler/sınavlar Firelingo'da yok), `export.ts` düz liste / TSV / Markdown / JSON üretir, `import.ts` background'da kelime yazmalarıyla aynı sırada birleştirir (`data:import`); yerelde silinmiş ama dosyada duran kelime geri gelir ve `updatedAt` şimdiye çekilir (eski silme izi onu yeniden silmesin). `Occurrence.url` / `title` artık isteğe bağlı: DuoPDF belge geçişleri kendi alanlarıyla saklanıp geri yazılır. Faz 6'da Drive eşitlemesi aynı `mergeShared` / `applyShared`'i kullanacak; DuoPDF'e ait bölümler o katmanda dokunulmadan geçirilmeli.
- 2026-10-13: İçe aktarma düz kelime listesini de kabul eder (`importWordList`): metin `{` ile başlamıyorsa satır satır kelime sayılır, yeni kelimeler `unknown` eklenir, mevcut kelimeye dokunulmaz (yalnızca boş çeviri doldurulur). Kök bulma yapılmaz; kelime yazıldığı gibi anahtar olur, ama önce eşleştiriciyle mevcut terim aranır.
- 2026-10-13: Faz 4 kapandı; Egemen testlerin geçtiğini bildirdi. Düz liste içe aktarması ve "silinen kelime geri gelir" düzeltmesi ondan sonra eklendi, Firefox'ta denendiği bildirilmedi.
- 2026-10-12: İkonlar yer tutucu SVG (`public/icon/on.svg`, `off.svg`); asıl ikon Faz 5'te.
- 2026-10-13: Faz 5: sağ tık menüsü (`contextMenus` izni; background her uyanışta `removeAll` + `create`; eklenti kapalı sitede geçici baloncuk açılır; 2026-10-15'te Egemen'in isteğiyle tek öğe "Firelingo ile çevir", alt menü ve "Bilmiyorum olarak işaretle" yok), ikon alev içinde F (aynı dosya adları, açık turuncu / kapalı gri), README Türkçe + İngilizce özet. Baloncukta ayar gerektiren hatalarda "Ayarları aç" bağlantısı (`options:open` mesajı); background'a ulaşılamazsa "sayfayı yenile" mesajı; model seçilmemişse açık uyarı.
- 2026-10-15: Faz 5 kapandı; Egemen testlerin geçtiğini bildirdi (sağ tık menüsünün tek öğeye indirilmesi ondan sonra yapıldı).
