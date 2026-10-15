# Firelingo

Firefox için, web'de okurken İngilizce kelime öğrenmeyi sağlayan yapay zekâ destekli bir eklenti. Bir kelimeyi ya da cümleyi seçersin, Türkçesini görürsün; kelimeleri **bilmiyorum / az biliyorum / biliyorum** olarak işaretlersin ve işaretlediklerin sonraki sayfalarda renkli görünür.

[English summary below.](#english)

> Durum: geliştirme aşamasında. Henüz Mozilla eklenti mağazasında (AMO) yayınlanmadı; aşağıdaki adımlarla kaynak koddan çalıştırılır.

## Neler yapar

- **Site bazlı aç/kapa.** Eklenti her sitede kapalı başlar. Araç çubuğundaki düğmeden o sekme için geçici olarak açarsın ya da site için "Hep açık / Hep kapalı" kuralı koyarsın.
- **Seçim baloncuğu.** En çok 6 kelimelik bir seçim kelime olarak açılır: cümledeki anlamı, kısa açıklaması ve üç durum düğmesi. Daha uzun seçimde cümle çevirisi ve altında tek tek işaretlenebilen kelimeler çıkar.
- **Sayfada işaretler.** Listendeki kelimeler, çekimli hâlleriyle birlikte ("run" işaretliyse "ran", "running") açık olduğu her sayfada renklenir. Üzerinde durunca kayıtlı anlamı açılır.
- **Geçici fosforlu kalem.** Metnin üzerinden çizersin; iz birkaç saniyede solar ve üzerinden geçtiğin kelime ya da cümlenin çevirisi açılır. Sayfada taşınabilen küçük bir panelle yönetilir (`Alt+Shift+H`).
- **Kelime listesi.** Firefox kenar çubuğunda ya da tam sayfada: arama, süzme, çeviriyi düzeltme, toplu işlem.
- **Dışa / içe aktarma.** Düz liste, TSV (Anki), Markdown tablo ve JSON. İçe aktarma mevcut veriyi silmez, birleştirir; düz kelime listesi de kabul eder.
- **Sağ tık menüsü.** Seçili metne sağ tıklayıp "Firelingo ile çevir" (eklenti o sitede kapalıyken de çalışır).

Kardeş proje [DuoPDF](https://github.com/Egemen-16925/Duopdf) (PDF okurken kelime öğrenme) ile aynı kelime biçimini kullanır; JSON dışa aktarımı DuoPDF'in eşitleme biçimindedir.

## Kurulum (kaynak koddan)

Gerekenler: [Node.js](https://nodejs.org) 22 ya da üstü, Firefox.

```bash
git clone https://github.com/Egemen-16925/firelingo.git
cd firelingo
npm install
npm run dev
```

`npm run dev`, Firefox'u ayrı bir geçici profille ve eklenti yüklü olarak açar. Kendi Firefox'unda denemek için:

```bash
npm run build
```

Sonra Firefox'ta `about:debugging#/runtime/this-firefox` → **Geçici eklenti yükle…** → `.output/firefox-mv3/manifest.json`. Geçici eklenti Firefox kapanınca kaldırılır.

Windows'ta PowerShell `npm` betiğini engellerse komutları `npm.cmd` ile çalıştır. Aynı anda yalnızca bir `npm run dev` çalışmalı.

Diğer komutlar: `npm test` (birim testleri), `npm run compile` (tip kontrolü).

## Yapay zekâ sağlayıcısı

Çeviriler senin seçtiğin sağlayıcıdan, senin API anahtarınla gelir; Firelingo'nun kendi sunucusu yoktur. OpenAI uyumlu her uç çalışır. Hazır ön ayarlar: NVIDIA, OpenAI, Google Gemini, OpenRouter, Groq, Ollama (yerel) ve Özel.

1. Popup'taki ayarlar düğmesiyle ayarlar sayfasını aç.
2. Sağlayıcıyı seç, API anahtarını gir.
3. **Modelleri listele**'ye bas (Firefox o sağlayıcının adresi için izin ister), bir model seç.
4. **Bağlantıyı test et** ve **Modeli test et** ile dene.

Birden fazla sağlayıcı ekleyip aralarında tek tıkla geçebilirsin. Sağlayıcının kullanım şartları ve ücretleri sana aittir.

## Gizlilik ve veri

- **Sunucu yok, hesap yok.** Kelimelerin, çevirilerin ve ayarların yalnızca bu tarayıcıda, eklentinin yerel deposunda durur.
- **Sağlayıcıya ne gider:** eklentinin açık olduğu bir sitede metin seçtiğinde ya da kalemle üzerinden çizdiğinde (ya da sağ tıkla çevirdiğinde), seçtiğin kelime ya da cümle ve kelimenin içinde geçtiği cümle, seçtiğin sağlayıcıya gönderilir. Sayfanın geri kalanı gönderilmez. Aynı istek ikinci kez gitmez (önbellek).
- **Ne gitmez:** sayfadaki kelimeleri renklendirmek için yapılan eşleştirme tamamen yereldir. Eklentinin kapalı olduğu sitelerde, sağ tık menüsünü kullanmadığın sürece hiçbir şey okunmaz ve gönderilmez.
- **API anahtarı** şifreli saklanır (AES-GCM) ve yalnızca ait olduğu sağlayıcıya gönderilir; dışa aktarılan dosyalara girmez. İstersen ek olarak bir ana parola koyabilirsin: o zaman anahtarlar parola olmadan çözülemez ve Firefox'u her açtığında parolayı bir kez girersin. Parola olmadan, şifreleme anahtarı da aynı Firefox profilinde durduğu için profil klasörünü ele geçiren birine karşı tam koruma sağlamaz.
- **İzinler:** `storage` (yerel kayıt), `activeTab` (popup'ın etkin sekmenin adresini okuması), `contextMenus` (sağ tık menüsü), `identity` ve `alarms` (Google Drive eşitlemesi) ve tüm sitelerde (sayfa içindeki çerçeveler dahil) çalışan hafif bir sayfa betiği. Bu betik eklenti o sitede kapalıyken hiçbir şey yapmaz; çerçevelerde yalnızca kalem açıkken çalışır. Sağlayıcı ve Google adreslerine erişim izni yalnızca sen o hizmeti kullanmak istediğinde istenir.
- **Google Drive eşitlemesi (isteğe bağlı):** DuoPDF ile aynı Google Cloud OAuth istemcisiyle bağlanılır; yalnızca Drive'ın gizli uygulama klasörüne erişilir. Kelimeler, cümle çevirileri ve silme izleri senin Drive'ına gider; başka hiçbir sunucuya gitmez.

## Geliştirme

Proje planı, veri modeli ve fazlar [`main.md`](main.md) içindedir; çalışma kuralları ve karar günlüğü [`CLAUDE.md`](CLAUDE.md) içinde. Eklenti [WXT](https://wxt.dev), React ve TypeScript ile yazılmıştır (Manifest V3). Terim anahtarı ve eşleştirme mantığı DuoPDF ile ortak [`duo-terms`](https://github.com/Egemen-16925/duo-terms) paketindedir.

## Lisans

[MIT](LICENSE)

---

## English

Firelingo is a Firefox extension for learning English vocabulary while browsing, aimed at Turkish speakers. Select a word or sentence to see it in Turkish, mark words as **unknown / learning / known**, and see your marked words highlighted on the pages you read.

> Status: in development. Not yet published on addons.mozilla.org; run it from source.

**Features**

- Off by default on every site; turn it on per tab or set a per-site rule.
- Selection bubble: meaning in context for words and short phrases, translation for longer selections.
- Marked words, including their inflected forms, are highlighted on every enabled page.
- A temporary freehand highlighter pen that fades and translates the text under the stroke.
- A word list in the Firefox sidebar or a full page, with search, filters, editing and bulk actions.
- Export as a plain list, Anki TSV, Markdown or JSON; import merges with existing data.
- A "Translate with Firelingo" context menu item for selected text.
- Optional sync with the sister project [DuoPDF](https://github.com/Egemen-16925/Duopdf) through your own Google Drive app folder.

**Run from source** (Node.js 22+ and Firefox)

```bash
git clone https://github.com/Egemen-16925/firelingo.git
cd firelingo
npm install
npm run dev
```

Or run `npm run build` and load `.output/firefox-mv3/manifest.json` from `about:debugging#/runtime/this-firefox` as a temporary add-on.

**AI provider.** Translations come from a provider you choose, with your own API key; there is no Firelingo server. Any OpenAI-compatible endpoint works. Add a provider on the options page, list its models, and run the connection and model tests there.

**Privacy.** Your words, translations and settings stay in the browser's local extension storage. When you select text, draw over it or use the context menu, the selected word or sentence and the sentence around the word are sent to the provider you chose; nothing else on the page is sent, and highlight matching is done locally. API keys are stored encrypted (AES-GCM), are sent only to their own provider and are never exported. An optional master password derives the encryption key so the keys cannot be read without it; without one, the encryption key lives in the same Firefox profile, which does not protect against someone who copies the profile folder.

**License:** [MIT](LICENSE). The interface is in Turkish.
