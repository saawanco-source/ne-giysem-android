# Mağaza ve yasal metinler (iç not)

Google Play yayını ve web sitesi için hazırlanan dosyalar. Durum: 24 Ekim 2026, planlanan ilk sürüm.

> **Not:** Gizlilik ve KVKK metinleri bir hukukçu tarafından yazılmadı; yayımlamadan önce bir avukata ya da KVKK danışmanına kontrol ettirmen önerilir.

## Dosyalar

| Dosya | Ne için |
|---|---|
| `../web/gizlilik.html` | Türkçe gizlilik politikası + KVKK aydınlatma metni + reklam/çerez, ortaklık linki, silme, çocuklar. Play’deki gizlilik URL’si: `https://ne-giysem.pages.dev/gizlilik.html` |
| `../web/privacy.html` | Aynı metnin İngilizcesi (GDPR’a uygun ifadeler). Çelişkide Türkçe esas. |
| `play/checklist.md` | Play Console’da yayınlama adımları (hesap → kapalı test → üretim), kaynak linkleriyle. **Buradan başla.** |
| `play/listing-tr.md`, `play/listing-en.md` | Uygulama adı, kısa/tam açıklama, sürüm notları ve karakter sayıları. |
| `play/data-safety.md` | Veri güvenliği formunun soru soru cevapları ve gerekçeleri. |
| `play/content-rating.md` | IARC içerik derecelendirmesi cevapları. |
| `play/target-audience.md` | Hedef yaş grupları (13+), Aileler programının dışında kalma. |
| `play/ads-declaration.md` | Reklam beyanı, reklam kimliği, reklam yerleşimi kontrol listesi, rıza notları. |
| `play/app-access.md` | “Giriş gerekmez” cevabı ve inceleme ekibi için not. |
| `play/graphics/feature-graphic.png`, `feature-graphic-en.png` | Öne çıkan grafik (1024×500). Yeniden üret: `NODE_PATH=$(npm root -g) node store/play/graphics/make-feature-graphic.js` (kıyafet çizimleri `web/index.html` içindeki `ART`/`rackArt`’tan okunur). Uygulama ikonu, web ikonları ve başlıktaki logo: `node tools/icons.js`. |
| `play/screenshots/make-screenshots.js` → `out/*.png` | Telefon ekran görüntüleri (1082×1924, 9:16). Ağ tamamen taklit edilir; özellik henüz yoksa o kare atlanır ve listelenir. İngilizce: `SHOT_LANG=en` (TODO, İngilizce arayüz gelince doldur). |
| `play/fonts/` | Ekran görüntüsü ve grafik için Instrument Serif ve Figtree (SIL OFL 1.1, lisansları yanında). Instrument Serif saat yüzünde ve saat uygulamasında da var (`res/font`). |

Simge için `web/icons/maskable-512.png` kullan (512×512, tam kare). `icon-512.png` köşeleri yuvarlatılmış ve saydam olduğu için Play’in simge kuralına uymuyor.

## Doldurulan bilgiler

Gizlilik sayfalarında ve mağaza notlarında kullanılanlar:

- Geliştirici adı: `saawanco` (veri sorumlusu olarak gizlilik sayfasında)
- İletişim e-postası: `saawanco@gmail.com` (herkese açık; KVKK başvuruları da buraya)
- `ne-giysem.pages.dev` — sitenin şu anki adresi (Cloudflare Pages). Kendi alan adı alınırsa bu adres her yerde onunla değiştirilir.

## Yayından önce karar verilecekler / hukukçuya sorulacaklar

- **Yurt dışına aktarım (KVKK m.9):** Cloudflare ve Google’a aktarım için hangi güvenceye dayanılacağı (standart sözleşme imzalanıp 5 iş günü içinde Kurum’a bildirilmesi ya da başka bir yol). Metindeki cümle genel bırakıldı.
- **Android’de reklam rızası:** Kişiselleştirilmiş reklam için uygulama içinde açık rıza (Google UMP) gerekip gerekmediği. En basit güvenli yol: Android’de yalnızca kişiselleştirilmemiş reklam istemek. Değişirse gizlilik metinlerinin reklam bölümü güncellenir.
- **VERBİS** kaydından muafiyet durumu.
- **Amazon Ortaklık Programı:** Zorunlu cümle (“Amazon Associate olarak, uygun satın alımlardan kazanç sağlıyorum.”) gizlilik metnine kondu; uygulama içinde ortaklık linklerinin yanında ya da “Hakkında” bölümünde de görünmesi gerekebilir. Amazon ve Trendyol program kurallarının mobil uygulamalarda link kullanımına izin verdiğini kontrol et.
- Metin, planlanan özellikleri anlatıyor (profiller, Dolabım, İngilizce, bağış linki, AdMob/AdSense, `/api/*` sunucusu). İlk sürümde farklı olan bir şey varsa metni ona göre düzelt.
