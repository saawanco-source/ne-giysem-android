# Veri güvenliği formu (Data safety) — cevaplar

Play Console → Politika ve programlar → Uygulama içeriği → **Veri güvenliği**. Soru adları Play Console’daki İngilizce adlarıyla birlikte yazıldı. Durum: 24 Ekim 2026, planlanan ilk sürüm (MET Norway + Photon kendi sunucumuz üzerinden, AdMob banner, Trendyol/Amazon ortaklık linkleri). Uygulama Android 16’yı (API 36) hedefliyor; içinde Google Mobile Ads SDK **25.5.0** ve User Messaging Platform (UMP) **4.0.0** var. İzinler bulut derlemesinin denetim raporundan alındı (bkz. §5).

Kaynak tanımlar: <https://support.google.com/googleplay/android-developer/answer/10787469> · AdMob SDK’nın topladıkları: <https://developers.google.com/admob/android/privacy/play-data-disclosure>

> Google’ın tanımına göre **toplama (collect)** = verinin cihazdan çıkması, kendi sunucumuza gitmesi dahil; **paylaşma (share)** = üçüncü tarafa aktarım. Bizim adımıza çalışan hizmet sağlayıcı (Cloudflare) paylaşma sayılmaz. Reklam SDK’sı (AdMob) verileri Google’a kendi amaçları için de gönderdiği için **paylaşma** sayılır. Form, uygulamanın tüm sürümleri ve ülkeleri için tek cevaptır; SDK’ların topladıkları da bizim beyanımızdır.

## 1. Genel sorular

| Soru | Cevap | Gerekçe |
|---|---|---|
| Uygulamanız gerekli kullanıcı veri türlerinden herhangi birini topluyor veya paylaşıyor mu? *(Does your app collect or share any of the required user data types?)* | **Evet** | Konum ve arama metni hava/yer adı için sunucumuza gider; AdMob reklam kimliği, IP’den yaklaşık konum, etkileşim ve tanılama verisi toplar. |
| Toplanan tüm kullanıcı verileri aktarım sırasında şifreleniyor mu? *(Is all of the user data collected by your app encrypted in transit?)* | **Evet** | Uygulama sayfası APK’nın içinden `https://appassets.androidplatform.net` ile yüklenir; sunucumuz (Cloudflare Pages) yalnızca HTTPS; MET Norway ve Photon’a sunucu HTTPS ile gider; Google Mobile Ads SDK TLS kullanır. Koda `http://` adresi eklenmemeli. |
| Hangi hesap oluşturma yöntemlerini destekliyorsunuz? *(Account creation)* | **Uygulamam kullanıcıların hesap oluşturmasına izin vermiyor** *(My app does not allow users to create an account)* | Hesap, giriş, kullanıcı adı yok. Bu yüzden “hesap silme URL’si” gerekmez. |
| Kullanıcıların verilerinin silinmesini isteyebileceği bir yol sunuyor musunuz? *(Do you provide a way for users to request that their data is deleted?)* | **Evet** | Uygulamada “Sana göre → Verilerim → **Tüm verilerimi sil**” cihazdaki her şeyi ve widget verisini siler; uygulamayı kaldırmak da siler. Sunucuda kullanıcıya bağlı kayıt yok; yine de e-postayla talep: `saawanco@gmail.com`. Bağlantı istenirse: `https://ne-giysem.pages.dev/gizlilik.html#silme` |

## 2. Veri türleri

Kısaltmalar: **T** = toplanıyor, **P** = paylaşılıyor, **Geçici** = “geçici olarak işleniyor mu (ephemeral)?”, **Z/İ** = zorunlu / isteğe bağlı.

