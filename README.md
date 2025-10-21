# Google SERP Scraper (IDNSPORTS)

Chrome Extension yang mempercepat audit brand pada Google SERP (khusus tampilan mobile) dengan integrasi whitelist tersinkron ke API Anda.

## Fitur Utama
- **Login aman** ke API OVH/Web Cloud melalui endpoint `auth/login` dan penyimpanan token di `chrome.storage`.
- **Scraping SERP otomatis** yang akan terus menekan tombol *Hasil penelusuran lainnya* sampai Google tidak lagi menampilkan tombol tersebut, kemudian mengambil seluruh hasil yang terlihat.
- **Normalisasi & deduplikasi link** termasuk AMP, sehingga daftar link yang disalin bersih dari entri ganda.
- **Whitelist terpadu**:
  - Tambah link langsung dari hasil SERP atau secara bulk.
  - Cegah duplikasi otomatis bila domain sudah ada di whitelist.
  - Bubble pencarian/filtrasi di panel whitelist.
- **Ekspor cepat** melalui tombol *Copy untuk Laporan* (format laporan) dan *Copy Link Saja*.
- **Cache sisi klien** dengan TTL (10 menit per keyword, 24 jam untuk keyword `Umum`) agar permintaan whitelist hemat API.

## Persyaratan
- Google Chrome atau Chromium-based browser lain yang mendukung Manifest V3.
- Akun backend dengan endpoint berikut (schema JSON dapat disesuaikan):
  - `POST /auth/login`
  - `GET /auth/me`
  - `GET /keywords`
  - `POST /keywords/upsert`
  - `GET /whitelist?keyword_id=...`
  - `POST /whitelist/add`
  - `POST /whitelist/remove`
- Akses ke domain API yang sudah di-whitelist di `manifest.json` (default: `https://saligia.app/api`).
- Kredensial login disediakan oleh administrator sistem; hubungi admin untuk memperoleh atau mereset data masuk Anda.

## Instalasi (Load Unpacked)
1. Clone atau salin repositori ini ke komputer Anda.
2. Buka `chrome://extensions` dan aktifkan **Developer mode**.
3. Klik **Load unpacked** lalu pilih folder proyek ini (`scrapere`).
4. Pastikan ikon ekstensi muncul di toolbar Chrome.

## Konfigurasi
- Ubah konstanta `API_BASE` di `popup.js` bila domain API Anda berbeda.
- Perbarui `manifest.json` bila perlu menambah host permission atau mengubah nama/ikon.
- Untuk mengganti ikon (rocket/petir) atau gaya tampilan, lihat definisi `.visit-link-button` di `popup.css`.

## Cara Menggunakan
1. Login memakai kredensial API yang diberikan admin melalui form di popup.
2. Buka hasil pencarian Google di tab aktif (pastikan URL mengandung `google.com/search`). Mode mobile menghasilkan struktur SERP yang sesuai—gunakan Device Toolbar di DevTools bila perlu.
3. Tekan tombol **Ambil Link**.
   - Ekstensi akan men-scroll dan mengeklik *Hasil penelusuran lainnya* berulang kali sampai seluruh SERP tampil.
   - Setelah halaman berhenti bertambah, seluruh link (main & AMP) akan diekstrak dan ditampilkan sebagai kartu.
4. Gunakan:
   - `+` untuk menambah domain ke whitelist (dengan status bubble yang menampilkan progress/success/info/error).
   - Tombol **Go** (ikon roket/petir) untuk membuka link di tab baru.
   - Field filter untuk mencari string di hasil yang sudah diambil.
5. Klik **Copy untuk Laporan** atau **Copy Link Saja** sesuai kebutuhan eksport.
6. Panel **Lihat Whitelist** menyediakan:
   - Accordion per keyword, lazy load daftar whitelist.
   - Fitur bulk add (paste daftar link) dan cari di whitelist.
   - Tombol hapus untuk menghapus domain dari whitelist (menyegarkan cache otomatis).

## Struktur Proyek
```
scrapere/
├─ manifest.json          # Konfigurasi Manifest V3
├─ popup.html             # UI popup
├─ popup.css              # Gaya popup
├─ popup.js               # Logika autentikasi, scraping, whitelist
├─ api/.htaccess          # Stub (untuk hosting API, opsional)
└─ icons/                 # Ikon ekstensi (16/48/128 px)
```

## Pengembangan & Debugging
- Gunakan **Reload** pada halaman `chrome://extensions` setiap kali mengubah file.
- Buka DevTools pada popup untuk melihat `console.log` atau error API.
- Tambah logging sementara di `popup.js` (mis. `console.debug`) saat menelusuri perilaku scraping; hapus setelah selesai.
- Jika Google mengubah struktur SERP, update selector pada fungsi `scrapeDataOnPage()` (misalnya `.MjjYud`, `.g`, `h3 a`, atau atribut `data-amp`).

## Troubleshooting
- **Tidak bisa login**: pastikan `API_BASE` dapat diakses dari browser dan token tidak kadaluarsa (hapus dari `chrome.storage` via DevTools bila perlu).
- **SERP tidak otomatis scroll**: pastikan tombol memuat lebih banyak benar-benar muncul (tampilan mobile) dan tidak ada extension lain yang memblokir script.
- **Whitelist tidak sinkron**: cek response API `/whitelist` di DevTools; ekstensi menyimpan cache 10 menit—hapus cache dengan klik **Reset Hasil** atau masuk ulang.
- **Ikon tidak muncul**: pastikan file PNG ada di folder `icons/` dan direferensikan di `manifest.json`.

## Lisensi
Belum ditentukan. Tambahkan keterangan lisensi sesuai kebutuhan organisasi Anda.
