# Kapalı test: herkese açık katılım (Google Grubu), gizlilik ve güvenlik

Kişisel Play hesabında üretime çıkmak için en az 12 kişinin kapalı teste **kesintisiz 14 gün** katılmış olması gerekir
(`checklist.md` §7). Bu sayfa testi bir Google Grubu ile herkese açmanın adımlarını, paylaşılacak metinleri ve bu
sırada senin ve test kullanıcılarının gizliliğini korumak için yapılacakları anlatır. Kodda yapılanlar en altta.

## 0. Önce bil: Play'de senin hakkında ne görünür?

- **Kişisel hesapta Google; yasal adını, ülkeni (yasal adresine göre) ve geliştirici e-postanı Play'de gösterir.**
  Play üzerinden para kazanırsan (ücretli uygulama ya da uygulama içi satın alma; bunun için satıcı hesabı gerekir)
  **tam adresin** de gösterilir. Ne Giysem? ücretsiz ve Play üzerinden satış yapmıyor; reklamlar AdMob'dan geliyor.
  Yayından önce Play Console'un geliştirici hesabı ayarlarında (hesap ayrıntıları) nelerin gösterileceğini kontrol et.
  Kaynak: <https://support.google.com/googleplay/android-developer/answer/13628312>
- Adının görünmesini hiç istemiyorsan tek yol bir kuruluş (şirket) hesabıdır; şirket ve D-U-N-S numarası ister.
- Herkese açık iletişim adresi **saawanco@gmail.com**. Okul e-postanı, kişisel e-postanı, telefonunu ya da adresini
  duyuruda, grup açıklamasında, Play mağaza kaydında ve testçilerle yazışmada **hiç kullanma**; her şeyi saawanco
  hesabından yap.

## 1. Google Grubunu kur (saawanco hesabıyla)

<https://groups.google.com> → **Grup oluştur**.

- **Grup adı:** `Ne Giysem? Test` · **Grup e-postası:** `ne-giysem-test` (alınmışsa `negiysem-test` gibi bir benzeri)
- **Açıklama:** aşağıdaki §4 metni.
- Ayarlar (Türkçe arayüzde adlar biraz farklı olabilir; anlamı aynı olanı seç):

| Ayar | Seçim | Neden |
|---|---|---|
| Grubu kimler arayabilir | Yalnızca grup üyeleri | Grup dizinde listelenmez; yalnızca bağlantıyı alan bulur |
| Kimler katılabilir | Web'deki herkes katılabilir | Onay beklemeden testçi olunur |
| Konuşmaları kimler görebilir | Grup yöneticileri | Grupta yazışma yok |
| Kimler yayın yapabilir (gönderi) | Grup sahipleri | Spam ve istenmeyen e-posta olmaz |
| **Üyeleri kimler görebilir** | **Grup yöneticileri** | **Testçiler birbirinin e-postasını göremez** |
| Grup sahipleriyle kimler iletişim kurabilir | Grup yöneticileri | Senin adresin üyelere açılmaz; geri bildirim Play'den gelir |
| E-postayla gönderi / konuşma geçmişi | Kapalı | Grup yalnızca test erişimi için |

- Tek sahip saawanco hesabı olsun; başka bir hesabını (okul, kişisel) yönetici ya da üye olarak **ekleme**.
- Üye listesini dışa aktarma, kopyalama ya da başka bir yerde saklama. Üyelere toplu e-posta gönderme.

## 2. Play Console'da kapalı teste bağla

1. Uygulama → **Test etme → Kapalı test** → kanal (ör. "Alfa") → **Test kullanıcıları** sekmesi.
2. **Google Grupları** kutusuna grubun adresini yaz (`ne-giysem-test@googlegroups.com`) → **Kaydet**.
3. **Geri bildirim URL'si veya e-posta adresi:** `saawanco@gmail.com` (katılım sayfasında testçilere görünür).
4. **Ülkeler/bölgeler:** Türkiye.
5. Kanalda yayınlanmış bir sürüm yoksa `NeGiysem.aab`'yi yükle (`RELEASE.md` §5) ve yayınla. İnceleme bitip durum
   **Yayınlandı** olunca aynı sekmede **katılım bağlantısı** görünür (biçimi
   `https://play.google.com/apps/testing/com.negiysem.app`).
6. Saat yüzü ayrı bir uygulamadır (`com.negiysem.app.watchface`) ve kendi kapalı testi gerekir: aynı grubu onun
   kapalı test kanalına da ekle. Saat uygulaması telefon uygulamasıyla aynı kayıttadır; ayrı test istemez.

## 3. Paylaşılacak duyuru

Grup bağlantısı: `https://groups.google.com/g/ne-giysem-test` (grup adına göre). Katılım bağlantısı: §2-5.