| Kategori → veri türü | T | P | Geçici | Z/İ | Toplama amaçları | Paylaşma amaçları |
|---|:-:|:-:|:-:|:-:|---|---|
| Konum → **Yaklaşık konum** *(Approximate location)* | ✔ | ✔ | Hayır | Zorunlu | Uygulama işlevselliği; Reklam veya pazarlama; Analiz; Sahtekârlığı önleme, güvenlik ve uyumluluk | Reklam veya pazarlama; Analiz; Sahtekârlığı önleme, güvenlik ve uyumluluk |
| Konum → **Kesin konum** *(Precise location)* | ✔ | ✘ | Hayır | İsteğe bağlı | Uygulama işlevselliği | — |
| Uygulama etkinliği → **Uygulama içi arama geçmişi** *(In-app search history)* | ✔ | ✘ | Hayır | İsteğe bağlı | Uygulama işlevselliği | — |
| Uygulama etkinliği → **Uygulama etkileşimleri** *(App interactions)* | ✔ | ✔ | Hayır | Zorunlu | Reklam veya pazarlama; Analiz; Sahtekârlığı önleme… | Reklam veya pazarlama; Analiz; Sahtekârlığı önleme… |
| Uygulama bilgileri ve performansı → **Kilitlenme günlükleri** *(Crash logs)* | ✔ | ✘ | Hayır | İsteğe bağlı | Uygulama işlevselliği | — |
| Uygulama bilgileri ve performansı → **Teşhis** *(Diagnostics)* | ✔ | ✔ | Hayır | Zorunlu | Uygulama işlevselliği; Analiz; Sahtekârlığı önleme… | Analiz; Sahtekârlığı önleme… |
| Cihaz veya diğer kimlikler *(Device or other IDs)* | ✔ | ✔ | Hayır | Zorunlu | Reklam veya pazarlama; Analiz; Sahtekârlığı önleme… | Reklam veya pazarlama; Analiz; Sahtekârlığı önleme… |

**Toplanmayanlar (işaretleme):** Kişisel bilgiler (ad, e-posta, adres, telefon…), Finansal bilgiler, Sağlık ve fitness, Mesajlar, Fotoğraflar ve videolar, Ses, Dosyalar ve dokümanlar, Takvim, Kişiler, Web’de gezinme geçmişi, Kilitlenme günlükleri *(Crash logs)*, Diğer uygulama performans verileri.

## 3. Gerekçeler

**Yaklaşık konum — toplanıyor, paylaşılıyor, zorunlu.**
- Kendi sunucumuz: cihaz konumu, seçilen/kaydedilen yerlerin, rutin ve bavul listesi yerlerinin koordinatları `/api/forecast` ve `/api/reverse`’e gider; GPS izni yoksa ve kayıtlı yer yoksa `/api/ip` Cloudflare’in IP’den çıkardığı yaklaşık konumu kullanır. Google: “IP adresinden çıkarılan yaklaşık konum da beyan edilmeli.” → **toplama**, amaç *Uygulama işlevselliği*.
- AdMob: SDK IP adresini toplar ve “cihazın genel konumunu tahmin etmek için” kullanabilir; veriyi Google’a gönderir → **toplama + paylaşma**, amaçlar reklam, analiz, sahtekârlık önleme. (Reklam şeridi yalnızca `Config.API` ve `ADMOB_BANNER_ID` doluyken açılır; form reklamlı yayın sürümüne göre doldurulur.)
- **Zorunlu:** Uygulamanın asıl işi (havaya göre kıyafet) her zaman bir konumla çalışır (cihaz, IP ya da seçilen yer) ve reklamlar kapatılamaz. Google: “Uygulamanın bazı kullanıcıları için zorunluysa isteğe bağlı deme.”
- **Geçici değil:** Sunucu koordinatları bir veritabanına yazmaz, ama Cloudflare’in standart istek kayıtları istek adresini (sorgu dizesindeki koordinatlar dahil) tutabilir ve sonuçlar yuvarlanmış koordinatla önbelleğe alınır. Bu yüzden “yalnızca bellekte işlenir” demek doğru olmaz; *Hayır* dürüst cevap. (Geçici işaretlemek yalnızca mağaza sayfasındaki gösterimi değiştirir; bu kazancı riske değmez.)

