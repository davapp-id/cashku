/**
 * KONFIGURASI CashKu (versi jual) — isi SEKALI, lalu push ke GitHub.
 * Petunjuk lengkap: PANDUAN-JUALAN.md bagian D.
 */
self.CASHKU_CONFIG = {
  // Biarkan kosong: setiap keluarga tersambung ke servernya sendiri lewat Kode Aktivasi
  GAS_URL: '',

  // URL /exec server Penjual (PANDUAN bagian B langkah 6)
  PENJUAL_URL: 'https://script.google.com/macros/s/AKfycbwaLhcz99HPeIDkmDPDHFUx6mQXqUOtiE-StQQG3Z9UxisLCrynU-ZzCe-h0zCVOInFLw/exec',

  // Client ID dari Google Cloud (PANDUAN bagian C langkah 5), berakhiran .apps.googleusercontent.com
  GOOGLE_CLIENT_ID: '70720989382-oku3fnbo7srb8n1r0ped7cp9r8ob2232.apps.googleusercontent.com',

  // Link unduh APK terbaru — ganti NAMAPENGGUNA dengan username GitHub baru Bapak
  APK_URL: 'https://github.com/davapp-id/cashku/releases/latest/download/CashKu.apk',

  // Kontak bantuan untuk pembeli (WhatsApp format 62…, tanpa tanda +) — boleh dikosongkan
  WA_PENJUAL: '6282213712168',
  // Nama & email penjual yang tampil di halaman Kebijakan Privasi
  NAMA_PENJUAL: 'CashKu',
  EMAIL_PENJUAL: 'davapp0000@gmail.com'
};
