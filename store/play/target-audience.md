# Hedef kitle ve içerik — cevaplar

Play Console → Politika ve programlar → Uygulama içeriği → **Hedef kitle ve içerik**. Önce Reklamlar beyanı, Uygulama erişimi ve Gizlilik politikası tamamlanmış olmalı.

Kaynak: <https://support.google.com/googleplay/android-developer/answer/9867159> · Aile politikası: <https://support.google.com/googleplay/android-developer/answer/9893335>

## Hedef yaş grupları

| Yaş grubu | Seçim |
|---|---|
| 5 yaş ve altı | ✘ |
| 6–8 | ✘ |
| 9–12 | ✘ |
| **13–15** | ✔ |
| **16–17** | ✔ |
| **18 ve üzeri** | ✔ |

**Gerekçe:** Genel kitleye yönelik bir hava durumu / kıyafet aracı. 13 yaş altını seçmemek uygulamayı **Aileler (Families) politikası** dışında tutar: o zaman yalnızca Aileler için onaylı reklam SDK’ları, ek reklam ve veri kuralları gerekirdi. 13–15 ve 16–17 seçmek Aileler programını gerektirmez; ancak Google bu grupların bazı ülkelerde “çocuk” sayılabileceğini belirtir, bu yüzden reklam içeriği derecelendirmesini düşük tut (bkz. `content-rating.md`).

**“Reşit olmayanların erişimini kısıtla” (Restrict minor access):** Kullanma — yalnızca 18+ seçildiğinde anlamlı.

## Uygulamanız çocukların ilgisini çekebilir mi? *(Appeal to children)*

**Cevap: Hayır** (soru çıkarsa).

Açıklama kutusuna yazılabilecek metin:

> Ne Giysem? is a general-audience weather and clothing tool. The illustrations are simple garment icons (T-shirt, coat, umbrella), not characters or games. There is a “child profile” option so that parents can see what their child should wear; it is a feature for parents and the app is not designed for or marketed to children under 13.

**Mağaza kaydında dikkat:** Ekran görüntülerinde ve açıklamada çocuklara yönelik dil, çizgi film karakteri ya da oyun öğesi kullanma. Çocuk profilini “çocuğun için ayrı bir profil” diye, ebeveyn özelliği olarak anlat (listing metinleri buna göre yazıldı). Google mağaza kaydı çocuklara hitap ediyor bulursa uygulamayı reddedebilir ya da Aileler politikasını isteyebilir.

## Diğer sorular

| Soru | Cevap |
|---|---|
| Uygulama Aileler / “Öğretmen onaylı” programına katılıyor mu? | Hayır |
| Reklam SDK’ları | Google AdMob (Aileler için gerekmez çünkü 13 yaş altı hedeflenmiyor) |
| Uygulama çocuklardan bilerek veri topluyor mu? | Hayır — hesap yok; çocuk profili bilgileri yalnızca cihazda |

## Sonradan yaş grubunu değiştirirsen

13 yaş altı bir grup eklemek uygulamayı Aileler politikasına sokar (onaylı reklam SDK’ları, reklam kimliği kısıtlamaları, gizlilik metninde çocuk bölümü). Bunu yapmadan önce `data-safety.md`, `ads-declaration.md` ve gizlilik metinlerini yeniden gözden geçir.
