# Google Play mağaza kaydı — Türkçe

Türkçe (tr-TR) — varsayılan dil. Play Console → Büyüme → Mağaza varlığı → Ana mağaza kaydı. Metinleri kod bloklarından olduğu gibi kopyala. Sayılar Unicode karakterine göre (ı, ş, ğ birer karakter), boşluk ve satır sonları dahil; `node` ile sayıldı.

## Karakter sayıları

| Alan | Sınır | Sayı |
|---|---:|---:|
| Uygulama adı | 30 | **26** |
| Kısa açıklama | 80 | **67** |
| Tam açıklama | 4000 | **2331** |
| Sürüm notları (ilk sürüm, 5 satır) | 500 | **334** |

## Uygulama adı (26/30)

```text
Ne Giysem? Hava ve Kıyafet
```

## Kısa açıklama (67/80)

```text
Bulunduğun yerin havasına göre bugün ne giyeceğini bir bakışta gör.
```

## Tam açıklama (2331/4000)

```text
Sabah kapıdan çıkmadan önce tek soruya cevap: Bugün ne giysem?

Ne Giysem?, bulunduğun yerin hava tahminine bakar ve bugün giyeceklerini büyük, renkli çıkartmalarla gösterir. Ekranın rengi günün sıcaklığına göre değişir; tişört havası mı, mont havası mı, tek bakışta anlarsın.

Ne yapar?
• Hissedilen sıcaklığa, yağmura, kara, rüzgara ve UV'ye göre bugünün kıyafeti
• "Yanına al" önerileri: akşam serinleyecekse hırka, yağmur varsa şemsiye, güneş güçlüyse gözlük ve krem
• Her çıkartmaya dokununca neden önerildiğini anlatan bilgi kartı
• Saat saat hava şeridi ve haftalık görünüm
• Yağmur yaklaşırken uyarı

Sana göre
• "Çabuk üşürüm" ya da "Sıcak tutarım": öneriler senin vücuduna göre ayarlanır
• Şehir, arazi ya da spor: ne yapacağına göre farklı öneriler
• Profiller: örneğin çocuğun için ayrı bir profil
• Dolabım: sahip olduğun kıyafetleri işaretle

Günüm
Evden okula, işten eve yolculuklarını ve yürüyüş, durakta bekleme, metro, vapur gibi adımlarını bir kez gir. Ne Giysem? kıyafeti gerçekten dışarıda olacağın anlara göre seçer ve yağmurda ya da soğukta daha az kalacağın rotayı önerir.

Seyahat
Bavul listesi, gideceğin yerin tahminine göre kaç gün için ne alacağını listeler; aldıklarını işaretlersin.

Pratik
• Kayıtlı yerler; semt, okul, durak ya da adres araması
• Ana ekran widget'ı: bugünün kıyafeti, uygulamayı açmadan
• Aşağı çekip yenile; internet yokken son alınan hava gösterilir
• Paylaşım kartı: bugünün önerisini görsel olarak paylaş
• Açık ve koyu görünüm; Türkçe ve İngilizce

Gizlilik
Hesap gerekmez. Ayarların, yerlerin, rutinin ve dolabın yalnızca cihazında durur; "Tüm verilerimi sil" ile hepsini silebilirsin. Konumun yalnızca hava durumunu ve yer adını bulmak için kullanılır, arka planda konuma bakılmaz. Yaklaşık konum izni yeterlidir; istersen konum izni vermeden yer arayıp seçebilirsin.

Reklamlar ve ortaklık linkleri
Uygulamada reklam gösterilir (Google AdMob). Bazı kıyafetlerin yanında "Satın al / ortaklık linki" etiketli Trendyol ve Amazon.com.tr bağlantıları bulunur. Bu linklerden alışveriş yaparsan geliştirici komisyon kazanabilir; ödediğin fiyat değişmez. Öneriler hava durumuna göre seçilir, linkler sonradan eklenir.

Hava verisi: MET Norway (CC BY 4.0). Harita verisi: © OpenStreetMap katkıcıları.
Ne Giysem?, Türkiye'de bağımsız bir geliştiricinin yaptığı küçük bir uygulamadır.
```

## Sürüm notları (ilk sürüm, 5 satır) (334/500)

```text
İlk sürüm: bulunduğun yerin havasına göre bugünün kıyafeti, büyük çıkartmalarla.
Günüm: yolculuklarına göre kıyafet ve yağmurda daha az kalacağın rota önerisi.
Haftalık görünüm, bavul listesi ve yağmur uyarısı.
Ana ekran widget'ı, çevrimdışı son hava, açık ve koyu görünüm.
Hesap yok: verilerin cihazında durur, tek dokunuşla silinir.
```

## Diğer mağaza kaydı alanları

- **Kategori:** Uygulama → **Hava Durumu** (alternatif: Yaşam Tarzı). Etiketler: Play’in listesinden en fazla 5 tane, örneğin hava durumu, moda, yaşam tarzı.
- **E-posta (herkese açık):** `{{İLETİŞİM_E_POSTASI}}` · **Web sitesi:** `https://{{ALAN_ADI}}` (AdMob’un app-ads.txt kontrolü bu alan adına bakar) · Telefon: boş bırakılabilir.
- **Gizlilik politikası URL’si** (Uygulama içeriği bölümünde): `https://{{ALAN_ADI}}/gizlilik.html`
- **Grafikler:** simge `web/icons/maskable-512.png` (512×512, tam kare; `icon-512.png` köşeleri yuvarlatılmış ve saydam olduğu için uygun değil), öne çıkan grafik `graphics/feature-graphic.png`, telefon ekran görüntüleri `screenshots/out/*.png` (Play en az 2, en fazla 8 kabul eder).
- **Yazarken uyulanlar:** “en iyi”, “1 numara”, “ücretsiz” gibi sıralama/fiyat ifadeleri, emoji, BÜYÜK HARF ve anahtar kelime tekrarı yok. Reklam ve ortaklık linkleri açıkça yazıldı. Bağış linkinden söz edilmedi (Play uygulamasında yok).
- **Yayından önce:** İlk sürümde olmayan bir özellik (ör. profiller, Dolabım, İngilizce arayüz, haftalık görünüm) kalırsa o satırı sil; mağaza kaydı uygulamada olmayan bir şeyi vaat etmemeli.
