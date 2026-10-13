# Firelingo — Proje Ana Belgesi

> Firefox için AI destekli kelime öğrenme eklentisi. Web sayfalarında İngilizce kelime ve cümleleri seçip Türkçeye çevirir. Kelimeleri **bilmiyorum / az biliyorum / biliyorum** olarak işaretler. Geçici bir fosforlu kalem sunar. Kelime listesini dışa aktarır ve kardeş proje **DuoPDF** ile aynı kelime havuzunu paylaşır.
>
> **DuoPDF:** `../Duopdf` (bu klasörün kardeşi). Tauri 2 + React + Dexie. Repo: `Egemen-16925/Duopdf`. Faz 0–8 tamamlanmış durumda. Kelime işaretleme, aralıklı tekrar, sınavlar ve **Google Drive eşitlemesi** zaten çalışıyor. Firelingo'nun veri modeli ve senkronu **DuoPDF'e uyar**; tersi değil. Kod yazmadan önce `../Duopdf/CLAUDE.md` dosyasını oku (özellikle "Eşitlemeye hazır veri", "Veri modeli" ve "Karar günlüğü").

---

## 0. Claude Code için çalışma kuralları (EN ÖNEMLİ BÖLÜM)

Bu belgeyi okuyan Claude Code oturumu şu kurallara uymalıdır:

1. **Otomatik ilerleme yok.** Kod yazmaya başlamadan önce o adımın planını kısaca anlat ve onay bekle.
2. **Şunlar için mutlaka sor:**
   - Yeni bir npm paketi eklemek
   - Klasör yapısını ya da veri şemasını değiştirmek
   - `manifest` izinlerini eklemek veya değiştirmek
   - UI/görsel tasarım kararları (renkler, yerleşim, animasyonlar)
   - Bir fazdan diğerine geçmek
   - Git commit atmak (commit mesajını öner, onay bekle)
   - Bu belgede belirtilmemiş ya da belirsiz kalan her şey
3. **Tahmin etme, sor.** Bir davranış belgede net değilse varsayımda bulunma. Seçenekleri (artı/eksi) sun, kullanıcı seçsin.
4. **Küçük adımlarla çalış.** Her adımın sonunda şunları yaz:
   - (a) Ne yapıldı
   - (b) Firefox'ta nasıl test edilir (adım adım)
   - (c) Sıradaki adım ne
5. **Bu belgeyi güncel tut.** Bir karar verildiğinde ilgili bölümü güncellemeyi öner. Bölüm 12'deki "Açık sorular" listesi çözüldükçe kapanır.
6. Kullanıcıyla **Türkçe** konuş. Kod, değişken adları ve commit mesajları İngilizce olsun.
7. İlk iş olarak, bu kuralları kısaca özetleyip `main.md`'ye yönlendiren bir `CLAUDE.md` dosyası oluşturmayı **öner**. Kullanıcı onaylarsa oluştur. (Claude Code her oturumda `CLAUDE.md`'yi otomatik okur, `main.md`'yi okumaz.)
8. **DuoPDF'e dokunma.** `../Duopdf` klasörünü serbestçe okuyabilirsin, ama içinde hiçbir dosyayı değiştirme. DuoPDF tarafında değişiklik gerekiyorsa (ör. web kaynakları için yeni bir alan) ne gerektiğini yaz ve kullanıcıya sor. Değişikliği kullanıcı DuoPDF'in kendi oturumunda yaptıracak.
9. **API anahtarı asla repoya girmesin** (kod, test, `.env`, commit mesajı). Kullanıcı sohbete anahtar yapıştırırsa kullanma, ayarlar sayfasından girmesini söyle.
10. **Test edemediğin şeyi "çalışıyor" diye bildirme.** Gerçek API çağrısını, gerçek Firefox'u ve Drive'ı yalnızca kullanıcı deneyebilir. Neyi kendin doğruladığını (build, tip kontrolü, birim testleri), neyi kullanıcının denemesi gerektiğini ayrı ayrı yaz.
11. **Kapsamı büyütme.** Bu belgede olmayan bir özellik aklına gelirse öner, onay bekle.

---

## 1. Özet

