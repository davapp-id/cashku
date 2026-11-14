# Panduan Menyiapkan CashKu untuk Dijual

Panduan ini dikerjakan **sekali saja** di akun Google dan GitHub yang baru. Setelah selesai, setiap ada pembeli Bapak cukup membuat kode dari HP.

Perkiraan waktu: 1–2 jam, sebaiknya di **laptop/komputer**.

---

## Gambaran singkat

| Bagian | Isi | Ada di mana |
|---|---|---|
| **Situs CashKu** | Aplikasi, halaman `pasang.html` (untuk pembeli), `penjual.html` (untuk Bapak), `privasi.html` | GitHub Pages akun baru |
| **Server Penjual** (`Penjual.gs`) | Daftar Kode Aktivasi, status pembeli, alamat server pembeli | Akun Google baru Bapak |
| **Server keluarga** (`Kode.gs`) | Data keuangan setiap keluarga | Akun Google **masing-masing pembeli**, dipasang otomatis |
| **Proyek Google Cloud** | Izin untuk pemasang otomatis | Akun Google baru Bapak |

**Isi paket `cashku-jual-1.0.25.zip`:**
- `situs/` → semua isi repo GitHub baru (aplikasi, halaman jualan, folder `_android`, `.github`). `js/config.js` di dalamnya masih berisi contoh dan diisi di bagian D.
- `server-penjual/Penjual.gs` → untuk bagian B.
- `PANDUAN-JUALAN.md` → panduan ini.

**Yang perlu disiapkan dari sebelumnya:** berkas **RAHASIA-kunci-APK.txt** (kunci tanda tangan APK yang pernah saya berikan). Kunci APK harus tetap sama.

---

## A. Akun baru

### A1. Akun Google
1. Buat Gmail baru, misalnya `cashku.app@gmail.com`.
2. Buka **myaccount.google.com → Keamanan**, aktifkan **Verifikasi 2 Langkah**.
3. Simpan **kode cadangan** di tempat aman. Akun ini akan jadi pusat penjualan, jadi jangan sampai hilang.

### A2. Akun GitHub
1. Daftar di **github.com** memakai email yang sama.
2. Pilih username yang akan muncul di alamat aplikasi, misalnya `cashkuapp`. Alamat situs nanti: `https://cashkuapp.github.io/cashku/`.

> Di panduan ini, **NAMAPENGGUNA** = username GitHub baru Bapak.

---

## B. Server Penjual (Apps Script)

Login ke Chrome dengan **akun Google baru**.

1. Buka **script.google.com**, lalu klik **Proyek baru**. Ganti namanya menjadi `CashKu Penjual`.
2. Hapus isi `Kode.gs` bawaan, lalu tempel seluruh isi **`server-penjual/Penjual.gs`**.
3. Di bagian atas kode, ganti `PASSWORD_AWAL: 'GANTI-sandi-penjual'` dengan password penjual Bapak (minimal 8 karakter). Klik **Simpan** (ikon disket).
4. Di menu fungsi (sebelah tombol Jalankan), pilih **setupPenjual**, lalu klik **Jalankan**.
   - Muncul **Otorisasi diperlukan** → **Tinjau izin** → pilih akun baru.
   - Muncul "Google belum memverifikasi aplikasi ini" → **Lanjutan** → **Buka CashKu Penjual (tidak aman)** → **Izinkan**. Ini wajar, karena ini skrip milik Bapak sendiri.
   - Di **Log eksekusi** muncul "✅ Server Penjual siap" beserta link Google Sheet "Lisensi CashKu".
5. Klik **Terapkan → Deployment baru**, lalu klik ikon gerigi dan pilih **Aplikasi web**:
   - **Jalankan sebagai:** Saya
   - **Yang memiliki akses:** Siapa saja
   - Klik **Terapkan**.
6. Salin **URL aplikasi web** (berakhiran `/exec`). Simpan dulu di Notepad; ini **PENJUAL_URL**.

---

## C. Proyek Google Cloud (untuk pemasang otomatis)

Masih login dengan akun Google baru. Tampilan Google Cloud berbahasa Inggris; nama menunya saya tulis apa adanya.

1. Buka **console.cloud.google.com**, setujui ketentuannya bila diminta, lalu klik **Select a project → New project**. Beri nama `CashKu`, lalu klik **Create**. Pastikan proyek `CashKu` yang terpilih di bagian atas.
2. **Aktifkan Apps Script API:** menu ☰ → **APIs & Services → Library** → cari **Apps Script API** → klik **Enable**.
3. **Layar persetujuan:** menu ☰ → **APIs & Services → OAuth consent screen**. Mungkin namanya *Google Auth Platform*. Klik **Get started**, lalu isi:
   - **App name:** `Pemasang CashKu`
   - **User support email:** email baru Bapak
   - **Audience:** **External**
   - **Contact information:** email baru Bapak
   - Centang persetujuan, lalu klik **Create**.