> **Ne Giysem? için test kullanıcısı arıyorum**
>
> Bulunduğun yerin havasına göre bugün ne giyeceğini tek bakışta söyleyen ücretsiz bir Android uygulaması yaptım.
> Ana ekran widget'ı ve Galaxy Watch desteği var. Google Play'de herkese açmadan önce 14 gün test edilmesi gerekiyor.
>
> Katılmak için Android telefon ve Google hesabı yeterli:
> 1. Gruba katıl: [GRUP BAĞLANTISI]
> 2. Test bağlantısını aç, "Test kullanıcısı ol"a dokun: [KATILIM BAĞLANTISI]
> 3. Uygulamayı Play Store'dan kur, birkaç gün aç bak.
> 4. 14 gün boyunca silme ve testten çıkma.
>
> Gizlilik: Hesap açmazsın, ayarların ve kayıtlı yerlerin yalnızca telefonunda kalır. Gruba katıldığın Google
> hesabının e-postasını yalnızca ben görürüm; grup üyeleri birbirini göremez, kimseyle paylaşılmaz ve test bitince
> grup silinir. Ayrıntılar: https://ne-giysem.pages.dev/gizlilik.html
>
> Görüşlerini Play Store'daki uygulama sayfasından "özel geri bildirim" olarak ya da uygulamada
> "Sana göre → Sorun bildir" ile gönderebilirsin. Teşekkürler!

## 4. Grup açıklaması ve hoş geldin mesajı

> Ne Giysem? Android uygulamasının Google Play kapalı testi. Katıldıktan sonra test bağlantısını aç, "Test kullanıcısı
> ol"a dokun ve uygulamayı Play Store'dan kur: [KATILIM BAĞLANTISI]
>
> Kişisel veriler (KVKK aydınlatma): Bu gruba katıldığında Google hesabının e-posta adresi ve adı veri sorumlusu
> saawanco'ya (saawanco@gmail.com) görünür. Yalnızca test erişimi vermek, Google Play'in test şartını karşılamak ve
> geri bildirimine cevap vermek için kullanılır (KVKK m.5/2-c ve f); kimseyle paylaşılmaz, reklam ya da pazarlama için
> kullanılmaz. Grup Google'ın sunucularında (yurt dışı) durur. Üyeler birbirini göremez. Test bitip uygulama herkese
> açıldıktan sonra en geç 30 gün içinde grup silinir; istediğin an gruptan ayrılabilirsin. KVKK m.11'deki hakların ve
> ayrıntılar: https://ne-giysem.pages.dev/gizlilik.html

## 5. Test sırasında

- Katılımcı sayısını Play Console → Kapalı test → **Test kullanıcıları**'nda izle. Başvurduğun gün en az 12 kişi
  katılmış olmalı; ayrılan birinin 14 günü baştan başlar. 20–25 kişi hedefle.
- Geri bildirimler: Play Console → **Kalite → Puanlar ve yorumlar → Test geri bildirimleri** ve saawanco e-postası.
  Başvuru formu geri bildirimi nasıl topladığını soruyor; aldıklarını ve yaptığın düzeltmeleri kısaca not et.
  Testçilerin adlarını ya da e-postalarını bu notlara yazma.
- Düzeltmeleri yeni kapalı test sürümü olarak yayımla (her yeni `surum-N`'in `.aab`'si).

## 6. Test bitince temizlik (gizlilik metninde söz verildi)

Üretim erişimi onaylanıp uygulama herkese açıldıktan sonra **en geç 30 gün içinde**:

1. Kapalı test kanalındaki Google Grubunu kaldır (ya da kanalı durdur).
2. groups.google.com → grup → **Grubu sil**.
3. Testçilerle yazıştığın e-postaları, yazışma bittikten sonra en geç 12 ay içinde sil (gizlilik metni §9).

## 7. Hesap güvenliği (senin yapacakların)