| Alan | Karar |
|---|---|
| Platform | Firefox (masaüstü). İleride Chrome'a taşınabilir olsun. |
| Framework | **WXT** + **TypeScript** |
| Manifest | MV3 (WXT Firefox'u varsayılan olarak MV2 derleyebilir; MV3 hedefi config'te açıkça ayarlanmalı, kurulumda doğrulanmalı) |
| Dil yönü | İngilizce → Türkçe (sabit) |
| AI | Kullanıcının kendi API anahtarı, OpenAI-uyumlu istemci |
| Depolama | `browser.storage.local` — sunucu yok, her şey yerel |
| Varsayılan durum | Eklenti her sitede **kapalı**; kullanıcı açar |
| DuoPDF ile senkron | Google Drive `appDataFolder` içindeki `duopdf-sync.json` (DuoPDF'in mevcut eşitleme dosyası); bkz. bölüm 6 |
| Lisans | Açık kaynak; öneri MIT (DuoPDF ile aynı) — kurulumda onaylat |

---

## 2. Kapsam

**Kapsamda:**
- Site bazlı aç/kapa
- Seçim baloncuğu ile kelime ve cümle çevirisi
- Kelime durumları
- Geçici fosforlu kalem
- Kelime listesi paneli
- Dışa/içe aktarma
- Ayarlar sayfası (bağlantı testi, model testi)
- DuoPDF ile ortak kelime havuzu (Google Drive senkronu + elle aktarma)

**Kapsam dışı (şimdilik):**
- Kendi sunucusu ya da hesap sistemi (senkron yalnızca kullanıcının kendi Google Drive'ı üzerinden, DuoPDF'teki gibi)
- Mobil Firefox
- İngilizce dışında kaynak diller
- Quiz ve sınav (bunlar DuoPDF'in işi)

---

## 3. Özellikler

### 3.1 Aç/kapa — reklam engelleyici mantığı

Toolbar butonuna tıklanınca küçük bir **popup** açılır:

- Büyük bir **güç düğmesi**: yalnızca bu sekme için, geçici (tarayıcı kapanınca gider). Site kuralı varken basılırsa kural kaldırılır ve sekme geçici olarak açılır/kapanır.
- Düğmenin altında durum (**Açık / Kapalı**) ve kapsamı ("Yalnızca bu sekmede · geçici", "Bu site için kalıcı", "Varsayılan olarak kapalı").
- **Bu site için** seçici: **Sor** (kural yok) / **Hep açık** / **Hep kapalı**. Site için kural yokken "Her sitede açık" geçerliyse seçici "Hep açık"ı gösterir.
- **Ayarlar** düğmesi: ayarlar sayfasını yeni sekmede açar.
- Kısa istatistik: bu sayfadaki işaretli kelime sayısı (Faz 2'de eklenecek).

**Her sitede açık** (global anahtar; varsayılan kapalı) ve **Varsayılanları sıfırla** ayarlar sayfasında, "Genel ayarlar" altındadır. Sıfırlama onay ister; site kurallarını, global anahtarı ve sekmelerdeki geçici seçimleri siler, API ayarlarına dokunmaz.

**Öncelik sırası:** site kuralı (`always_on` / `always_off`) > sekme oturum ayarı > global ayar.

Toolbar ikonu durumu yansıtır: renkli = açık, gri = kapalı (`browser.action.setIcon`, sekme bazlı).

**Teknik not:** Content script tüm http/https sitelerine (`*://*/*`) çok hafif bir "bootstrap" olarak yüklenir. Durumunu background'a sorar ve kapalıysa hiçbir şey yapmaz (DOM'a dokunmaz, sayfaya dinleyici eklemez; yalnızca eklenti mesajlarını dinler ki sayfa yenilenmeden açılabilsin). Açıksa asıl modülü başlatır. `tabs` izni kullanılmaz.

Kural anahtarı **tam hostname**'dir (`en.wikipedia.org`); alt alan adları ayrı sayılır.

### 3.2 Seçim baloncuğu

Eklenti açıkken kullanıcı metin seçtiğinde, seçimin yanında baloncuk çıkar.

- **Tek kelime ya da en çok 6 kelimelik öbek seçildiyse** (tek cümle içinde; "carry out" gibi öbekler tek terim olur):
  - Çeviri butonu
  - 🔴 Bilmiyorum · 🟡 Az biliyorum · 🟢 Biliyorum
  - Kelime zaten listedeyse mevcut durumu gösterilir
- **6 kelimeden uzun ya da cümle sınırını aşan seçimde:**
  - Cümleyi çevir
  - Cümle içindeki kelimelere tıklayıp tek tek işaretleme (çevirinin altında, kelimeler buton olarak listelenir)
- Kelime çevirisi **bağlam cümlesiyle** birlikte AI'a gider, böylece doğru anlam döner. Lemma da döner ("running" → "run").
- Baloncuk **Shadow DOM** içinde olmalı (WXT `createShadowRootUi`), böylece sitenin CSS'i etkilemez.
- `Esc` ile ya da dışarı tıklayınca kapanır.
- Sağ tık menüsünde (`contextMenus`) "Firelingo: Çevir" ve "Firelingo: Bilmiyorum olarak işaretle" seçenekleri bulunur.

### 3.3 Kelime işaretleri sayfada

- Listedeki kelimeler, eklentinin açık olduğu her sayfada durum rengiyle **arka planla** gösterilir (bilmiyorum kırmızı, az biliyorum sarı, biliyorum yeşil). Ayarlar sayfasındaki "Sayfadaki işaretler" bölümünden her durum ayrı ayrı açılıp kapatılır ("biliyorum" varsayılan kapalı) ve renk yoğunluğu (%10–%60) ayarlanır. Sayfanın DOM'una dokunulmaz (CSS Custom Highlight API); Firefox bu API'de alt çizgiyi desteklemediği için arka plan kullanılır. Eşleştirme background'da yapılır, yapay zekâ çağırmaz.
- **Açık soru:** Listede olan kelimeler eklentinin açık olduğu *her sayfada* otomatik renklensin mi (LingQ tarzı)? Önerilen: ayarlardan açılıp kapanan bir seçenek olsun, "biliyorum" durumu varsayılan olarak renklenmesin.
- İşaretli kelimenin üzerinde kısa süre durunca baloncuk açılır: kayıtlı çeviri + durum değiştirme (yapay zekâ çağırmaz; "Yeniden çevir" ile istenebilir). Uzaklaşınca kendiliğinden kapanır.

### 3.4 Geçici fosforlu kalem

**Amaç:** Okurken göz takibi için geçici vurgu yapmak. Kalıcı bir not alma aracı değil.

- Kalem modu bir **kısayol** (`Alt+Shift+H`; Firefox'un "Eklenti kısayollarını yönet" ekranından değiştirilir) ya da popup'taki "Fosforlu kalem" düğmesiyle açılır ve kapanır. Açılınca sayfada **sürüklenerek taşınabilen küçük bir kalem paneli** çıkar: taşıma tutamağı, çizimi duraklat/sürdür düğmesi, renkler ve kapat. Panelin konumu hatırlanır. Kalem sekmeye bağlıdır: aynı sekmede başka sayfaya geçince açık kalır, tarayıcı kapanınca sıfırlanır. (Paneli eklenti menüsünden sayfaya sürükleyip bırakmak mümkün değildir; popup ayrı bir penceredir.)
- Kalem **normal bir kalem gibi serbest çizer** (DuoPDF'teki gibi; ilk tasarımdaki "harflere oturan vurgu" Egemen'in isteğiyle bırakıldı): fareyi basılı tutup sürükleyince yarı saydam, yuvarlak uçlu bir iz kalır. Bırakınca izin üzerinden geçtiği metin `document.caretPositionFromPoint` ile bulunur ve kelime sınırlarına genişletilir.
- **Çok satır davranışı:** Kullanıcı bir satırı boyar, kalemi kaldırır, alt satırı boyar. Bunun için kalemi kaldırmadan tüm alanı tek hamlede boyamak zorunda değildir.
  - Her vurgu (stroke) kendi zamanlayıcısına sahiptir.
  - Yeni bir vurgu başladığında önceki vurgular **solmaya başlar** (opacity animasyonu).
  - Kullanıcı hızlı ardışık vurgu yaptığında bir önceki vurgu hemen kaybolmaz. Kısa bir süre yeni vurguyla birlikte görünür kalır, böylece "aynı anda iki satır" boyalı görünebilir.
  - Hiç yeni vurgu yapılmazsa vurgu belirli bir süre sonra kendiliğinden solar.
  - Önerilen varsayılanlar (ayarlanabilir): solma gecikmesi 3 sn, solma süresi 1,5 sn, aynı anda görünen en fazla vurgu sayısı 3.
- İzler sayfanın DOM'unu bozmaz: eklentinin kendi **üst katmanında** (Shadow DOM içinde SVG) çizilir, sayfayla birlikte kayar ve CSS geçişiyle solar.
- Kalem modunda metin seçimi kapalıdır. Bağlantı ve düğmelerin üzerinden de çizilebilir: sürükleme iz bırakır (bağlantı açılmaz), yerinde tıklama normal çalışır. Metin kutularında kalem devreye girmez. Panelden çizim duraklatılabilir; duraklatılmışken bir renge dokunmak kaleme geri döndürür.
- **Kalemi bırakınca baloncuk açılır** (DuoPDF'teki gibi): kısa parça için kelime, uzun parça için cümle çevirisi.
- Renk kalem panelinden ya da ayarlardan seçilir (sarı, yeşil, pembe, mavi). İz sabitlenemez.
- **Açık soru:** Vurgunun kalıcı yapılması (sabitle) gerekli mi?
- **Referans:** DuoPDF Faz 4b'de benzer bir "geçici parlak kalem" var: kelimelere yapışıyor, birkaç saniyede soluyor, bırakınca kısa parça için kelime penceresi, uzun parça için cümle çevirisi açıyor. Firelingo'da kalem bırakılınca baloncuk açılsın mı → açık soru. Uygulamadan önce DuoPDF'teki kodu incele.

### 3.5 Kelime listesi (sidebar)

Firefox `sidebar_action` ile açılır (popup'taki "Kelime listesi" düğmesi ya da Firefox'un kenar çubuğu menüsü). Kenar çubuğu dar olduğu için orada **kart listesi** gösterilir; "Tam sayfada aç" aynı listeyi yeni sekmede **tablo** olarak açar.

- Alanlar: kelime, çeviri, durum, bağlam cümlesi (birden fazlaysa açılır), kaynak site, tarih
- Filtreler: durum, site, arama
- Satır içi düzenleme: çeviriyi düzelt (kutudan çıkınca kaydedilir), durumu değiştir, sil (onay penceresi sorar)
- Toplu işlem: seçilenleri farklı bir duruma taşı veya sil

### 3.6 Dışa / içe aktarma

- **Panoya kopyala** (filtrelenmiş liste):
  - Düz liste (`kelime — çeviri`)
  - TSV (Anki import uyumlu)
  - Markdown tablo
  - **JSON**: DuoPDF eşitleme biçimi (`format: "duopdf-sync"`, sürüm 1; bkz. bölüm 6). Süzülmüş listede yalnızca o kelimeler ve geçişleri; cümle çevirileri ve silme izleri her zaman tam.
- **Dosya olarak indir:** tüm veri, `.json` (aynı biçim).
- **İçe aktar (düz liste):** her satırda bir kelime ya da öbek olan metin de kabul edilir (isteğe bağlı `kelime — çeviri` ya da sekmeyle ayrılmış çeviri ve cümle; Firelingo'nun kendi düz liste ve TSV çıktıları geri okunur). Yeni kelimeler "bilmiyorum" olarak eklenir; listede zaten olan kelimeye dokunulmaz, yalnızca boş çevirisi doldurulur. Kelime olarak okunamayan satırlar atlanır ve sayısı bildirilir.
- **İçe aktar (JSON):** JSON yapıştır veya dosya seç. Mevcut veri silinmez, **birleştirilir** (bölüm 6'daki kurallar: yeni `updatedAt` kazanır, geçişler birleşir, silme izi yalnızca kayıttan yeniyse siler). Eşitlemeden tek farkı: dışa aktarımdan sonra yerelde silinmiş bir kelime dosyada duruyorsa **geri gelir** (kullanıcı dosyayı bilerek içe alıyor); dosyanın kendi silme izleri ise normal uygulanır. Sonunda kaç kelimenin eklendiği, güncellendiği ve silindiği gösterilir. DuoPDF'in belge geçişleri ve bilinmeyen alanlar olduğu gibi korunur.

### 3.7 Ayarlar sayfası (options)

- **Sağlayıcı ön ayarları** (base URL'yi otomatik doldurur): OpenAI, NVIDIA, Google Gemini, OpenRouter, Groq, Ollama (yerel), Özel. Ön ayar URL'leri kurulumda dokümantasyondan doğrulanmalı.
- **Birden fazla sağlayıcı** kaydedilebilir; üstteki sekmelerden tek tıkla geçilir. Seçili sağlayıcı çeviride kullanılır; her biri kendi adını, base URL'sini, API anahtarını (göster/gizle) ve modelini hatırlar.
- **Anahtar güvenliği:** anahtarlar AES-GCM ile şifreli saklanır (bkz. bölüm 11). İsteğe bağlı ana parola belirlenebilir, kilitlenebilir, kaldırılabilir; unutulursa anahtarlar silinerek sıfırlanır.
- **Bağlantıyı test et:** Seçili modele çok küçük bir sohbet isteği atılır (ör. "ok" yanıtı istenir). Başarılıysa yeşil tik ve süre gösterilir. Başarısızsa anlaşılır bir Türkçe hata gösterilir (401 = anahtar hatalı, 404 = URL/model hatalı, 429 = istek sınırı, ağ hatası vb.). Sadece `GET /models` yeterli değildir: DuoPDF'te görüldüğü gibi NVIDIA `/v1/models` anahtarsız da yanıt veriyor, yani anahtarı doğrulamıyor.
- **Modelleri listele:** `/models` sonucu aranabilir bir açılır listeye dolar. Liste boşsa ya da endpoint desteklenmiyorsa model adı elle girilebilir.
- **Modeli test et:** Gömülü örnek listesinden **rastgele bir kelime (bağlamıyla) ve bir cümle** seçilir ve seçili modelle çevrilir. Gösterilenler:
  - Çıktı
  - Süre (ms)
  - JSON'un şemaya uyup uymadığı (✓ / ✗)
  - Varsa token kullanımı
  - "Tekrar dene (başka örnek)" butonu
- **Sayfadaki işaretler:** bilmiyorum / az biliyorum / biliyorum için ayrı ayrı otomatik renklendirme anahtarı ve ortak renk yoğunluğu.
- Kalem ayarları (bölüm 3.4).
- Veri: tümünü dışa aktar, içe aktar, tümünü sil (onaylı).

---

## 4. AI katmanı

- Tek bir `aiClient` modülü (OpenAI-uyumlu `POST {baseUrl}/chat/completions`). Tüm çağrılar **background script'ten** yapılır; content script mesajla ister. API anahtarı sayfaya hiçbir zaman girmez. Background script, `host_permissions` verilen adreslere CORS'a takılmadan istek atabilir (DuoPDF'teki NVIDIA CORS sorunu burada yaşanmaz). Bu, Faz 1'de doğrulanmalı.
- **DuoPDF'teki kanıtlanmış yaklaşımı izle** (`../Duopdf/src/ai/`):
  - Önce `response_format: json_object` gönderilir; 400/422 gelirse onsuz tekrar denenir.
  - Şema her zaman prompt'ta yer alır, yanıt zod ile doğrulanır, bozuksa bir kez onarım denenir.
  - Prompt'lar sürüm numaralıdır (`wordMeaning@1`).
- Prompt'ları ve zod şemalarını DuoPDF'ten uyarlamak (kopyalamak) mantıklı: aynı kelime için iki uygulama aynı biçimde anlam üretir. Hangisinin alınacağını kullanıcıya sor.
- **Önbellek:** anahtar = `prompt sürümü + kelime + bağlam cümlesi` özeti (SHA-256). Aynı istek tekrar API'ye gitmez.
- Model rolleri: DuoPDF'te "hızlı" ve "güçlü" rolleri var. Firelingo'da şimdilik tek bir model yeterli (sadece kelime ve cümle çevirisi var). Yedek model (429'da yedeğe geç) Faz 5'te önerilebilir.
- Zaman aşımı, iptal (AbortController) ve oran sınırı hatası (429) için kullanıcıya bilgi verilir.

**Kelime prompt'u (taslak):**
```
System: Sen bir İngilizce→Türkçe sözlük asistanısın. Sadece geçerli JSON döndür.
User: Kelime: "{word}"
Bağlam cümlesi: "{sentence}"
Şu JSON'u döndür:
{ "lemma": string, "pos": string, "translation": string,
  "contextMeaning": string, "alternatives": string[] }
translation = bu bağlamdaki en uygun Türkçe karşılık (kısa).
```

**Cümle prompt'u (taslak):**
```
System: İngilizce metni doğal Türkçeye çevir. Sadece geçerli JSON döndür.
User: "{sentence}"
{ "translation": string, "notes": string[] }
notes = varsa deyim / zor yapı açıklamaları (en fazla 3, kısa).
```

Prompt'lar `src/ai/prompts.ts` içinde tutulur. Değiştirmeden önce kullanıcıya sorulur.

---

## 5. Veri modeli — DuoPDF'e uyumlu

**İlke:** Firelingo kendi şemasını icat etmez. Kelime kayıtları DuoPDF'in `terms` kaydıyla **aynı alanlara ve aynı anahtar üretimine** sahip olur. Böylece aynı kelime iki uygulamada tek kayıt olarak görünür.

DuoPDF'te bugün olan (yedek dosyasından ve `CLAUDE.md`'den görülen):

```ts
// DuoPDF terms (özet — kesin hali ../Duopdf/src içindeki tiplerden alınmalı)
interface Term {
  key: string;          // kararlı, cihazlar arası anahtar (ör. "analytics", "carry out")
  status: "unknown" | "learning" | "known";
  lemma: string;
  surface: string;      // görülen hali
  pattern: string[][];  // her kelime konumu için kabul edilen kökler
  meaning: string;      // Türkçe anlam
  explanation: string;
  note: string;
  createdAt: number;    // epoch ms
  updatedAt: number;    // birleştirmede belirleyici
  review: { intervalDays: number; dueAt: number; streak: number }; // aralıklı tekrar
}
// occurrences: terim anahtarı + belge hash'i + sayfa + cümle
// sentences: temizlenmiş cümlenin SHA-256'sı anahtar; metin + çeviri + dilbilgisi notu
// tombstones: silme izleri
```

**Firelingo için kurallar:**

- `key`, `lemma` ve `pattern` üretimi DuoPDF ile **birebir aynı** olmalı: `wink-lemmatizer` + modelin verdiği kök, "ran/running → run", "carried out → carry out". DuoPDF'teki fonksiyonu bul ve aynı mantığı Firelingo'ya taşı (kopyala ya da ortak modül yap → kullanıcıya sor). Bu iki projede aynı test girdileriyle test edilmeli.
- `review` alanına Firelingo **dokunmaz**. Yeni kelimede DuoPDF'in varsayılanıyla oluşturulur, mevcut kelimede olduğu gibi korunur. Aralıklı tekrar DuoPDF'in işi.
- Durum değişikliği `updatedAt`'i günceller.
- **Web kaynağı sorunu:** DuoPDF'te `occurrences` bir belge hash'ine bağlı. Web sayfası bir belge değil. Seçenekler (kullanıcıya sor; DuoPDF'te değişiklik gerektirebilir):
  - (a) Web sayfasını sahte bir belge olarak kaydet: `format: "web"`, hash = normalize edilmiş URL'nin SHA-256'sı, ad = sayfa başlığı. DuoPDF açmaya çalışmaz ama listede kaynak olarak görünür.
  - (b) `occurrences`'a isteğe bağlı `url` / `title` alanı ekle.
  - (c) Web'de geçiş kaydı tutma, sadece cümleyi `sentences`'a yaz.
- Bilinmeyen alanlar **korunur**. Firelingo, DuoPDF'in bilmediği bir alanını silmemeli; okuduğu kaydı yazarken anlamadığı alanları olduğu gibi geri yazar.

**Firelingo'nun kendi yerel verisi** (`browser.storage.local` ya da IndexedDB; seçim Faz 2'de sorulur):
- `terms`, `sentences`, `tombstones` (eşitlenir)
- `settings`, `siteRules`, `translationCache`, `syncState` (eşitlenmez)

---

## 6. DuoPDF senkronizasyonu

### Önerilen yol: Google Drive üzerinden otomatik senkron

DuoPDF zaten Google Drive'ın gizli `appDataFolder` klasöründe tek bir `duopdf-sync.json` dosyası tutuyor ve onu birleştirerek eşitliyor (DuoPDF karar günlüğü, 2026-10-03). Firelingo da **aynı dosyaya** katılırsa:

- DuoPDF kapalıyken bile çalışır (yerel sunucu gerekmez).
- DuoPDF'in Windows ve (ileride) Android sürümleriyle aynı havuz kullanılır.
- Yeni bir sunucu gerekmez; "sunucu yok" ilkesi korunur.

**Akış:**
1. Drive'dan `duopdf-sync.json` okunur.
2. Yerel veriyle birleştirilir (DuoPDF'in kuralıyla: terim/çeviride yeni `updatedAt` kazanır, geçişler birleşir, silme izi yalnızca kayıttan yeniyse siler).
3. Sonuç yerel veriye uygulanır.
4. Dosya geri yazılır. Firelingo'nun dokunmadığı bölümler (çizimler, sınav cevapları, belgeler…) **aynen korunur**.
5. Zamanlama: eklenti açılınca, kelime işaretlendikten birkaç saniye sonra (toplu), birkaç dakikada bir ve "Şimdi eşitle" butonu.

**Dikkat edilecekler (Faz 6'da çözülecek, her biri kullanıcıya sorulacak):**
- **Aynı Drive klasörü:** `appDataFolder` Google Cloud **projesine** bağlıdır. Firelingo'nun OAuth istemcisi, DuoPDF'in istemcisiyle **aynı Google Cloud projesinde** olmalı. Bunu Google dokümantasyonundan doğrula.
- **Firefox'ta OAuth:** `browser.identity.launchWebAuthFlow` + `browser.identity.getRedirectURL()`. Google tarafında "Web uygulaması" türünde bir istemci ve bu yönlendirme adresi gerekir. Token yenileme ve istemci gizli anahtarı (repoya girmez; kullanıcı ayarlardan girer, DuoPDF'teki gibi) konusu araştırılıp seçenekler sunulmalı.
- **Aynı anda yazma:** İki uygulama aynı anda yazarsa biri diğerinin değişikliğini ezebilir. DuoPDF'in buna ne yaptığını incele. Gerekirse yazmadan hemen önce yeniden oku → birleştir → yaz. Drive `version` / `modifiedTime` kontrolü ile çakışma algıla, tekrar dene.
- **Dosya biçimi değişirse** DuoPDF bozulmamalı. Firelingo sadece DuoPDF'in zaten tanıdığı alanları yazar.

### Yedek yol: elle dışa/içe aktarma

- Firelingo, DuoPDF'in **yedek dosyası biçiminde** (`format: "duopdf-backup"`) ya da sadece terimleri içeren bir JSON üretir. DuoPDF'in içe aktarması **mevcut veriyi tamamen değiştirir** (birleştirmez). Bu yüzden elle aktarma için DuoPDF'e "birleştirerek içe aktar" seçeneği gerekebilir. Bunu kullanıcıya bildir, DuoPDF'te kendin yapma.
- Drive senkronu kurulana kadar (Faz 4–5 arası) bu yol kullanılır.

### Neden diğer yollar değil

- **Yerel API (127.0.0.1) / Native Messaging:** DuoPDF'in açık olmasını ya da ek kurulum gerektirir. DuoPDF'te Rust tarafında kod yazmak gerekir. Drive zaten hazır olduğu için gereksiz.

---

## 7. Klasör yapısı (öneri — kurulumda onaylanacak)

```
Documents/
├─ Duopdf/                    # kardeş proje — sadece okunur
└─ firelingo/
   ├─ main.md
   ├─ CLAUDE.md
   ├─ wxt.config.ts
   ├─ src/
   │  ├─ entrypoints/
   │  │  ├─ background.ts     # AI çağrıları, mesajlaşma, ikon durumu, senkron zamanlayıcı
   │  │  ├─ content/          # bootstrap + baloncuk + kalem + işaretler
   │  │  ├─ popup/            # aç/kapa paneli
   │  │  ├─ sidebar/          # kelime listesi
   │  │  └─ options/          # ayarlar + testler + Drive bağlantısı
   │  ├─ ai/      (client.ts, prompts/, cache.ts)
   │  ├─ terms/   (key.ts, lemma.ts)       # DuoPDF ile birebir aynı anahtar üretimi
   │  ├─ storage/ (terms.ts, settings.ts, siteRules.ts)
   │  ├─ sync/    (merge.ts, drive.ts, oauth.ts, export.ts, import.ts)
   │  ├─ shared/  (types.ts, messages.ts)
   │  └─ assets/  (test-samples.json, icons)
   └─ tests/      (merge, key, siteRules, parse testleri)
```

UI framework: **React önerilir** (DuoPDF React kullanıyor; bileşen ve alışkanlık paylaşılır). Ama eklentinin baloncuğu çok sayfaya yükleneceği için boyut önemli; Preact ya da Vanilla TS de seçenek. Kurulumda artı ve eksileriyle sor.

---

## 8. İzinler (manifest)

- `storage`, `contextMenus`, `clipboardWrite`, `activeTab`
- Content script için `<all_urls>` (bootstrap kapalıyken hiçbir şey yapmaz; bu durum README'de açıklanmalı)
- API domainleri: `optional_host_permissions`. Kullanıcı bir sağlayıcı seçtiğinde ya da "Bağlantıyı test et"e bastığında izin istenir.
- Faz 6: `identity` ve `https://www.googleapis.com/*`, `https://oauth2.googleapis.com/*` (isteğe bağlı izin olarak, Drive bağlanınca istenir).

Her izin eklenmeden önce kullanıcıya sorulur.

---

## 9. Fazlar ve kabul kriterleri

Her fazın sonunda Claude Code durur. Build ve tip kontrolünü çalıştırır, test adımlarını verir ve bir sonraki faza geçmek için onay bekler. Faz bitince `git tag faz-N` önerilir (onaylı).

**Faz 0 — Kurulum**
- `../Duopdf/CLAUDE.md` ve ilgili kaynak kod okunur. Kullanıcıya kısa bir özet verilir: DuoPDF'ten ne alınacak (terim anahtarı, prompt'lar, merge kuralları).
- WXT projesi oluşturulur, Firefox MV3 hedefi ayarlanır, UI framework seçilir.
- Git deposu açılır (GitHub'a gönderme onaylı). `CLAUDE.md` oluşturulur (onaylı).
- ✅ `npm run dev` ile Firefox açılıyor ya da `about:debugging` üzerinden geçici yüklenebiliyor ve boş popup açılıyor.

**Faz 1 — Aç/kapa + ayarlar**
- Popup'taki site kuralları, ikon durumu ve bootstrap çalışır.
- Ayarlar sayfasında sağlayıcı, anahtar, bağlantı testi, model listesi ve model testi (rastgele kelime ve cümle) bulunur.
- ✅ Kapalı sitede DOM'a hiçbir şey eklenmiyor.
- ✅ Gerçek bir API anahtarıyla (NVIDIA) model testi JSON çıktısı gösteriyor.

**Faz 2 — Baloncuk + çeviri + durumlar**
- Seçim baloncuğu, kelime ve cümle çevirisi, üç durum, DuoPDF uyumlu terim anahtarı, depolama, önbellek ve sayfadaki işaretler çalışır.
- ✅ "running" ve "ran" işaretlenince tek kayda ("run") düşüyor.
- ✅ Kelime işaretlenip sayfa yenilendiğinde işaret geri geliyor.
- ✅ Anahtar üretimi DuoPDF'le aynı test girdilerinde aynı sonucu veriyor.

**Faz 3 — Fosforlu kalem**
- Kalem modu, çok satır, solma davranışı ve ayarlar çalışır.
- ✅ Ardışık iki satır boyanabiliyor, önceki vurgu tanımlanan sürede soluyor, sayfa düzeni bozulmuyor.

**Faz 4 — Sidebar + dışa/içe aktarma**
- Liste, filtreler, düzenleme, kopyalama formatları (düz liste, TSV/Anki, Markdown, JSON), JSON indir/yükle ve merge çalışır.
- ✅ Dışa aktarılan JSON tekrar içe aktarıldığında veri çoğalmıyor.
- ✅ Merge testleri geçiyor.

**Faz 5 — Cila**
- Otomatik renklendirme seçeneği, sağ tık menüsü, kısayollar, karanlık tema, hata mesajları, README, ikonlar.

**Faz 6 — Google Drive ile DuoPDF senkronu**
- Bölüm 6'daki akış uygulanır. Başta OAuth kurulumu kullanıcıyla adım adım yapılır.
- ✅ Firelingo'da işaretlenen kelime, eşitlemeden sonra DuoPDF'te görünüyor (ve tersi).
- ✅ Birinde silinen kelime diğerinden de siliniyor.
- ✅ DuoPDF'in çizimleri ve sınav geçmişi senkrondan sonra bozulmadan duruyor.
- ✅ İnternet yokken işaretlenen kelimeler bağlanınca gidiyor.

**Faz 7 — Yayın**
- AMO (addons.mozilla.org) paketleme ve GitHub sürümü. Yayından önce kullanıcı onayı alınır.

---

## 10. Test

- Birim testleri (Vitest): `merge`, site kuralı önceliği, AI JSON parse, lemma/id üretimi.
- Elle test sayfaları:
  - Uzun bir Wikipedia makalesi
  - Bir haber sitesi (dinamik içerik)
  - Bir SPA (ör. GitHub)
  - Bir `iframe` içeren sayfa
- Her fazın sonunda Claude Code, kullanıcı için adım adım test listesi yazar.

---

## 11. Güvenlik ve gizlilik

- API anahtarları `storage.local`'da **şifreli** durur (AES-GCM, WebCrypto); düz metin saklanmaz. Loglara ve hata mesajlarına yazılmaz. Dışa aktarılan JSON'a dahil edilmez.
  - Varsayılan: tarayıcıda üretilen, dışa aktarılamayan cihaz anahtarı (IndexedDB). Ek kurulum ve parola gerekmez; ama şifreleme anahtarı aynı Firefox profilinde durduğu için profil klasörünü ele geçiren birine karşı tam koruma değildir.
  - İsteğe bağlı **ana parola**: anahtar paroladan türetilir (PBKDF2, 600.000 tur) ve diske yazılmaz; kilit açıkken yalnızca `storage.session`'da durur, Firefox kapanınca kilitlenir.
  - Windows DPAPI bir eklentiden çağrılamaz (yardımcı program kurulumu gerekir); bu yüzden kullanılmadı.
- Metin, eklentinin açık olduğu sitelerde **kullanıcı bir metin seçtiğinde** (baloncuk açılınca çeviri kendiliğinden istenir) ve yalnızca kullanıcının seçtiği sağlayıcıya gönderilir: seçilen kelime ya da cümle ile kelimenin içinde geçtiği cümle. Sayfanın geri kalanı gönderilmez; işaretli kelimeleri renklendirmek için yapılan eşleştirme tamamen yereldir. Başka hiçbir yere veri gitmez.
- README'de veri akışı açıkça anlatılır.

---

## 12. Açık sorular (Claude Code bunları ilgili fazda kullanıcıya sormalı)

1. ~~UI framework: React (DuoPDF ile aynı) / Preact / Vanilla TS?~~ → **React** (2026-10-12)
2. ~~Listedeki kelimeler her sayfada otomatik renklensin mi? Varsayılan açık mı, kapalı mı?~~ → **Evet; durum başına ayarlanabilir** (bilmiyorum ve az biliyorum açık, biliyorum kapalı), renk yoğunluğu ayarlı (2026-10-13)
3. ~~Site kuralları alt alan adlarını kapsasın mı? (`docs.example.com` ↔ `example.com`)~~ → **Hayır, tam hostname** (2026-10-12)
4. ~~Fosforlu kalem: vurgu kalıcı yapılabilsin mi? Kalem rengi tek mi, seçilebilir mi? Kalem bırakılınca baloncuk açılsın mı (DuoPDF'teki gibi)?~~ → **Kalıcı yok; renk seçilebilir; bırakınca baloncuk açılır** (2026-10-13)
5. ~~Kalem modunda normal metin seçimi nasıl davranmalı? (kalem modunda seçim kapalı mı?)~~ → **Seçim kapalı** (2026-10-13)
6. ~~Web kaynakları DuoPDF'te nasıl temsil edilecek? (bölüm 5: a / b / c)~~ → **(b) geçişe `url` / `title` alanı**; DuoPDF tarafında değişiklik gerekir (2026-10-12)
7. ~~Terim anahtarı kodu DuoPDF'ten kopyalansın mı, yoksa ortak bir paket mi yapılsın?~~ → **Ortak paket `duo-terms`** (`github:Egemen-16925/duo-terms`, git etiketiyle kurulur); DuoPDF'in de pakete geçmesi gerekir (2026-10-12)
8. ~~DuoPDF'e "birleştirerek içe aktar" eklensin mi? (elle aktarma yolu için)~~ → **Evet**; iş tarifi `duopdf-yapilacaklar2.md` içinde. JSON biçimi DuoPDF eşitleme biçimi (`duopdf-sync`) (2026-10-13)
9. ~~Yerel depolama: `browser.storage.local` mı, IndexedDB (Dexie, DuoPDF ile aynı) mı?~~ → **`browser.storage.local`** (2026-10-12)
10. ~~Lisans: MIT (DuoPDF ile aynı) uygun mu?~~ → **MIT** (2026-10-12)
