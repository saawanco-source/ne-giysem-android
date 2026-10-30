# Google Play’e yayın: imza anahtarı, GitHub ayarları ve dosyalar

**Hazırlanma: 24 Ekim 2026.** Bu sayfa Play’e gönderilecek dosyanın (AAB) nasıl üretildiğini ve senin bir kez yapman gerekenleri anlatır. Play Console’daki diğer adımlar (hesap, mağaza kaydı, formlar) için: `store/play/checklist.md`.

## Kısaca

| GitHub’da secret’lar… | Bulut derlemesi ne üretir | Ne işe yarar |
|---|---|---|
| **yokken** (şimdiki durum) | `NeGiysem.apk` (deneme/debug imzalı) | Telefona doğrudan kurmak. Play’e **yüklenmez**. |
| **eklenince** | `NeGiysem.aab` + `NeGiysem.apk` (ikisi de yükleme anahtarıyla imzalı) | `.aab` Play Console’a yüklenir; `.apk` telefona doğrudan kurulur. |

Dosyalar her zamanki gibi deponun **Releases** (Sürümler) sayfasına, yalnızca `main` dalına yapılan yüklemelerde konur. Uygulama Android 16’yı (API 36) hedefliyor; Play 31 Ağustos 2026’dan beri bunu istiyor.

## 1. Yükleme anahtarı nedir?

Her Android uygulaması dijital olarak imzalanır; telefon bir güncellemeyi ancak imza aynıysa eskisinin üstüne kurar. Play’de iki ayrı anahtar vardır:

- **Uygulama imzalama anahtarı** (*app signing key*): Google oluşturur ve kendisi saklar. Kullanıcıların telefonuna giden uygulamayı Google bu anahtarla imzalar. Sen görmezsin, kaybedemezsin. Buna **Play Uygulama İmzalama** (*Play App Signing*) denir; yeni uygulamalarda zorunlu ve kendiliğinden açık.
- **Yükleme anahtarı** (*upload key*): senin. Play Console’a yüklediğin `.aab` dosyasının gerçekten senden geldiğini kanıtlar. Google dosyayı alır, imzanı kontrol eder, sonra kendi anahtarıyla yeniden imzalar. İlk yüklediğin `.aab` hangi anahtarla imzalıysa Play onu yükleme anahtarın olarak kaydeder.

