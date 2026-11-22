# Bulmaca

Beş harfinle çengel bulmacayı doldur. Bota karşı veya arkadaşınla iki cihazdan oyna.

## Arkadaşınla oynamak

1. Oyunu aç ve adını gir.
2. **Arkadaşınla canlı** bölümünden oda kur.
3. Lobideki **WhatsApp** düğmesiyle oda davetini gönder.
4. Arkadaşın bağlantıya dokununca aynı oyun açılır. İkiniz de oyun sekmesini açık tutun.

Ana oyun bağlantısı menüyü açar. Aynı maça girmek için `?oda=KOD` içeren oda davetini paylaşın. Davet bağlantısı oyuncuların gizli anahtarlarını içermez.

Oda kurucusunun tarayıcısı hamleleri doğrular ve oyunu eşitler. Kurucu WhatsApp'a geçince oyun bekleyebilir; oyun sekmesine dönünce bağlantı otomatik toparlanır. Sayfa yenilenirse ana menüdeki **Arkadaşınla oyuna dön** seçeneğiyle aynı odaya dönülebilir. Kurucunun tarayıcı verileri silinirse eski oda geri yüklenemez.

## GitHub Pages

Bu klasörün tamamını, alt klasör yapısını koruyarak depoya yükleyin. **Settings → Pages → Deploy from a branch → main → /(root)** ayarıyla yayınlayın. Derleme veya API anahtarı gerektirmez. Canlı oyun HTTPS ve halka açık MQTT aktarım sunucuları kullanır; bu dış hizmetlerin erişilebilirliğine bağlıdır.

Manifest, servis çalışanı ve varlık yolları GitHub Pages proje alt klasörlerini destekler. Telefonlara kurulum için ana ekrandaki **Telefona kur** düğmesini kullanın.