4. **Lengkapi data aplikasi:**
   - **Branding (wajib, kalau tidak tombol Publish app tidak bisa diklik):**
     - **Application home page:** `https://NAMAPENGGUNA.github.io/cashku/`
     - **Application privacy policy link:** `https://NAMAPENGGUNA.github.io/cashku/privasi.html`
     - **Authorized domains → Add domain:** `NAMAPENGGUNA.github.io`
     - **Developer contact information:** email baru Bapak → **Save**.
     - Situsnya belum perlu ada saat mengisi. Logo boleh dikosongkan.
   - **Data Access → Add or remove scopes:** centang atau tempel tiga cakupan ini, lalu **Update → Save**:
     - `https://www.googleapis.com/auth/script.projects`
     - `https://www.googleapis.com/auth/script.deployments`
     - `https://www.googleapis.com/auth/userinfo.email`
   - **Audience → Publish app → Confirm.** Status harus **In production**.
     - **Penting:** kalau masih *Testing*, hanya akun yang didaftarkan manual yang bisa memasang.
     - Google akan menyebut verifikasi diperlukan. **Abaikan dulu.** Tanpa verifikasi, aplikasi tetap bisa dipakai sampai 100 akun pembeli, dengan layar peringatan.
5. **Buat Client ID:** buka **Clients → Create client**:
   - **Application type:** Web application
   - **Name:** `Pemasang CashKu`
   - **Authorized JavaScript origins → Add URI:** `https://NAMAPENGGUNA.github.io` (tanpa `/cashku` dan tanpa garis miring di akhir)
   - Klik **Create**, lalu salin **Client ID** (berakhiran `.apps.googleusercontent.com`). Ini **GOOGLE_CLIENT_ID**.

---

## D. Situs CashKu di GitHub baru

### D1. Buat repository
Login GitHub akun baru → **New repository** → nama **`cashku`** → **Public** → **Create repository**. Jangan centang README.

### D2. Isi `js/config.js`
Ekstrak ZIP. Buka `situs/js/config.js` dengan Notepad, lalu isi:
- `PENJUAL_URL` ← URL dari B6
- `GOOGLE_CLIENT_ID` ← Client ID dari C5
- `APK_URL` ← ganti `NAMAPENGGUNA` dengan username GitHub baru
- `WA_PENJUAL` ← nomor WhatsApp layanan, misalnya `6281234567890` (boleh dikosongkan)
- `NAMA_PENJUAL`, `EMAIL_PENJUAL` ← tampil di halaman Kebijakan Privasi

`GAS_URL` **biarkan kosong** (`''`).

### D3. Unggah ke GitHub
Buka folder `situs`, klik kanan di ruang kosong, lalu pilih **Open Git Bash here** (atau buka Command Prompt di folder itu). Ketik:

```
git init
git add .
git commit -m "CashKu versi jual"
git branch -M main
git remote add origin https://github.com/NAMAPENGGUNA/cashku.git
git push -u origin main
```

Saat diminta login, pilih **Sign in with your browser** dan masuk dengan **akun GitHub baru**.

> Kalau Windows otomatis memakai akun GitHub lama: buka **Credential Manager → Windows Credentials**, hapus entri `git:https://github.com`, lalu ulangi `git push`.

### D4. Aktifkan GitHub Pages
Repo → **Settings → Pages** → **Source:** Deploy from a branch → **Branch:** `main`, folder **/(root)** → **Save**. Tunggu 1–2 menit, lalu buka `https://NAMAPENGGUNA.github.io/cashku/`. Halaman masuk CashKu harus meminta **Kode Aktivasi**.

### D5. Kunci APK (sama dengan yang lama)
Repo → **Settings → Secrets and variables → Actions → New repository secret**. Buat tiga secret, isinya dari **RAHASIA-kunci-APK.txt**:

| Name | Isi |
|---|---|
| `CASHKU_KUNCI_BASE64` | teks panjang base64 kunci |
| `CASHKU_KUNCI_SANDI` | sandi kunci |
| `CASHKU_KUNCI_ALIAS` | alias kunci |

### D6. Bangun APK
Repo → **Actions** → **Bangun APK CashKu** → **Run workflow**. Tunggu ±10 menit sampai centang hijau. APK muncul di **Releases**, dan link `APK_URL` di config langsung berfungsi.

---

## E. Uji coba: pasang untuk keluarga sendiri

Anggap Bapak pembeli pertama. Dengan begitu Bapak sekaligus menguji alur pembeli.

1. Buka `https://NAMAPENGGUNA.github.io/cashku/penjual.html` → masukkan password penjual (B3) → **Buat kode baru**, misalnya nama "Keluarga Dani".
2. Ketuk **Kirim lewat WhatsApp** dan kirim ke nomor Bapak sendiri. Buka linknya **dari HP**.
3. Ikuti halaman pemasangan. Pakai akun Google yang ingin menyimpan data keluarga; boleh akun pribadi Bapak.
   1. Kode → **Masuk dengan Google**. Bila ada peringatan: **Lanjutan → Buka Pemasang CashKu → Izinkan**.
   2. Nyalakan sakelar **Google Apps Script API** → **Sudah, lanjutkan**.
   3. **Pasang sekarang** → **Izinkan server** (peringatan lagi: Lanjutan → Buka CashKu Server → Izinkan) → kembali ke halaman pemasangan.
   4. Buat akun Admin → **Unduh aplikasi Android** → pasang APK → masukkan kode → masuk.
