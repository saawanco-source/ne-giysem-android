# Ne Giysem? sitesini Cloudflare Pages'e koymak

`web/` klasörü hem siteyi (`index.html`) hem de küçük sunucu kısmını (`web/functions/`) içerir. Sunucu kısmı hava durumunu
MET Norway'den, yer aramayı Photon'dan alır, sonuçları saklar ve uygulamaya `/api/...` adresleriyle verir:

| Adres | Ne yapar |
|---|---|
| `/api/forecast?latitude=41.01&longitude=28.98` | 7 günlük hava durumu (MET Norway) |
| `/api/search?q=kadıköy` | Yer arama (Photon / OpenStreetMap) |
| `/api/reverse?lat=41.18&lon=28.99` | Konumun adı |
| `/api/ip` | İnternet bağlantısından yaklaşık konum |

## 1. Projeyi oluştur (bir kez)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → soldan **Workers & Pages** → **Create** → **Pages** sekmesi → **Connect to Git**.
2. GitHub'a izin ver ve `ne-giysem-android` deposunu seç → **Begin setup**.
3. Ayarlar:
   - **Project name:** ör. `ne-giysem` (site adresi `https://ne-giysem.pages.dev` olur)
   - **Production branch:** `main`
   - **Framework preset:** `None`
   - **Build command:** boş bırak
   - **Build output directory:** boş bırak (kutu boş kabul etmezse `/` yaz; `web` yazma)
   - **Root directory (advanced)** → aç → **Path:** `web`
4. **Save and Deploy**. Bir iki dakika sonra site `https://<proje-adı>.pages.dev` adresinde açılır.

> Neden `web` "Root directory"ye yazılıyor: Cloudflare `functions` klasörünü kök klasörde arar. Kök `web` olunca
> `web/functions` kendiliğinden bulunur ve `/api/...` adresleri çalışır (ayrıca bir şey kurmak gerekmez). Kök boş
> bırakılırsa site açılır ama `/api/...` çalışmaz.

Kontrol: tarayıcıda `https://<proje-adı>.pages.dev/api/forecast?latitude=41.01&longitude=28.98` aç; içinde
`"timezone":"Europe/Istanbul"` geçen uzun bir yazı görmelisin.

## 2. Alan adını bağla

1. Proje sayfası → **Custom domains** → **Set up a custom domain**.
2. Cloudflare'dan aldığın alan adını yaz (ör. `negiysem.com`) → **Continue** → **Activate domain**. Alan adı zaten
   Cloudflare'da olduğu için kayıt kendiliğinden eklenir; birkaç dakika içinde açılır.
3. Android uygulamasının sunucusu bu adres olacaksa sayfanın güvenlik politikasına da ekletmek gerekir
   (`web/index.html`, `Content-Security-Policy` → `connect-src`; aşağıdaki "Güvenlik" maddesi). Site kendi adresinde
   zaten kendi sunucusuyla konuşabilir; bu yalnızca uygulamanın içindeki sayfa için.

## 3. MET Norway için kimlik yazısı

MET Norway, isteklerin kimden geldiğini bilmek ister (yoksa engelleyebilir). Alan adın hazır olunca:

1. Proje → **Settings** → **Variables and Secrets** (eski adı: Environment variables) → **Add**.
2. **Type:** Text, **Variable name:** `MET_USER_AGENT`, **Value:** `NeGiysem/1.0 (+https://ALAN-ADIN)`
   (`ALAN-ADIN` yerine kendi alan adın; istersen sonuna `; e-posta@adresin` ekle) → **Save**.
3. Yeni değer sonraki yayında geçerli olur: **Deployments** → en üstteki → **⋯** → **Retry deployment**.

Bu ayar yokken `NeGiysem/1.0 (+https://ne-giysem.pages.dev)` kullanılır.

## 4. Kötüye kullanıma karşı istek sınırı (önerilir)

`/api/...` adresleri herkese açık; biri döngüyle istek gönderirse günlük 100.000 istek bir anda biter. Ücretsiz
planda bir hız sınırı kuralı kurulabilir:

1. Cloudflare panelinde alan adın → **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
2. **If incoming requests match:** URI Path → *starts with* → `/api/`.
3. **With the same characteristics:** IP. **When rate exceeds:** 60 istek / 10 saniye.
4. **Then:** Block, 10 saniye → **Deploy**.

Uygulamanın kendisi bu sınırın çok altında kalır (bir açılışta en fazla birkaç istek).

## 5. Google rota önerileri (isteğe bağlı)

Rota önerileri yalnızca `GOOGLE_ROUTES_KEY` adlı **Secret** eklenince açılır. Anahtar sunucuda kalır ama sayfanın
kendisinden geldiğini söyleyen başlıkları bir betik de gönderebilir; bu yüzden **asıl fren Google tarafındadır**:

1. Google Cloud → **APIs & Services** → **Credentials** → anahtar → **API restrictions:** yalnızca *Routes API*.
2. **APIs & Services** → **Routes API** → **Quotas** → günlük istek sınırını düşür (ör. günde 300).
3. **Billing** → **Budgets & alerts** → küçük bir aylık bütçe ve %50 / %90 / %100 e-posta uyarıları.
4. Site kendi alan adında açılınca rota isteklerine izin verilir; başka alan adları da gerekiyorsa `ALLOWED_ORIGINS`
   adlı değişkene virgülle yaz (ör. `https://negiysem.com,https://www.negiysem.com`).

Sunucu ayrıca her ziyaretçiye (IPv6'da bir hat = /64) saatte en fazla 30 rota cevabı verir.

## Güncelleme

GitHub'da `main` dalına her yüklemede site kendiliğinden yeniden yayınlanır. Başka dallar ayrı bir deneme adresi alır:
`dev` dalı **https://dev.ne-giysem.pages.dev** (Settings → Builds → **Preview branch**: *All non-production branches*,
varsayılan ayar). Deneme uygulaması bu adresin sunucusunu kullanır (RELEASE.md §5a). Değişkenler ve secret'lar
**Production** ve **Preview** için ayrı tutulur: deneme sitesinin canlıyla aynı çalışması için `MET_USER_AGENT`,
`ALLOWED_ORIGINS` ve (açıksa) `GOOGLE_ROUTES_KEY`'i **Preview** ortamına da ekle.

## Bilmen gerekenler

- **Ücretsiz plan:** `/api/...` adreslerine günde **100.000** istek (sayfa, simge gibi dosyalar sınırsız ve ücretsiz).
  Sınır aşılırsa o gün `/api/...` hata verir; sayaç her gece 03:00'te (Türkiye saati) sıfırlanır.
  Sınır aşılırsa ya da sunucu hata verirse uygulama ve widget havayı doğrudan MET Norway'den alır (yarım saat).
  Hazırlanan tahmin her ~1 km'lik bölge için 10 dakika saklanır; bu, ücretsiz plandaki istek başına 10 ms işlem
  süresi sınırının altında kalmayı sağlar.
  Hava durumu aynı ~1 km'lik bölge için MET'in izin verdiği süre boyunca saklandığından MET'e giden istek çok daha azdır.
- **Kaynak gösterme (zorunlu):** hava verisi için sayfada "Hava verisi: MET Norway" (CC BY 4.0, değiştirilerek
  kullanılıyor), yer arama için "© OpenStreetMap katkıda bulunanlar" yazmalı.
- Sorun olursa: proje → **Deployments** → yayına tıkla → **Functions** / **View logs**; hata satırlarını Claude'a gönder.
- **Güvenlik (31 Ekim 2026):** her sayfa yalnızca kendi kodunu çalıştırır ve yalnızca kendi sunucusuna, MET Norway'e,
  Photon'a ve BigDataCloud'a bağlanabilir (`web/index.html` başındaki `Content-Security-Policy`; gizlilik sayfalarında
  hiç kod yok). Çerçeveye alınmama, HTTPS ve diğer başlıklar `web/_headers` dosyasında. Sayfanın kodu her
  değiştiğinde `node tools/csp.js` kodun özetini politikaya yazar; web testleri bunu ve politikanın hiçbir şeyi
  engellemediğini denetler. **AdSense'i açmak, yeni bir servis eklemek ya da uygulamaya başka bir sunucu adresi
  vermek** için önce o adresleri politikaya eklet; yoksa tarayıcı onları engeller (gizlilik metnini de güncelle).
- **Rota sayacı:** rota önerilerinin ziyaretçi başına saatlik sınırı IP adresini saklamaz; sayacın adı IP'den gizli bir
  anahtarla üretilen, geri çevrilemeyen ve her saat değişen bir koddur. Anahtar `RATE_SECRET` adlı **Secret**'tır
  (isteğe bağlı: uzun, rastgele bir metin; parola yöneticisine ürettir); yoksa `GOOGLE_ROUTES_KEY` kullanılır.
- **Yayından önce denetim (önerilir):** proje → **Settings → Builds** → **Build command**: `node ../tools/csp.js --check`
  (kök klasör `web` olduğu için `../`). Sayfanın kodu ile güvenlik politikası eşleşmezse Cloudflare derlemeyi durdurur ve
  eski sürüm yayında kalır.
- **Cloudflare'ın sayfaya kod ekleyen özellikleri kapalı kalsın:** kendi alan adını bağlarsan o alan adında *Email Address
  Obfuscation*, *Rocket Loader*, *Web Analytics* (otomatik ekleme) ve *Zaraz*'ı açma; sayfaların politikası bu eklenen kodu
  engeller (gizlilik sayfalarındaki e-posta adresi `email_off` ile zaten korunuyor).
