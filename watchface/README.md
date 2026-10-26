# Ne Giysem? saat yüzü (Wear OS 5+, Galaxy Watch 7 ve sonrası)

Saat, tarih ve sıcaklığın yanında Ne Giysem'in kıyafet önerisini gösteren saat yüzü. Bu bir uygulama değil; Google'ın
**Watch Face Format** (WFF) biçiminde, yalnızca görsel ve XML'den oluşan bir paket. Telefon uygulaması gerekmez.

## Saat uygulaması ve karmaşıklıklar

- Yüzde **dört küçük karmaşıklık yeri** var (sol, sağ, sol alt, sağ alt): saat yüzüne basılı tut → **Özelleştir** ile
  adım, nabız, pil, takvim gibi istediğin veriyi seç. Varsayılanlar: adım, pil, gün doğumu/batımı, sıradaki etkinlik.
- **Ne Giysem? saat uygulaması** (`wear/`, `NeGiysem-SaatUygulamasi.apk`) kuruluysa ortadaki kıyafet alanı telefondaki
  öneriyi birebir gösterir (telefonun hissedilen sıcaklığı, rutinin, hava uyarısı). Kurulu değilse ya da telefondan veri
  gelmediyse saatin kendi havasından hesaplanan kıyafet görünür.
- Aynı uygulama **Ne Giysem? karmaşıklığını** her saat yüzüne (Samsung'unkiler dahil) ekler: kısa metin (çıkartma +
  sıcaklık), uzun metin (öneri cümlesi), küçük resim. Dokununca saatte önerinin tamamı açılır.
- Veriyi telefon gönderir (Google Play hizmetlerinin saat bağlantısı); telefon uygulaması ve saat uygulaması aynı paket
  adı (`com.negiysem.app`) ve aynı anahtarla imzalı olmalı. 12 saatten eski veri gösterilmez.

Saat uygulaması da saat yüzü gibi kablosuz hata ayıklamayla kurulur (aşağıda), dosya adı `NeGiysem-SaatUygulamasi.apk`.
Play'de telefon uygulamasıyla **aynı kayıtta**, Wear OS kanalına `NeGiysem-SaatUygulamasi.aab` olarak yüklenir.

## Ne gösterir

- Üstte gün ve tarih, sıcaklık (saatin gösterdiği birimle) ve seviye etiketi (Dondurucu … Çok sıcak).
- Ortada büyük saat. Ambiyans (her zaman açık) ekranında yalnızca ince saat, tarih ve sıcaklık kalır.
- Ortada üç kıyafet çıkartması ve kısa bir öneri; seviye, sıcaklığın yanında kendi rengindeki etikette.
- **Yağmur yağıyorsa** ya da bugün yağış ihtimali %50 ve üstüyse üçüncü çıkartma şemsiye olur. **Kar yağıyorsa** bot.
- Hava bilgisi yoksa: "Hava bilgisi bekleniyor".

Hava verisini saatin kendisi sağlar: Galaxy Watch'ta Samsung Hava Durumu. Saat yüzü "bekleniyor" diyorsa saatteki ya da
telefondaki Hava Durumu uygulamasını bir kez açıp konuma izin ver.

Seviyeler telefondaki uygulamayla aynı sıcaklık aralıklarını kullanır (`Outfit.kt`, `LEVEL_MIN`). Tek fark: uygulama
**hissedilen** sıcaklığa bakar, saat ise yalnızca ölçülen sıcaklığı bilir. Bu yüzden sınırda bir seviye fark çıkabilir.

Metinler cihaz diline göre Türkçe (`values-tr`) ya da İngilizcedir (`values`).

## Dosyalar

| Dosya | Ne |
|---|---|
| `src/main/res/raw/watchface.xml` | Saat yüzü. **Elle düzenlenmez**, `tools/build_face.py` üretir |
| `src/main/res/values*/strings.xml` | Metinler (aynı betik üretir) |
| `src/main/res/drawable-nodpi/wf_*.png` | Kıyafet çıkartmaları, uygulamanın çizimlerinden (`tools/stickers.py`) |
| `src/main/res/drawable*-nodpi/preview.png` | Saat yüzü seçicisindeki önizleme (`tools/preview.py`) |
| `tools/validate.py` | XML'i Google'ın WFF şemasıyla denetler (CI her değişiklikte çalıştırır) |

Değişiklik yapınca depo kökünden:

```sh
python3 watchface/tools/build_face.py      # XML + metinler
python3 watchface/tools/stickers.py        # çıkartmalar değiştiyse (Playwright gerekir)
python3 watchface/tools/preview.py out/    # önizleme ve mağaza görselleri
```

CI, `build_face.py` çıktısı depodakiyle aynı değilse ve şemaya uymuyorsa derlemeyi durdurur.

## Saate kurma (Play'e çıkmadan önce)

Sürümler sayfasındaki **NeGiysem-SaatYuzu.apk** dosyası saate "kablosuz hata ayıklama" ile kurulur:

1. **Saatte geliştirici seçeneklerini aç:** Ayarlar → Saat hakkında → Yazılım bilgileri → **Yazılım sürümü**'ne 5-7 kez dokun.
2. Ayarlar → **Geliştirici seçenekleri** → **ADB hata ayıklama** açık, **Kablosuz hata ayıklama** açık. Saat ve
   bilgisayar aynı Wi-Fi'da olmalı. Kablosuz hata ayıklama → **Yeni cihaz eşle**: ekranda IP:port ve eşleme kodu çıkar.
3. **Bilgisayarda** (Android platform-tools kurulu):
   ```sh
   adb pair <IP>:<eşleme portu>      # saatteki kodu gir
   adb connect <IP>:<port>           # Kablosuz hata ayıklama ekranındaki port
   adb install NeGiysem-SaatYuzu.apk
   ```
   Bilgisayar yoksa telefona kurulan bir "Wear OS'a APK kur" uygulaması da aynı işi kablosuz hata ayıklamayla yapar.
4. **Saati seç:** saat yüzüne basılı tut → kaydırıp **Ne Giysem?** → dokun. Ya da telefonda Galaxy Wearable →
   Saat yüzleri → İndirilenler.

İş bitince geliştirici seçeneklerini kapatabilirsin.

## Google Play'e çıkarma

Google Play, saat yüzünü kod içeren bir paketle birlikte kabul etmez. Bu yüzden saat yüzü **ayrı bir uygulama kaydı**
olarak yüklenir: paket adı `com.negiysem.app.watchface`.

1. Play Console → Uygulama oluştur → ad: "Ne Giysem? Saat Yüzü", ücretsiz.
2. Kurulum → Gelişmiş ayarlar → **Form faktörleri → Wear OS** ekle.
3. Kapalı test (ya da yayın) kanalına **NeGiysem-SaatYuzu.aab** yükle. Telefon uygulamasıyla aynı yükleme anahtarıyla
   imzalı; Play App Signing'i aç.
4. Mağaza kaydı: Wear OS ekran görüntüleri en az 384×384 ve kare olmalı; `tools/preview.py out/` görselleri bu boyutta
   (450×450). Kategori: **Kişiselleştirme**.
5. Play, Watch Face Format paketlerinde bellek kullanımı denetimi yapar; bu saat yüzü küçük (18 çıkartma, her biri 96 px).

Gizlilik: saat yüzü hiçbir veri toplamaz ve internete çıkmaz; veri güvenliği formunda "veri toplanmıyor" seçilir.
Gizlilik politikası URL'si yine `https://ne-giysem.pages.dev/gizlilik.html`.