4. Coba catat "beli roti 15rb". Di `penjual.html`, status pembeli berubah menjadi **Terpasang**.

Data keluarga dimulai dari nol, sesuai keputusan Bapak. APK baru bisa dipasang **di atas** APK lama, karena kuncinya sama. HP akan diminta Kode Aktivasi.

---

## F. Saat ada pembeli

1. Setelah pembeli membayar, buka **penjual.html** di HP → **Buat kode baru** (isi nama dan WA).
2. Ketuk **Kirim lewat WhatsApp**. Pesannya sudah siap: kode, link pemasangan, dan ucapan terima kasih.
3. Pantau **Daftar pembeli**:
   - **Belum dipasang / Terpasang:** status pemasangan.
   - **Izinkan pasang ulang:** kalau pembeli perlu memasang lagi, misalnya ganti akun Google.
   - **Nonaktifkan:** kalau pembayaran batal. Kode tidak bisa dipakai memasang atau menyambungkan HP baru.
   - **Kuota Google:** jumlah akun yang memakai pemasang. Bila sudah lewat 60, ajukan verifikasi Google (bagian I).
4. Kirimkan juga video **Simulasi-Pasang-CashKu.mp4** agar pembeli tahu alurnya.

---

## G. Memperbarui CashKu nanti

- **Tampilan aplikasi:** sama seperti sekarang. Saya kirim ZIP, Bapak push ke repo baru (**jangan timpa `js/config.js`**). Semua HP pembeli ikut terbarui otomatis.
- **Server keluarga (Kode.gs):** ikut ZIP di folder `server/`. Admin setiap keluarga akan melihat **"Versi baru tersedia → Perbarui server"** di **Pengaturan → Server CashKu**. Admin menekannya, masuk Google, lalu server mereka terbarui tanpa mengubah data.
- **Server Penjual:** jarang berubah. Bila ada, cukup ganti kode → Simpan → **Terapkan → Kelola deployment → Edit → Versi baru → Terapkan**.

---

## H. Penting diingat

- **Jangan hapus** akun Google baru, proyek "CashKu Penjual", proyek Google Cloud "CashKu", maupun repo GitHub, selama CashKu masih dijual.
- **Password penjual** hanya untuk Bapak. Bila bocor, ganti di bagian bawah `penjual.html`.
- **Kunci APK** (RAHASIA-kunci-APK.txt) simpan di dua tempat aman. Jangan diunggah ke repo.
- Kode server (`server/Kode.gs`) memang terlihat publik di situs supaya bisa dipasang otomatis. Kode ini tidak berisi rahasia; rahasia setiap keluarga dibuat di server mereka sendiri.
- **Batasan model sekali beli:** menonaktifkan kode hanya mencegah pemasangan dan HP baru tersambung. Server keluarga yang sudah terpasang tetap milik pembeli dan tetap berjalan.

---

## I. Verifikasi Google (nanti, bila pembeli mendekati 100)

1. Google Cloud → **OAuth consent screen / Google Auth Platform → Verification Center → Submit for verification**.
2. Siapkan:
   - halaman utama dan kebijakan privasi yang sudah ada,
   - video demo di YouTube (*tidak publik*) yang memperlihatkan alur pemasangan dan penggunaan izin. Naskahnya akan saya buatkan.
3. Google mungkin meminta **domain milik sendiri**, misalnya `cashku.my.id`, yang diverifikasi di Google Search Console. Kabari saya bila sampai tahap ini.

---

## J. Bila ada masalah

| Masalah | Penyebab & solusi |
|---|---|
| Pemasang: "GOOGLE_CLIENT_ID belum diisi" | Isi `js/config.js` (D2), lalu push lagi |
| Login Google: "Error 400: redirect_uri_mismatch / origin" | Authorized JavaScript origins di C5 harus persis `https://NAMAPENGGUNA.github.io` |
| Login Google: "Access blocked / app in testing" | Status consent screen belum **In production** (C4) |
| "Apps Script API belum diaktifkan di proyek Google Cloud penjual" | Lakukan C2 |
| "Sakelar Google Apps Script API belum menyala" | Pembeli belum menyalakan sakelar. Tunggu 1–2 menit setelah dinyalakan, lalu ulangi |
| Pemasang: "PENJUAL_URL belum diisi" / kode selalu tidak ditemukan | Cek PENJUAL_URL (B6), dan akses deployment server Penjual harus **Siapa saja** |
| Tombol "Unduh aplikasi Android" tidak muncul | `APK_URL` kosong; isi di D2 |
| HP lama minta Kode Aktivasi setelah APK baru dipasang | Wajar: masukkan kode keluarga, lalu masuk |
| Pembeli sudah memasang tapi perlu pasang ulang | `penjual.html` → **Izinkan pasang ulang** |