**Kesin konum — toplanıyor, paylaşılmıyor, isteğe bağlı.**
- Manifest şu an (24 Ekim 2026, API 36 sürümü) `ACCESS_FINE_LOCATION` da istiyor; birleştirilmiş manifestte doğrulandı. Bu yüzden bu satır kalır. Android 12+ kullanıcı “Tam” konumu seçerse uygulama GPS hassasiyetinde koordinatı sunucuya gönderir (istemci 4 hane yolluyor). Google’ın tanımında 3 km²’den küçük alan “kesin” sayılır; sunucunun yuvarladığı ~1 km ve ~100 m hücreler de bu tanımda kesindir.
- **İsteğe bağlı:** Kullanıcı “Yaklaşık”ı seçebilir, izni reddedip yer arayabilir ya da havayı elle ayarlayabilir.
- **Paylaşılmıyor:** Sunucu MET Norway ve Photon’a yalnızca yuvarlanmış koordinatı, kendi User-Agent’ıyla, IP adresi ve hiçbir kimlik olmadan, ortak önbellek üzerinden gönderir. Google’ın “anonimleştirilmiş veri” istisnası: “artık tek bir kullanıcıyla ilişkilendirilemeyecek şekilde anonimleştirilmiş”. Daha temkinli istersen: Kesin ve Yaklaşık konum için *Paylaşılıyor → Uygulama işlevselliği* de işaretleyebilirsin; listede bir satır ekler, başka bir şeyi değiştirmez.
- **Sadeleştirme önerisi:** Uygulamaya yaklaşık konum yetiyorsa manifestten ve `requestPermissions` çağrısından `ACCESS_FINE_LOCATION`’ı kaldır. O zaman cihaz konumu yalnızca yaklaşık olur ve “Kesin konum” satırını kaldırabilirsin (yeni form gönder). Not: arama ile seçilen bir yerin koordinatı (ör. bir kütüphane) yine hassastır; bu kullanıcının seçtiği bir yer olduğu ve cihaz konumu olmadığı için “Yaklaşık konum + Uygulama içi arama geçmişi” beyanı yeterli kabul edilir — emin değilsen Kesin konumu bırak.

**Uygulama içi arama geçmişi — toplanıyor, paylaşılmıyor, isteğe bağlı.**
- Arama kutusuna yazılan metin `/api/search` ile sunucuya, oradan IP’siz olarak Photon’a gider; sonuç arama metnine göre bir gün önbelleğe alınır (kullanıcıya bağlı değil). Yalnızca kullanıcı arama yaptığında → isteğe bağlı.

**Uygulama etkileşimleri, Teşhis, Cihaz veya diğer kimlikler — AdMob.**
- Google Mobile Ads SDK: reklam kimliği ve uygulama grubu kimliği (*app set ID*), uygulama açılışları, dokunmalar, video görüntülemeleri, uygulama ve SDK performans verileri; reklam, analiz ve sahtekârlık önleme için toplanır ve paylaşılır. Reklamlar kapatılamadığı için **zorunlu**. Google’ın açıklama sayfası 24 Ekim 2026’da kullanılan sürüm (25.5.0) için okundu: IP adresi (genel konum), ürün etkileşimleri, tanılama bilgisi, cihaz ve hesap kimlikleri — yukarıdaki satırlarla aynı. SDK sürümü değişince sayfayı yeniden kontrol et.
- Birleştirilmiş manifestte SDK’nın eklediği `com.google.android.gms.permission.AD_ID` izni **var** (reklam kimliği kullanılıyor → “Reklam kimliği” beyanı **Evet**, `ads-declaration.md` §2).