- **saawanco Google hesabı:** 2 adımlı doğrulama açık ve ana yöntem **geçiş anahtarı (passkey)** ya da güvenlik anahtarı
  olsun (yalnızca SMS'e güvenme). Kurtarma e-postası ve telefonu güncel olsun. <https://myaccount.google.com/security-checkup>
  ile güvenlik kontrolünü yap; tanımadığın cihaz ve uygulama erişimlerini kaldır. En sıkı seçenek: **Gelişmiş Koruma
  Programı** (iki güvenlik anahtarı ister).
- **Play Console:** **Kullanıcılar ve izinler**'de yalnızca sen ol. Doğrulama için verdiğin telefon Play'de gösterilmez;
  geliştirici e-postası saawanco@gmail.com olsun.
- **GitHub (depo herkese açık):** hesapta 2FA (geçiş anahtarı ya da doğrulama uygulaması). Deponun **Settings → Code
  security**: *Secret scanning*, *Push protection*, *Dependabot alerts* ve *Private vulnerability reporting* aç (herkese
  açık depolarda ücretsiz). **Settings → Branches**: `main` için koruma kuralı ekle (zorla gönderme ve silme kapalı).
  Depoda hiçbir anahtar, parola ya da kişisel bilgi yok; commit'ler GitHub'ın gizli (noreply) adresiyle (31 Ekim 2026'da
  bütün geçmiş tarandı).
- **Cloudflare:** hesapta 2FA. Pages projesindeki `GOOGLE_ROUTES_KEY` **Secret** (şifreli) tipinde olsun. Kullanmadığın
  API anahtarlarını (API Tokens) sil. Proje → **Settings → Builds → Build command**: `node ../tools/csp.js --check`
  yaz; kodla güvenlik politikası eşleşmeyen bir sayfa böylece hiç yayına çıkmaz (`DEPLOY.md`, "Güvenlik").
  İsteğe bağlı: `RATE_SECRET` adlı bir Secret ekle (parola yöneticisinin ürettiği uzun rastgele bir metin).
- **Eski GitHub sürümleri:** `surum-1`–`surum-27` herkese açık debug anahtarıyla imzalı. Bunları GitHub'da **Releases**
  sayfasından silmeni öneririm (silme kalıcıdır, kararı senin); kendi telefonunda bunlardan biri kuruluysa kaldırıp
  güncel sürümü kur.
- **Google Cloud (rota anahtarı):** anahtar yalnızca **Routes API**'ye kısıtlı, günlük kota koyulu ve bir **bütçe uyarısı**
  tanımlı olsun (`DEPLOY.md` §5).
- **İmza anahtarı:** `negiysem-upload.p12` ve parolası iki ayrı yerde (parola yöneticisi + çevrimdışı bir USB bellek),
  kimseyle paylaşma (`RELEASE.md`).

## 8. Kodda yapılanlar (31 Ekim 2026)

- **Yazı tipleri sitenin ve uygulamanın kendi dosyaları** (`web/fonts`, APK'nın içinde): sayfa açılırken Google Fonts'a
  ya da başka bir siteye istek gitmez; IP adresi kimseye ulaşmaz. Çevrimdışı da çalışır.
- **İçerik güvenliği politikası (CSP):** sayfa yalnızca kendi kodunu (özetiyle) çalıştırır ve yalnızca kendi sunucusuna,
  MET Norway'e, Photon'a ve BigDataCloud'a bağlanabilir; başka bir siteye veri gönderemez, araya sokulmuş kod
  çalışamaz. Gizlilik sayfalarında hiç kod yok. Web testleri politikanın hiçbir şeyi engellemediğini denetler.
- **Site başlıkları** (`web/_headers`): yalnızca HTTPS, başka sitelerde çerçeve içinde açılamaz, diğer sitelere hangi
  sayfadan gelindiği söylenmez, kamera/mikrofon/ödeme erişimi kapalı.
- **Rota sayacı IP saklamaz:** ziyaretçi başına saatlik sınır, IP'den gizli anahtarla üretilen ve her saat değişen bir
  kodla sayılır; sayaç en geç o saatin sonunda silinir.
- **Site yayınlanmadan denetim:** sayfanın kodu ile politikası eşleşmezse CI'ın ilk adımı durur; Cloudflare'daki derleme
  komutu da aynı denetimi yaparsa (§7) bozuk bir sayfa hiç yayına çıkmaz.
- **Android:** konum izni yalnızca uygulamanın kendi sayfasına verilir (başka bir sayfa zaten açılamaz); verileri Google
  yedeklemesine gitmez (yeni telefona doğrudan aktarımda Android onları taşıyabilir). Bundaki sayfanın politikası
  derlemede denetlenir: sunucu adresi politikada yoksa derleme durur.
- **Bulut derlemesi** yükleme anahtarı olmadan hiçbir sürümü yayımlamaz (herkese açık debug anahtarıyla imzalı bir
  sürüm çıkamaz). `surum-1`–`surum-27` arasındaki eski sürümler debug anahtarıyla imzalıydı (§7'ye bak).
- **Sayfadaki konum adları:** yer adı aramaları en fazla ~100 m (3 hane) hassasiyetle gider.
- **Gizlilik metni** (`web/gizlilik.html`, `web/privacy.html`): test programı, rota sayacı, yazı tipleri ve güvenlik
  önlemleri eklendi; tarih 31 Ekim 2026.
- **`SECURITY.md`:** güvenlik açığı bildirim yolu.
- Service worker: gizlilik sayfasını açmak artık uygulamanın çevrimdışı kopyasının yerine geçmez.

Not: Bu metinler hukuki danışmanlık değildir; KVKK metinleri yaygın uygulamaya göre hazırlandı. Uygulama büyürse ya da
para kazanmaya başlarsa bir hukukçuya göstermek iyi olur (ör. KVKK'da veri sorumlusunun kimliğinin bir takma adla
yazılmasının yeterli olup olmadığı).