**Yükleme anahtarı kaybolursa ya da başkasının eline geçerse** uygulama kaybolmaz: Google sıfırlayabilir. Play Console → **Protected with Play → Play Store protection → Manage Play app signing** → **Upload key certificate** bölümü → **Request upload key reset** → sebebi yaz → yeni anahtarın `upload_certificate.pem` dosyasını yükle → **Request**. Google onaylayana kadar güncelleme gönderemezsin; bu yüzden yedeği sakla. (Kaynak: <https://support.google.com/googleplay/android-developer/answer/9842756>)

## 2. Claude’un gönderdiği anahtar dosyaları

Claude bu anahtarı senin için oluşturdu (RSA 4096 bit, 2054’e kadar geçerli, takma adı `negiysem-upload`). Dosyalar depoda **yok** ve hiç olmamalı:

| Dosya | Ne |
|---|---|
| `negiysem-upload.p12` | Anahtarın kendisi. **Asıl yedek.** |
| `negiysem-upload.p12.b64` | Aynı dosya yazıya çevrilmiş hâli (tek uzun satır). GitHub’a bu yapıştırılır. |
| `README.txt` | Takma ad, parola ve sertifika parmak izleri. |
| `upload_certificate.pem` | Anahtarın herkese açık sertifikası (gizli değil); kayıt için. |

Yapman gerekenler:
- [ ] Dört dosyayı ve parolayı bir **parola yöneticisine** kaydet (Bitwarden, 1Password, Google Parola Yöneticisi…). Parola + `.b64` yazısı “güvenli not” olarak saklanabilir; `.b64` yazısından anahtar dosyası geri üretilebilir.
- [ ] İkinci bir güvenli yere de kopyala (ör. şifreli USB bellek).
- [ ] Depoya, e-postaya, WhatsApp’a, paylaşılan bir klasöre **koyma**. Elinde olan herkes senin adına Play’e dosya gönderebilir.
- [ ] Sohbetteki/indirilenlerdeki kopyaları, kaydettikten sonra sil.

> Parola neden iki kere aynı: Anahtar dosyası PKCS12 biçiminde; bu biçimde “anahtar parolası” ile “depo parolası” aynıdır. GitHub’da iki ayrı kutuya aynı parolayı yazacaksın.

## 3. GitHub’a secret’ları ekle (bir kez)

Secret = GitHub’ın şifreli sakladığı, kimsenin geri okuyamadığı bir değer. Derleme sırasında yalnızca bulut bilgisayarı görür.

1. Tarayıcıda deponu aç: `github.com/saawanco-source/ne-giysem-android`.
2. Üstte **Settings** (Ayarlar). (Görünmüyorsa `⋯` menüsünün içinde.)
3. Soldaki menüde **Secrets and variables** → **Actions**.
4. **Secrets** sekmesinde yeşil **New repository secret** düğmesi.
5. **Name** kutusuna adı, **Secret** kutusuna değeri yaz → **Add secret**. Aşağıdaki her satır için 4–5. adımı tekrarla:

| Name (aynen, büyük harf) | Secret (değer) |
|---|---|
| `NG_KEYSTORE_BASE64` | `negiysem-upload.p12.b64` dosyasının **tamamı**. Dosyayı Not Defteri / Metin Düzenleyici ile aç → hepsini seç → kopyala → yapıştır. |
| `NG_KEYSTORE_PASSWORD` | `README.txt` içindeki parola |
| `NG_KEY_ALIAS` | `negiysem-upload` |
| `NG_KEY_PASSWORD` | Aynı parola (yukarıdakiyle aynı) |
| `ADMOB_APP_ID` *(isteğe bağlı)* | AdMob → Uygulamalar → uygulaman → Uygulama ayarları → **Uygulama kimliği**, ör. `ca-app-pub-1234567890123456~1234567890` |
| `ADMOB_BANNER_ID` *(isteğe bağlı)* | AdMob → Reklam birimleri → banner biriminin kimliği, ör. `ca-app-pub-1234567890123456/1234567890` |

- AdMob kimlikleri yoksa uygulamada Google’ın örnek kimliği kullanılır ve reklam gösterilmez. Gerçek reklam için ayrıca `app/src/main/java/com/negiysem/app/Config.kt` içindeki `API` adresinin (kendi sunucun, ör. `https://negiysem.com`) doldurulması gerekir.
- Bir değeri yanlış yazdıysan aynı adla **Update** et; secret’lar geri okunamaz, yalnızca yenisi yazılır.

**Denemek için:** Secret’ları ekledikten sonra **Actions → APK oluştur → Run workflow → Branch: main → Run workflow**. Yeşil tik çıkınca çalıştırmaya tıkla; **Summary** sayfasındaki “Ne Giysem? derleme denetimi” kutusunda `mod: release`, `targetSdkVersion:'36'` ve imza satırları görünmeli. Elle başlatılan çalıştırma dosyaları Releases’a koymaz; aynı sayfanın altındaki **Artifacts → NeGiysem** ile indirilebilir. Releases sayfasına koyma, `main` dalına bir sonraki yüklemede (Claude’un bir sonraki değişikliği) kendiliğinden olur.

Kırmızı çarpı görürsen: çalıştırmaya tıkla, en üstteki **Annotations** kutusundaki “İmza” ya da “Gradle” satırlarını Claude’a gönder.

> `Run workflow` ekranındaki **deneme_imza** kutusu yalnızca deneme içindir: o an üretilen geçici bir anahtarla imzalar, Play’e yüklenemez. İşaretleme.

## 4. Telefona kurulu eski sürüm (bir kez)

Şimdiye kadarki APK’lar deneme (debug) anahtarıyla imzalıydı. Yükleme anahtarıyla imzalı ilk `NeGiysem.apk`, eskisinin üstüne **kurulmaz** (“Uygulama yüklenmedi” / “paket çakışıyor” uyarısı). Bir kez:

1. Eski Ne Giysem?’i kaldır (kayıtlı yerler, rutin ve widget silinir).
2. Yeni `NeGiysem.apk`’yı kur, yerlerini yeniden seç, widget’ı yeniden ekle.

Sonraki sürümler yine üstüne kurulur. Not: Play’den kurulan uygulama Google’ın anahtarıyla imzalı olduğu için Play sürümü ile GitHub’daki APK da birbirinin üstüne kurulmaz; Play sürümüne geçerken de bir kez kaldırman gerekir.

## 5. AAB’yi indir ve Play Console’a yükle

1. GitHub → deponun ana sayfası → sağda **Releases** → en üstteki **Ne Giysem? N** → **Assets** → `NeGiysem.aab` dosyasını bilgisayara indir. (Telefondan da olur ama Play Console bilgisayarda daha rahat.)
2. Play Console → uygulaman → **Test and release → Testing → Internal testing** (Dahili test) → **Create new release**.
3. İlk sürümse Play Uygulama İmzalama ayarı sorulur: Google’ın oluşturduğu anahtarı kullan (varsayılan, değiştirme).
4. **App bundles** → **Upload** → `NeGiysem.aab`.
5. **Release name** kendiliğinden dolar; **Release notes** için `store/play/listing-tr.md` → **Save as draft** → **Next** → hata yoksa **Start rollout**.
6. Dahili testte kendi telefonunda dene (adımlar: `store/play/checklist.md` §6).
7. **Kapalı test** (zorunlu): **Test and release → Testing → Closed testing** → kanal oluştur → aynı AAB’yi **Add from library** ile seç ya da yeni sürümü yükle. **En az 12 test kullanıcısı, kesintisiz en az 14 gün** (checklist §7).
8. 14 gün dolunca **Üretim için başvur** (checklist §8), onaylanınca **Production** → yeni sürüm → aynı ya da daha yeni AAB → kademeli yayın (checklist §10).

Bilmen gerekenler:
- **Sürüm numarası (versionCode)** her bulut derlemesinin çalıştırma numarasıdır (Releases’taki “Ne Giysem? N”deki N). Play aynı ya da daha küçük numaralı dosyayı kabul etmez: hep en yeni sürümü yükle. `.github/workflows/build-apk.yml` dosyasının adını değiştirme; değişirse numaralar 1’den başlar ve Play yeni dosyaları reddeder.
- Play’e yalnızca `.aab` yüklenir; `.apk` Play için değil.

## 5a. Deneme sürümü (dev dalı)

Değişiklikler önce `dev` dalına gider; yayına ancak denendikten sonra çıkar.

- `dev` dalına her yüklemede bulut derlemesi **“Ne Giysem? deneme N”** adlı bir **ön sürüm** (pre-release) çıkarır.
  İçindeki `NeGiysem.apk` telefona, kurulu uygulamanın üstüne kurulur (aynı anahtarla imzalı).
- Deneme uygulaması deneme sitesinin sunucusunu kullanır: **https://dev.ne-giysem.pages.dev** (Cloudflare Pages
  `dev` dalı için kendiliğinden kurar). Sitedeki “Uygulamayı indir” düğmesi ve Play deneme sürümlerini görmez.
