# Reklam beyanı ve reklam kimliği — cevaplar

Kaynaklar: Reklam beyanı <https://support.google.com/googleplay/android-developer/answer/9859455> · Reklam politikası <https://support.google.com/googleplay/android-developer/answer/9857753> · Reklam kimliği <https://support.google.com/googleplay/android-developer/answer/6048248> · AdMob app-ads.txt <https://support.google.com/admob/answer/9363762>

## 1. Reklamlar *(Ads)*

Play Console → Politika ve programlar → Uygulama içeriği → **Reklamlar** → Başlat.

**Uygulamanız reklam içeriyor mu?** → **Evet, uygulamamda reklam var.**

Gerekçe: Android uygulaması Google AdMob ile banner reklam gösterir. Google’a göre üçüncü taraf reklam SDK’larıyla gösterilen reklamlar da beyan edilir. Mağaza sayfasında “Reklam içerir” etiketi görünür.

Notlar:
- **Ortaklık linkleri** (“Satın al / ortaklık linki”, Trendyol ve Amazon.com.tr) Google’ın reklam tanımına girmez (“başka ticari içerik” sayılır) ama zaten reklam olduğu için cevap değişmez. Uygulamada ve mağaza açıklamasında açıkça yazıldı.
- **Bağış linki** yalnızca web sitesinde; Android uygulamasında gösterilmemeli. Uygulama aynı web sayfasını gösterdiği için bağış bağlantısı ve AdSense kodu `window.NeGiysemAndroid` varken gizlenmeli. Play’de geliştiriciye bağış/bahşiş Google Play faturalandırması dışındaki bir ödeme yoluna yönlendirmek ödeme politikasına takılabilir (<https://support.google.com/googleplay/android-developer/answer/9858738>).
- **AdSense** Android uygulamasının WebView’ında gösterilmemeli; uygulamada yalnızca AdMob.

## 2. Reklam kimliği *(Advertising ID)*

Uygulama içeriği sayfasında “Reklam kimliği” kartı varsa:

**Uygulamanız reklam kimliğini kullanıyor mu?** → **Evet.**

**Amaçlar:** Reklam veya pazarlama; Analiz; Sahtekârlığı önleme, güvenlik ve uyumluluk. (Google Mobile Ads SDK reklam kimliğini bu amaçlarla kullanır.)

Teknik kontrol: Android 13+ hedefleyen uygulamalar `com.google.android.gms.permission.AD_ID` iznini bildirmelidir; Google Mobile Ads SDK bu izni kendi manifestiyle ekler. Bulut derlemesinin “Dosyaları denetle” adımı birleştirilmiş manifestte bu iznin olduğunu her seferinde kontrol ediyor (24 Ekim 2026: var); yoksa derleme durur. Reklam kimliğini istemiyorsan izni `tools:node="remove"` ile kaldırabilirsin; o zaman bu cevap “Hayır” olur ve `data-safety.md` güncellenir.

## 3. Reklam yerleşimi — politika kontrol listesi

Google Play “Rahatsız edici reklamlar” kuralları ve AdMob politikaları için:

- [ ] Banner, kullanıcının sık dokunduğu yerlere (çıkartmalar, “Paylaş”, “Tüm verilerimi sil”, yer seçici, yenile düğmesi, rota çipleri) yapışık değil; arada boşluk var. Politika: reklamların “kullanıcının normalde başka bir işlev için dokunduğu alanlarda aniden belirmesi” yasak.
- [ ] Reklam sayfa yüklendikten sonra içeriği aşağı itmiyor (yer önceden ayrılmış), böylece yanlışlıkla tıklanmıyor.
- [ ] Reklam alanında “Reklam” etiketi var (Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği; içerikten ayırt edilebilirlik).
- [ ] **Widget’ta reklam yok.** Play, widget’a yerleştirilmiş reklamları (“widgetized ad units”) rahatsız edici reklam sayar.
- [ ] Geçiş (interstitial) reklamı yok; eklenirse en geç 15 saniyede kapatılabilir olmalı ve uygulama açılışında/çıkışında gösterilmemeli.
- [ ] Bildirimlerde, kilit ekranında veya uygulama dışında reklam yok.
- [ ] AdMob → Engelleme kontrolleri → Maksimum reklam içeriği derecelendirmesi **G** ya da **PG**.
- [ ] **app-ads.txt:** AdMob’un verdiği satırı `https://ne-giysem.pages.dev/app-ads.txt` adresine koy; Play mağaza kaydındaki “Web sitesi” alanı `https://ne-giysem.pages.dev` olmalı (AdMob dosyayı bu alan adının kökünde arar).
- [ ] **ads.txt** (web sitesi, AdSense): AdSense’in verdiği satırı `https://ne-giysem.pages.dev/ads.txt` adresine koy.

## 4. Rıza (açık konu)

- Web sitesinde kişiselleştirilmiş reklam için rıza ekranı planlandı (“Reklam tercihleri” bağlantısı ile yeniden açılır). Avrupa Ekonomik Alanı, Birleşik Krallık ve İsviçre’den gelen ziyaretçilerde kişiselleştirilmiş reklam için **Google sertifikalı, IAB TCF uyumlu bir rıza platformu (CMP)** zorunlu (AEA/BK 16 Ocak 2024’ten, İsviçre 31 Temmuz 2024’ten beri). AdSense’in kendi “Gizlilik ve mesajlaşma” aracı bu şartı karşılar. Kaynak: <https://support.google.com/admob/answer/13554116>
- Android uygulamasında Google’ın **User Messaging Platform (UMP) SDK**’sı (4.0.0) var: reklam yüklenmeden önce rıza bilgisi istenir, gerekiyorsa rıza formu gösterilir, sayfada “Reklam tercihleri” yeniden açılabilir. Formun içeriği AdMob → **Gizlilik ve mesajlaşma**’dan gelir; uygulama AEA/BK/İsviçre’de yayımlanacaksa orada GDPR mesajını oluşturup yayımla (mesaj yoksa form çıkmaz). KVKK açısından da kişiselleştirilmiş reklam için açık rıza gerekip gerekmediğini hukukçuya sor (bkz. `../README.md`). Değişirse gizlilik metinlerindeki “Android uygulaması (Google AdMob)” paragrafını güncelle.