**Neden diğerleri işaretlenmiyor?**
- Ayarlar, kayıtlı yerlerin adları, rutin, profiller, Dolabım, bavul listesi: cihazda kalır, cihazdan çıkmaz → toplanmaz. (Rutindeki yerlerin **koordinatları** hava için gider; yukarıda konum olarak beyan edildi.)
- Paylaşım kartı: görsel cihazda üretilir ve yalnızca kullanıcı “Paylaş”a dokununca Android’in paylaşım ekranına verilir → kullanıcı başlatmalı aktarım, toplama değil.
- Ortaklık linkleri ve diğer dış linkler tarayıcıda açılır; uygulama kullanıcı verisi göndermez (linkte yalnızca ortaklık kodu var).
- Bağış: Play uygulamasında yok.
- Kilitlenme günlükleri: uygulamada çökme raporlama SDK’sı yok. Play Console’un kendi “Android vitals” verisi uygulamanın topladığı veri sayılmaz. İleride Crashlytics vb. eklenirse formu güncelle.
- “Sorun bildir” (30 Ekim 2026): son hata/çökme kayıtları ve sürüm, cihaz modeli gibi teknik bilgiler cihazda durur ve **yalnızca kullanıcı kendi e-posta uygulamasından göndermeyi seçerse** bize ulaşır; uygulama kendisi hiçbir şey göndermez, metni kullanıcı gönderilmeden önce görür ve değiştirebilir. Google’ın “kullanıcının başlattığı işlem” istisnası **paylaşma** içindir, toplama için değil; bize ulaştığı için bu **toplama** sayılır. Formda: *Uygulama bilgileri ve performansı → **Kilitlenme günlükleri***: Toplanıyor ✔, Paylaşılıyor ✘, Geçici Hayır, **İsteğe bağlı**, amaç *Uygulama işlevselliği*. Mevcut **Teşhis** satırına (AdMob yüzünden zorunlu) amaç olarak *Uygulama işlevselliği*ni de ekle.
- Yazı tipleri (31 Ekim 2026): uygulamanın ve sitenin kendi dosyaları (`web/fonts`, APK’nın içinde); Google Fonts’a ya da başka bir siteye istek gitmez. Sayfanın içerik güvenliği politikası (CSP) yalnızca gizlilik metninde sayılan servislere bağlanmaya izin verir.
- Kapalı test grubu (Google Grupları): test kullanıcılarının e-posta adresleri uygulamadan değil, Google Grupları ve Play Console üzerinden gelir; uygulamanın topladığı veri sayılmaz, formu değiştirmez. Gizlilik metninde ayrıca anlatılıyor (`store/play/kapali-test.md`).

## 4. Değişince formu yeniden gönder

Yeni SDK (analiz, çökme raporu), hesap/giriş, uygulama içinde bağış veya ödeme, reklam kişiselleştirme rıza ekranı, `ACCESS_FINE_LOCATION`’ın kaldırılması ya da sunucunun kayıt tutmaya başlaması durumunda bu sayfayı ve formu güncelle; gizlilik metinlerini (`web/gizlilik.html`, `web/privacy.html`) de aynı anda değiştir.

## 5. Uygulamanın istediği izinler (24 Ekim 2026, bulut derlemesinde doğrulandı)

Her bulut derlemesindeki “Dosyaları denetle” adımı bu listeyi APK’dan ve AAB’den okur; listede olmayan bir izin çıkarsa derleme durur ve bu formun gözden geçirilmesi gerekir.

| İzin | Kim ekliyor | Formdaki karşılığı |
|---|---|---|
| `INTERNET`, `ACCESS_NETWORK_STATE` | Uygulama, AdMob, WorkManager | — (veri türü değil) |
| `ACCESS_COARSE_LOCATION` | Uygulama | Yaklaşık konum |
| `ACCESS_FINE_LOCATION` | Uygulama | Kesin konum (isteğe bağlı) |
| `com.google.android.gms.permission.AD_ID` | Google Mobile Ads SDK | Cihaz veya diğer kimlikler; Reklam kimliği beyanı “Evet” |
| `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION`, `ACCESS_ADSERVICES_TOPICS` | Google Mobile Ads SDK (Android’in Privacy Sandbox reklam arayüzleri) | Yeni veri türü yok; reklam/analiz amaçlı satırlarla kapsanır |
| `WAKE_LOCK`, `FOREGROUND_SERVICE` | WorkManager (widget’ın ve hava uyarılarının arka plan yenilemesi) | — |
| `POST_NOTIFICATIONS` | Uygulama (hava uyarısı bildirimleri; yalnızca kişi “Sana göre → Hava uyarıları”nı açınca sorulur) | — (veri toplanmaz; uyarı telefonda hesaplanır) |
| `com.negiysem.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | AndroidX Core (uygulamanın kendi iç izni) | — |

## 6. Saat uygulaması (Wear OS, 26 Ekim 2026)

Telefon, widget özetini (yer adı, sıcaklık, kıyafet, uyarı) Google Play hizmetlerinin Data Layer'ı ile eşleştirilmiş saate gönderir. Bu, kullanıcının kendi cihazları arasında aktarımdır; geliştiriciye veri gelmez. Saat Bluetooth ile bağlı değilken Google'ın sunucularından geçebilir; Google'ın bu aktarımı kendi politikasına tabidir. Formda yeni bir veri türü gerekmez (konum zaten "Yaklaşık konum" olarak beyanlı), ama "veriler aktarılırken şifrelenir" cevabı Data Layer için de geçerlidir.

