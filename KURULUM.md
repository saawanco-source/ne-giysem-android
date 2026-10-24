# Ne Giysem? — Android uygulaması ve ana ekran widget'ı

Bu klasör Galaxy A56 gibi Android telefonlar için hazırlanmış bir Android Studio projesidir:

- **Uygulama:** Ne Giysem? web uygulamasının aynısı, telefona kurulu hâlde (GPS ile konum).
- **Widget:** Ana ekranda bugünün rengi, sıcaklık, tek cümlelik öneri ve kıyafet çıkartmaları. 30 dakikada bir kendini yeniler; sağ üstteki yenile simgesine dokununca hemen yenilenir. Widget'a dokununca uygulama açılır.
- **Boyutlar:** 2×2 (küçük), 4×2 (önerilen), 4×3 ve üstü (büyük çıkartmalı).

## 1. APK'yi bilgisayar kurmadan oluştur (GitHub, ücretsiz)

1. github.com'da **New repository** → ad: `ne-giysem-android` → **Create repository**.
2. **uploading an existing file** → bu klasörün **içindekileri** sürükle bırak → **Commit changes**.
3. Depoda `.github/workflows/build-apk.yml` dosyası görünmüyorsa (bazı bilgisayarlar nokta ile başlayan klasörleri gizler):
   **Add file → Create new file** → ad kutusuna `.github/workflows/build-apk.yml` yaz → bu klasördeki aynı dosyanın içeriğini yapıştır → **Commit changes**.
4. **Actions** sekmesinde "APK oluştur" çalışmaya başlar (yaklaşık 5 dakika). Yeşil tik görünce hazırdır.
5. Deponun ana sayfasında sağdaki **Releases** bölümünde `NeGiysem.apk` dosyası durur.

Kırmızı çarpı görürsen, Actions'ta o çalışmaya tıklayıp hata satırlarını Claude'a gönder.

## 2. Galaxy A56'ya kur

1. Telefonda Chrome ile deponun **Releases** sayfasını aç → `NeGiysem.apk` dosyasına dokun → indir.
2. İndirilen dosyayı aç. "Bilinmeyen uygulamaları yükle" sorulursa Chrome'a (ya da Dosyalarım'a) izin ver → **Yükle**.
3. Play Protect uyarı verirse **Ayrıntılar → Yine de yükle** de. (Mağaza dışından kurulan her uygulamada bu uyarı çıkar.)
4. Uygulamayı aç, sağ üstteki yenile düğmesine bas ve konum iznini ver. Widget bu konumu kullanır. Uygulamada bir yer seçersen (ör. Bahçeköy) widget da ona geçer.

## 3. Widget'ı ana ekrana ekle

1. Ana ekranda boş bir yere **basılı tut** → **Widget'lar**.
2. **Ne Giysem?** → **4×2** boyutunu seç → **Ekle**.
3. Kenarlarından tutup büyütüp küçültebilirsin; içerik boyuta göre değişir.

## 4. Samsung'da widget'ın düzenli yenilenmesi için

One UI pil tasarrufu arka plan yenilemesini geciktirebilir:
**Ayarlar → Uygulamalar → Ne Giysem? → Pil → Sınırsız**.

## Güncelleme

Dosyaları değiştirip depoya tekrar yükleyince yeni bir APK oluşur. Aynı imza anahtarı kullanıldığı için eskisinin üstüne kurulur, ayarların kaybolmaz.

## Android Studio ile (isteğe bağlı)

Android Studio'da **Open** → bu klasör → telefonu USB ile bağla (Geliştirici seçenekleri → USB hata ayıklama açık) → **Run**.

## Notlar

- Hava verisi Open-Meteo.com (CC BY 4.0), konum adı BigDataCloud. Konum yalnızca hava durumunu almak için kullanılır.
- `app/debug.keystore` yalnızca deneme sürümleri içindir. Google Play'e yüklemeden önce ayrı bir yayın anahtarı oluşturulmalı.
