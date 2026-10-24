# Google Play’de yayınlama — adım adım kontrol listesi

**Hazırlanma tarihi: 24 Ekim 2026.** Google kuralları sık değişir; her adımı yaparken yanındaki bağlantıdan güncel hâlini kontrol et. Bağlantıların hepsi bu tarihte açılıp okundu.

Uygulama: **Ne Giysem?** · paket adı `com.negiysem.app` · ücretsiz · reklamlı (AdMob) · ortaklık linkli · hesap yok.

---

## 0. Kodda yapılacaklar (yüklemeden önce)

Bu klasördeki dosyalar mevcut koda dokunmadı; aşağıdakiler ayrıca yapılmalı.

- [ ] **Hedef API 36.** `app/build.gradle.kts` şu an `compileSdk = 35`, `targetSdk = 35`. 31 Ağustos 2026’dan beri yeni uygulamalar ve güncellemeler **Android 16 (API 36)** hedeflemeden Play’e gönderilemiyor; gerekirse 1 Kasım 2026’ya kadar uzatma istenebiliyor. → <https://developer.android.com/google/play/requirements/target-sdk>
- [ ] **Android 16’da geri tuşu.** API 36 hedefleyen uygulamada Android 16 cihazlarda `onBackPressed` artık çağrılmıyor (predictive back). `MainActivity.onBackPressed` içindeki `web.goBack()` çalışmaz hâle gelir: `OnBackInvokedCallback`’e geç ya da geçici olarak manifestte `android:enableOnBackInvokedCallback="false"` kullan; kenardan kenara (edge-to-edge) görünümden çıkılamıyor, Android 15/16 cihazda dene. → <https://developer.android.com/about/versions/16/behavior-changes-16>
- [ ] **Yayın imzası.** `app/debug.keystore` ile Play’e yükleme yapılmaz. Ayrı bir **yükleme anahtarı** (upload key) oluştur, parolalarıyla birlikte güvenli iki yere yedekle, depoya koyma. GitHub Actions’a `bundleRelease` ile **AAB** üreten bir iş ekle (şu an APK üretiyor). → <https://support.google.com/googleplay/android-developer/answer/9842756>
- [ ] **versionCode** her yüklemede bir öncekinden büyük olmalı (şu an `GITHUB_RUN_NUMBER`, yoksa 7).
- [ ] **Uygulama içinde gizlilik linki.** Play, gizlilik politikasının hem Play Console’daki alanda hem de **uygulamanın içinde** bulunmasını istiyor. Sayfanın altına `https://{{ALAN_ADI}}/gizlilik.html` bağlantısı ekle (tam adres: `gizlilik.html` APK’ya kopyalanmıyor, link tarayıcıda açılır). → <https://support.google.com/googleplay/android-developer/answer/10144311>
- [ ] **Android’de bağış ve AdSense yok.** Web sayfası `window.NeGiysemAndroid` varken bağış bağlantısını ve AdSense kodunu göstermemeli; uygulamada yalnızca AdMob. Geliştiriciye bağış için Play dışı ödeme yoluna yönlendirmek ödeme politikasıyla çakışabilir. → <https://support.google.com/googleplay/android-developer/answer/9858738>
- [ ] **Kaynak yazısı.** Sayfanın altındaki “Hava verisi Open-Meteo.com, konum adı BigDataCloud” metnini yeni kaynaklara göre değiştir: “Hava verisi © MET Norway (CC BY 4.0), harita verisi © OpenStreetMap katkıcıları”.
- [ ] **Reklam yerleşimi** `ads-declaration.md` §3’teki listeye uygun (düğmelere yapışık banner yok, widget’ta reklam yok, “Reklam” etiketi var).
- [ ] **İsteğe bağlı:** Yaklaşık konum yetiyorsa `ACCESS_FINE_LOCATION`’ı manifestten ve izin isteğinden kaldır (Veri güvenliği formu sadeleşir, bkz. `data-safety.md`). Yazı tiplerini Google Fonts yerine APK’nın içine koy (çevrimdışı da çalışır, Google’a IP gitmez).
- [ ] Birleştirilmiş manifestte `com.google.android.gms.permission.AD_ID` izni var (AdMob ekler).

## 1. Geliştirici hesabı

→ <https://support.google.com/googleplay/android-developer/answer/6112435>

