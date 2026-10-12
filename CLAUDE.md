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

- `npm run dev` — Firefox'u eklenti yüklü açar (WXT, canlı yenileme)
- `npm run build` — `.output/firefox-mv3/` altına derler
- `npm run compile` — tip kontrolü

## İlerleme durumu

- [ ] Faz 0 — Kurulum
- [ ] Faz 1 — Aç/kapa + ayarlar
- [ ] Faz 2 — Baloncuk + çeviri + durumlar
- [ ] Faz 3 — Fosforlu kalem
- [ ] Faz 4 — Sidebar + dışa/içe aktarma
- [ ] Faz 5 — Cila
- [ ] Faz 6 — Google Drive ile DuoPDF senkronu
- [ ] Faz 7 — Yayın

## Karar günlüğü

- 2026-10-12: UI framework React (DuoPDF ile aynı). Lisans MIT. Depo herkese açık.
- 2026-10-12: TypeScript `~6.0.3` (DuoPDF ile aynı sürüm hattı).