- Yalnızca son üç deneme sürümü tutulur. Deneme geçince `dev`, `main`'e alınır ve gerçek sürüm çıkar; gerçek sürüm
  numarası her zaman denemeden büyüktür, telefona üstüne kurulur.

## 6. Teknik notlar (geliştirici için)

- İmza bilgisi yalnızca ortam değişkenlerinden okunur (`NG_KEYSTORE_FILE`, `NG_KEYSTORE_PASSWORD`, `NG_KEY_ALIAS`, `NG_KEY_PASSWORD`); iş akışı `NG_KEYSTORE_BASE64`’ü geçici bir dosyaya çözer. Yerel derleme: bu dört değişkeni verip `gradle bundleRelease assembleRelease`.
- Sürümler: AGP 8.13.2, Gradle 8.14.6, Kotlin 2.3.21 (play-services-ads 25.5.0 Kotlin 2.3 ile derlenmiş; daha eski Kotlin onu okuyamaz), compileSdk/targetSdk 36, minSdk 26.
- **R8 (kod küçültme) kapalı.** Sayfa `MainActivity.Bridge` yöntemlerini adlarıyla (`@JavascriptInterface`) çağırıyor; R8 bunları kural olmadan siler ya da yeniden adlandırır. Açılacaksa `proguard-rules.pro`’ya en az şu kural gerekir ve gerçek bir telefonda paylaş/kaydet/tema/“Tüm verilerimi sil” denenmelidir:
  ```
  -keepattributes RuntimeVisibleAnnotations
  -keepclassmembers class com.negiysem.app.MainActivity$Bridge {
      @android.webkit.JavascriptInterface <methods>;
  }
  ```
- Her derlemede “Dosyaları denetle” adımı APK’yı (ve varsa AAB’yi) aapt2, apksigner, bundletool ve jarsigner ile kontrol eder: hedef API 36, minSdk 26, versionCode, imza, izinler, AdMob `APPLICATION_ID`, FileProvider, yerel kütüphaneler ve 16 KB sayfa hizası. Bir sorun bulursa derleme kırmızı olur ve dosya yayımlanmaz.
