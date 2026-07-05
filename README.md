# ekonomiX

Google hesabıyla giriş yapılan, sanal bakiyeli bir topluluk uygulaması. Node.js + Express + PostgreSQL (Neon) ile çalışır.

## Şu an neler var
- Google ile giriş (Passport.js)
- Her hesaba girişte 1.000 sanal TL tanımlanır
- Sohbet sekmesi: yazı, fotoğraf, video linki paylaşımı
- Sıralama sekmesi: bakiyeye göre sıralanan kullanıcı listesi
- Taş Kağıt Makas ve Top Tutma sekmeleri: "yakında" ekranı, oyun mantığı bir sonraki adımda ekleniyor

## Yerelde çalıştırma
1. `npm install`
2. `.env.example` dosyasını kopyalayıp `.env` yap, içine gerekli değerleri gir
3. `npm start`
4. Tarayıcıda `http://localhost:3000` adresini aç

## Ortam değişkenleri
- `DATABASE_URL` — Neon bağlantı adresi
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` — Google Cloud Console'dan
- `SESSION_SECRET` — rastgele, uzun bir metin

## Render'a yükleme
Adımlar sohbette Türkçe olarak anlatıldı.

## Notlar
- Fotoğraflar veritabanına base64 olarak kaydediliyor.
- Video için dosya yükleme yok, sadece link (YouTube gömülü oynatılıyor, doğrudan .mp4 linkleri de çalışıyor).
- Bakiye sadece giriş anında tanımlanıyor; harcama/kazanma mekanikleri (oyunlar) henüz yok.
