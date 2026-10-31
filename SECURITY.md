# Güvenlik / Security

## Açık bildirimi

Ne Giysem?'de (web sitesi, Android uygulaması, saat uygulaması, saat yüzü ya da sunucu işlevleri) bir güvenlik açığı
bulduysan lütfen **herkese açık bir issue açmadan** önce saawanco@gmail.com adresine yaz: neyi, nasıl tekrarlanacağını
ve etkisini anlat. En geç 7 gün içinde cevap verilir; düzeltme yayımlanana kadar ayrıntıları paylaşmamanı rica ederiz.
Kişisel verilere, başka kullanıcıların cihazlarına ya da hizmetin çalışmasına zarar verecek denemeler yapma.

## Reporting a vulnerability

If you find a security issue in Ne Giysem? (website, Android app, watch app, watch face or server functions), please
email saawanco@gmail.com **before opening a public issue**: what it is, how to reproduce it and its impact. You will get
an answer within 7 days; please keep the details private until a fix is released. Do not run tests that could harm
personal data, other people's devices or the service.

## Bu depoda neler yok / What this repository never contains

İmza anahtarları, parolalar, API anahtarları ve kişisel veriler bu depoya girmez: imza anahtarı GitHub Secrets'ta, Google
anahtarı Cloudflare'ın gizli değişkenlerinde durur (`RELEASE.md`, `DEPLOY.md`). `app/debug.keystore` yalnızca yerel
geliştirme derlemeleri için Android'in herkese açık deneme anahtarıdır. `surum-28`'den beri yayımlanan bütün sürümler
yükleme anahtarıyla imzalıdır ve bulut derlemesi bu anahtar olmadan sürüm yayımlamaz. Daha eski (debug anahtarıyla
imzalı) bir sürümü kuranlar onu kaldırıp güncel sürümü kurmalıdır (`RELEASE.md` §4).

Signing keys, passwords, API keys and personal data are never committed: the signing key is kept in GitHub Secrets and
the Google key in Cloudflare's secret variables. `app/debug.keystore` is Android's public debug key for local
development builds only. Every release since `surum-28` is signed with the upload key, and the build never publishes
without it. Anyone who installed an older, debug-signed build should uninstall it and install the current release.