- [ ] <https://play.google.com/console/signup> adresinden Google hesabınla kaydol (18 yaşından büyük olmalısın).
- [ ] Hesap türü: **Kişisel** (personal).
- [ ] Geliştirici Dağıtım Sözleşmesi’ni kabul et.
- [ ] **25 ABD doları** tek seferlik kayıt ücreti (ön ödemeli kart kabul edilmiyor).
- [ ] **Kimlik doğrulama:** resmî kimlik belgesi ve yasal adına kayıtlı kart istenebilir. Bilgiler geçersiz bulunursa ücret iade edilmez.
- [ ] **Android cihaz doğrulaması:** yeni kişisel hesaplar bir Android telefonda **Play Console uygulaması** ile cihaz erişimini doğrular.
- [ ] Herkese açık geliştirici adı ve iletişim e-postası: `{{GELİŞTİRİCİ_ADI}}`, `{{İLETİŞİM_E_POSTASI}}`.

## 2. Uygulamayı oluştur

- [ ] Play Console → **Tüm uygulamalar → Uygulama oluştur**.
- [ ] Uygulama adı: `Ne Giysem?` · Varsayılan dil: **Türkçe – tr-TR** · **Uygulama** (oyun değil) · **Ücretsiz**.
- [ ] Beyanlar: Geliştirici Programı Politikaları ve ABD ihracat yasaları kutularını işaretle → Oluştur.

## 3. Uygulama içeriği (Politika ve programlar → Uygulama içeriği)

- [ ] **Gizlilik politikası:** `https://{{ALAN_ADI}}/gizlilik.html` — herkese açık, PDF değil, coğrafi engelsiz olmalı. Önce siteyi yayımla ve adresi tarayıcıda aç.
- [ ] **Uygulama erişimi:** “Tüm işlevler özel erişim gerektirmeden kullanılabilir” → `app-access.md`
- [ ] **Reklamlar:** “Evet” → `ads-declaration.md` · <https://support.google.com/googleplay/android-developer/answer/9859455>
- [ ] **İçerik derecelendirmesi (IARC):** → `content-rating.md` · <https://support.google.com/googleplay/android-developer/answer/188189>
- [ ] **Hedef kitle ve içerik:** 13–15, 16–17, 18+ → `target-audience.md` · <https://support.google.com/googleplay/android-developer/answer/9867159>
- [ ] **Veri güvenliği:** → `data-safety.md` · <https://support.google.com/googleplay/android-developer/answer/10787469>
- [ ] **Reklam kimliği:** “Evet” (Reklam, Analiz, Sahtekârlık önleme) → `ads-declaration.md` §2
- [ ] Devlet uygulaması: **Hayır** · Finansal özellikler: **Hiçbiri** · Sağlık: **Hiçbiri** · Haber uygulaması: **Hayır** (çıkan diğer beyanlar için de uygulamanın gerçek durumu: hesap yok, ödeme yok).

## 4. Mağaza kaydı (Büyüme → Mağaza varlığı → Ana mağaza kaydı)

→ Grafik kuralları: <https://support.google.com/googleplay/android-developer/answer/9866151>

- [ ] Ad, kısa ve tam açıklama: `listing-tr.md` (Türkçe), çeviri olarak `listing-en.md` (İngilizce, en-US).
- [ ] **Uygulama simgesi:** `web/icons/maskable-512.png` (512×512, 32 bit PNG, tam kare). `icon-512.png` kullanma: köşeleri önceden yuvarlatılmış ve köşeleri saydam; Play köşeleri kendisi yuvarlar ve gölgeyi kendisi ekler. → <https://developer.android.com/distribute/google-play/resources/icon-design-specifications>
- [ ] **Öne çıkan grafik:** `graphics/feature-graphic.png` (Türkçe), İngilizce kayıt için `graphics/feature-graphic-en.png` (1024×500, 24 bit PNG, saydamlık yok).
- [ ] **Telefon ekran görüntüleri:** `screenshots/out/*.png` (1082×1924, 9:16; Play: 2–8 adet, kenarlar 320–3840 px, uzun kenar kısa kenarın en fazla 2 katı; öne çıkarılabilmek için en az 4 adet ≥1080 px). Yayından hemen önce `node store/play/screenshots/make-screenshots.js` ile yeniden üret ve gözle kontrol et.
- [ ] Kategori **Hava Durumu**, iletişim e-postası `{{İLETİŞİM_E_POSTASI}}`, web sitesi `https://{{ALAN_ADI}}`.
- [ ] Web sitesinin köküne **app-ads.txt** (AdMob) ve **ads.txt** (AdSense) koy. → <https://support.google.com/admob/answer/9363762>

## 5. Uygulama imzalama ve paket biçimi

- [ ] Yeni uygulamalar **Android App Bundle (AAB)** ile yayımlanır (Ağustos 2021’den beri zorunlu); AAB için **Play Uygulama İmzalama** gerekli. → <https://support.google.com/googleplay/android-developer/answer/9844279>
- [ ] Yeni uygulama otomatik olarak Google’ın oluşturduğu uygulama imzalama anahtarına kaydolur; sen AAB’yi **yükleme anahtarınla** imzalarsın. Yükleme anahtarı kaybolursa Google sıfırlayabilir ama yedeği yine sakla.

## 6. Dahili test (Test etme → Dahili test)

- [ ] Yeni sürüm oluştur → AAB’yi yükle → sürüm notları (`listing-*.md`).
- [ ] Test kullanıcısı listesi (kendi Gmail adreslerin) → katılım linkiyle Play’den kur.
- [ ] Widget, konum izni (Yaklaşık / Tam / Reddet), yer arama, “Tüm verilerimi sil”, karanlık mod, çevrimdışı açılış, reklam ve ortaklık linklerinin tarayıcıda açılması denenir.
- [ ] **Ön lansman raporu**’ndaki çökme ve erişilebilirlik uyarılarına bak.

## 7. Kapalı test — kişisel hesaplar için zorunlu

→ <https://support.google.com/googleplay/android-developer/answer/14151465>

13 Kasım 2023’ten sonra açılan kişisel hesaplar üretime çıkmadan önce kapalı test yapmak zorunda:

- [ ] Test etme → **Kapalı test** → kanal oluştur → AAB’yi yükle.
- [ ] Test kullanıcıları: e-posta listesi ya da Google Grubu; ülke olarak Türkiye.
- [ ] **En az 12 test kullanıcısı**, testine **kesintisiz en az 14 gün** katılmış olmalı. Başvurduğun anda 12 kişi hâlâ katılmış olmalı; ayrılıp yeniden katılan birinin 14 günü baştan başlar. Ayrılanlara karşı 15–20 kişi davet etmek güvenli.
- [ ] Test kullanıcılarına katılım (opt-in) linkini gönder; uygulamayı Play’den kurup gerçekten kullansınlar, geri bildirimlerini topla (başvuru formunda soruluyor).
- [ ] Geri bildirime göre düzeltmeleri yeni kapalı test sürümü olarak yayımla.

## 8. Üretim erişimine başvur

- [ ] Kontrol paneli → **Üretim için başvur** (Apply for production).
- [ ] Üç bölüm: *Kapalı testin hakkında* (test kullanıcısı bulmak ne kadar kolaydı, katılım, geri bildirim ve nasıl topladığın) · *Uygulaman hakkında* (hedef kitle, uygulamanın değeri, ilk yıl beklenen yükleme sayısı) · *Üretime hazırlık* (testten sonra yaptığın değişiklikler, hazır olduğuna nasıl karar verdin). Her bölümde İleri’ye basmadan çıkarsan yazdıkların silinir.
- [ ] İnceleme genellikle **7 gün veya daha kısa** sürer; yeterli katılım yoksa kapalı teste devam etmen istenebilir.

## 9. Ülkeler ve fiyat

- [ ] Fiyat: **Ücretsiz.** (Ücretsiz yayımlanan bir uygulama sonradan ücretliye çevrilemez. → <https://support.google.com/googleplay/android-developer/answer/6334373>)
- [ ] Ülkeler: Başlangıçta **Türkiye**. Avrupa Ekonomik Alanı, Birleşik Krallık ya da İsviçre eklenecekse önce Android’e Google UMP rıza ekranı ekle ya da kişiselleştirilmemiş reklam iste (`ads-declaration.md` §4).

## 10. Üretim sürümü

- [ ] Üretim → Yeni sürüm → aynı AAB’yi (ya da daha yenisini) kullan → sürüm notları → **kademeli yayın** (ör. %20) ile başlat.
- [ ] İnceleme sonrası mağaza sayfasını aç: “Reklam içerir” etiketi, gizlilik linki, veri güvenliği bölümü ve ekran görüntüleri doğru mu?

## 11. Yayından sonra

- [ ] Uygulama ya da SDK’lar değişince **Veri güvenliği**, **gizlilik metinleri** ve gerekirse **içerik derecelendirmesi** güncellenir.
- [ ] Her yıl Google’ın yeni hedef API tarihini takip et (link yukarıda).
- [ ] Android vitals’ta çökme/ANR oranına, yorumlara ve politika e-postalarına bak.
- [ ] Gizlilik politikası adresi hep açık kalmalı; alan adı değişirse Play Console’daki linki de değiştir.

---

**İlgili politikalar:** Reklamlar <https://support.google.com/googleplay/android-developer/answer/9857753> · Spam ve WebView/ortaklık trafiği <https://support.google.com/googleplay/android-developer/answer/9899034> · Aileler <https://support.google.com/googleplay/android-developer/answer/9893335> · Kullanıcı verileri <https://support.google.com/googleplay/android-developer/answer/10144311> · AB/BK/İsviçre rıza (CMP) <https://support.google.com/admob/answer/13554116>
