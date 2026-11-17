/**
 * ============================================================
 *  CashKu — Backend REST API (Google Apps Script)
 *  Pencatat keuangan keluarga berbasis chat, offline-first.
 *
 *  Arsitektur: frontend di GitHub Pages ↔ fetch(POST text/plain) ↔ doPost (JSON)
 *  Database  : Google Sheets (dibuat otomatis oleh setupAppEnvironment)
 *
 *  LANGKAH PERTAMA:
 *   1. Ubah nilai di SETUP (username & password Admin pertama).
 *   2. Jalankan fungsi setupAppEnvironment() SEKALI.
 *   3. Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 * ============================================================
 */

// ------------------------------------------------------------
// 1. PENGATURAN AWAL — ubah sebelum menjalankan setupAppEnvironment()
// ------------------------------------------------------------
const SETUP = {
  ADMIN_NAMA:     'Ayah',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'cashku123'   // ganti! minimal 6 karakter
};

const APP = {
  NAMA: 'CashKu',
  VERSI: '1.0.33',
  TZ: 'Asia/Makassar',
  TOKEN_HARI: 30,           // masa berlaku sesi
  JENDELA_BULAN: 24,        // transaksi yang disimpan di HP
  MAKS_GAGAL_LOGIN: 5,
  KUNCI_MENIT: 15,
  SLOW_MS: 3000
};

// ID tidak pernah ditulis di kode — semua di Script Properties
const CONFIG = {
  get SPREADSHEET_ID() { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); }
};

const SHEET = {
  config: 'AppConfig', pengguna: 'Pengguna', transaksi: 'Transaksi', kategori: 'Kategori',
  kamus: 'Kamus', usulan: 'Usulan_Kata', dompet: 'Dompet', anggaran: 'Anggaran',
  pengaturan: 'Pengaturan', logSinkron: 'Log_Sinkron', logAktivitas: 'Log_Aktivitas',
  typo: 'Kamus_Typo', aturan: 'Aturan_Parser', ingatan: 'Ingatan', pengingat: 'Pengingat', push: 'Langganan_Push',
  alias: 'Alias_Catatan', logPengaturan: 'Log_Pengaturan', target: 'Target_Tabungan',
  pemicu: 'Pemicu', aturanPn: 'Aturan_Penasihat', tanyaPn: 'Pertanyaan_Penasihat', petaPn: 'Pemetaan_Kategori', profilPn: 'Profil_Penasihat', riwayatPn: 'Riwayat_Penasihat'
};

const KOLOM = {
  Pengguna:   ['id_pengguna', 'username', 'nama_tampilan', 'peran', 'hash_password', 'salt', 'izin_lihat',
               'id_dompet_default', 'warna_avatar', 'mode_tema', 'aktif', 'dibuat_pada', 'terakhir_login',
               'panggilan', 'sapaan', 'hubungan'],
  Transaksi:  ['id_transaksi', 'id_batch', 'waktu_catat', 'tanggal_transaksi', 'id_pengguna', 'jenis', 'nominal',
               'keterangan', 'id_kategori', 'id_dompet', 'id_dompet_tujuan', 'teks_asli', 'sumber', 'status',
               'diubah_oleh', 'diubah_pada', 'versi', 'diterima_server'],
  Kategori:   ['id_kategori', 'nama', 'jenis', 'ikon', 'warna', 'urutan', 'aktif', 'diterima_server'],
  Kamus:      ['id_kamus', 'frasa', 'tipe', 'target', 'sumber', 'ditambah_oleh', 'jumlah_dipakai', 'dibuat_pada',
               'aktif', 'diterima_server'],
  Usulan_Kata:['id_usulan', 'frasa', 'id_kategori_usulan', 'id_pengguna', 'status', 'diputuskan_oleh', 'waktu',
               'diterima_server'],
  Dompet:     ['id_dompet', 'nama', 'tipe', 'pemilik', 'saldo_awal', 'tanggal_saldo_awal', 'ikon', 'alias', 'aktif',
               'diterima_server'],
  Anggaran:   ['id_anggaran', 'lingkup', 'id_pengguna', 'id_kategori', 'periode', 'batas', 'ambang_peringatan',
               'aktif', 'diterima_server'],
  Pengaturan: ['kunci', 'nilai'],
  Log_Sinkron:['op_id', 'id_pengguna', 'jenis_operasi', 'id_data', 'diterima_server', 'hasil'],
  Log_Aktivitas: ['waktu', 'id_pengguna', 'aksi', 'detail'],
  // 1.0.12 — typo, aturan, ingatan data, pengingat & langganan notifikasi
  Kamus_Typo: ['salah', 'benar', 'sumber', 'id_pengguna', 'dipakai', 'dibuat_pada', 'aktif', 'diterima_server'],
  Aturan_Parser: ['kunci', 'nilai', 'keterangan'],
  Ingatan:    ['id_ingatan', 'id_pengguna', 'label', 'nilai', 'lingkup', 'dibuat_pada', 'diubah_pada', 'aktif', 'diterima_server',
               'jenis', 'lembaga', 'pemilik'],
  Pengingat:  ['id_pengingat', 'id_pengguna', 'judul', 'pola', 'tanggal', 'hari_bulan', 'hari_minggu', 'jam', 'berikutnya', 'bunyi_ke',
               'terakhir_bunyi', 'status', 'dibuat_pada', 'diterima_server'],
  Langganan_Push: ['id_langganan', 'id_pengguna', 'endpoint', 'p256dh', 'auth', 'perangkat', 'aktif', 'dibuat_pada', 'terakhir_kirim'],
  // 1.0.13 — singkatan catatan (rek = rekening, pln = listrik = token, ...) & catatan perubahan pengaturan
  Alias_Catatan: ['alias', 'kata', 'kelompok', 'keterangan', 'aktif'],
  Log_Pengaturan: ['waktu', 'id_pengguna', 'nama', 'apa', 'detail'],
  // 1.0.14 — target tabungan (dipakai juga oleh Penasihat Keuangan)
  Target_Tabungan: ['id_target', 'nama', 'nominal', 'tenggat', 'id_dompet', 'id_pengguna', 'dibuat_pada', 'diubah_pada', 'aktif', 'diterima_server'],
  // 1.0.15 — Penasihat Keuangan
  Pemicu: ['frasa', 'fitur', 'sumber', 'id_pengguna', 'aktif', 'dibuat_pada'],
  Aturan_Penasihat: ['kunci', 'nilai', 'keterangan'],
  Pertanyaan_Penasihat: ['kunci', 'urutan', 'teks', 'keterangan', 'pilihan', 'aktif'],
  Pemetaan_Kategori: ['id_kategori', 'nama_kategori', 'kelompok', 'diubah_pada'],
  Profil_Penasihat: ['id_profil', 'pendapatan', 'tanggungan', 'cicilan', 'dana_darurat', 'tujuan', 'ekstra_tabungan', 'lain', 'rencana_tertunda', 'berlaku_mulai', 'diubah_oleh', 'diubah_pada'],
  Riwayat_Penasihat: ['id_riwayat', 'waktu', 'id_pengguna', 'sumber', 'status', 'pendapatan', 'kebutuhan', 'keinginan', 'tabungan', 'rincian', 'profil', 'diterima_server']
};
// Format kolom angka (selain itu teks, agar nomor seperti 0812... tidak kehilangan angka 0)
const KOLOM_ANGKA = { Transaksi: ['nominal', 'versi', 'diterima_server'], Dompet: ['saldo_awal', 'diterima_server'],
  Anggaran: ['batas', 'ambang_peringatan', 'diterima_server'], Kategori: ['urutan', 'diterima_server'],
  Kamus: ['jumlah_dipakai', 'diterima_server'], Usulan_Kata: ['diterima_server'], Log_Sinkron: ['diterima_server'],
  Kamus_Typo: ['dipakai', 'diterima_server'], Ingatan: ['diterima_server'], Target_Tabungan: ['nominal', 'diterima_server'], Profil_Penasihat: ['pendapatan', 'tanggungan', 'cicilan', 'ekstra_tabungan'],
  Riwayat_Penasihat: ['pendapatan', 'kebutuhan', 'keinginan', 'tabungan', 'diterima_server'], Pertanyaan_Penasihat: ['urutan'], Pengingat: ['berikutnya', 'bunyi_ke', 'terakhir_bunyi', 'diterima_server'] };

// ------------------------------------------------------------
// 2. ENTRY POINTS
// ------------------------------------------------------------
function doGet(e) {
  // ?izin=1 → halaman ramah setelah pemilik server memberi izin (dibuka dari halaman pemasang)
  if (e && e.parameter && e.parameter.izin) {
    const balik = modeJual_() && PASANG.PEMASANG ? PASANG.PEMASANG + '?lanjut=1' : '';
    return HtmlService.createHtmlOutput('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<div style="font-family:system-ui,sans-serif;max-width:420px;margin:48px auto;padding:0 20px;text-align:center;color:#10201B">' +
      '<div style="font-size:56px">✅</div><h2 style="margin:12px 0 6px">Server CashKu sudah diizinkan</h2>' +
      '<p style="color:#4E5A55;line-height:1.5">Silakan kembali ke halaman pemasangan untuk membuat akun Admin.</p>' +
      (balik ? '<p><a href="' + balik + '" target="_top" style="display:inline-block;margin-top:10px;padding:13px 22px;border-radius:24px;background:#1FA855;color:#fff;font-weight:700;text-decoration:none">Kembali ke pemasangan</a></p>' : '') +
      '</div>').setTitle('Server CashKu');
  }
  // Dipakai untuk "pemanasan" server (warm-up) dan cek cepat dari browser.
  return json_({ success: true, app: APP.NAMA, versi: APP.VERSI, ping: Date.now() });
}

/** Mode jual: server dibuat otomatis oleh halaman pemasang, yang menyertakan berkas Pasang.gs (const PASANG). */
function modeJual_() { return typeof PASANG !== 'undefined' && PASANG && PASANG.TOKEN; }

function doPost(e) {
  const t0 = Date.now();
  let body = {}, res;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = dispatch_(body);
  } catch (err) {
    res = fail_(err && err.message ? err.message : String(err));
  }
  res.ms = Date.now() - t0;
  if (res.ms > APP.SLOW_MS) {
    try { appendRows_(SHEET.logAktivitas, [[iso_(new Date()), 'SYSTEM', 'SLOW', (body.action || '') + ' ' + res.ms + 'ms']]); } catch (x) {}
  }
  return json_(res);
}

// ------------------------------------------------------------
// 3. ROUTER — auth: false | 'USER' | 'ADMIN'; write: pakai lock + idempotensi
// ------------------------------------------------------------
const ROUTES = {
  ping:            { auth: false,  fn: function () { return ok_({ pong: Date.now() }); } },
  login:           { auth: false,  fn: apiLogin_ },
  bootstrap:       { auth: 'USER', fn: apiBootstrap_ },
  sinkronKirim:    { auth: 'USER', fn: apiSinkronKirim_, write: true },
  sinkronTarik:    { auth: 'USER', fn: apiSinkronTarik_ },
  laporanData:     { auth: 'USER', fn: apiLaporanData_ },
  gantiPassword:   { auth: 'USER', fn: apiGantiPassword_, write: true },
  profilSimpan:    { auth: 'USER', fn: apiProfilSimpan_, write: true },
  penggunaSimpan:  { auth: 'ADMIN', fn: apiPenggunaSimpan_, write: true },
  penggunaReset:   { auth: 'ADMIN', fn: apiPenggunaReset_, write: true },
  dompetSimpan:    { auth: 'ADMIN', fn: apiDompetSimpan_, write: true },
  dompetHapus:     { auth: 'ADMIN', fn: apiDompetHapus_, write: true },
  pengaturanSimpan:{ auth: 'ADMIN', fn: apiPengaturanSimpan_, write: true },
  modeSaldo:       { auth: 'ADMIN', fn: apiModeSaldo_, write: true },
  dompetAnggota:   { auth: 'ADMIN', fn: apiDompetAnggota_, write: true },
  pushKunci:       { auth: 'USER', fn: apiPushKunci_ },
  pushDaftar:      { auth: 'USER', fn: apiPushDaftar_, write: true },
  pushUji:         { auth: 'USER', fn: apiPushUji_, write: true },
  pengingatBunyi:  { auth: 'USER', fn: apiPengingatBunyi_ },
  resetCashku:     { auth: 'ADMIN', fn: apiResetCashku_, write: true },
  // Pemasang otomatis (mode jual): boleh dipanggil sebelum database ada
  infoServer:      { auth: false, tanpaSetup: true, fn: apiInfoServer_ },
  pasangAwal:      { auth: false, tanpaSetup: true, fn: apiPasangAwal_ }
};

function dispatch_(body) {
  const r = ROUTES[body.action];
  if (!r) return fail_('Aksi tidak dikenal: ' + body.action);
  if (r.tanpaSetup) return r.fn({ now: Date.now() }, body.data || {});
  if (!CONFIG.SPREADSHEET_ID) return fail_('Server belum di-setup. Jalankan setupAppEnvironment() dulu.', { code: 'NOT_SETUP' });

  if (body.action === 'login' || body.action === 'bootstrap' || body.action === 'sinkronTarik') pastikanMigrasi_();
  const ctx = { now: Date.now(), reqId: String(body.reqId || ''), user: null };
  if (r.auth) {
    const sesi = verifyToken_(body.token);
    const u = sesi && usersMap_()[sesi.u];
    if (!u || !truthy_(u.aktif)) return fail_('Sesi berakhir. Silakan masuk lagi.', { code: 'AUTH' });
    if (r.auth === 'ADMIN' && u.peran !== 'ADMIN') return fail_('Hanya Admin yang boleh melakukan ini.', { code: 'FORBIDDEN' });
    ctx.user = u;
  }
  const data = body.data || {};
  if (!r.write) return r.fn(ctx, data);

  return withLock_(function () {
    const c = CacheService.getScriptCache(), k = ctx.reqId && ('idem_' + ctx.reqId);
    const hit = k && c.get(k);
    if (hit) return JSON.parse(hit);                  // permintaan ulang → hasil sama (aman di-retry)
    const out = r.fn(ctx, data);
    if (k && out.success) {
      const s = JSON.stringify(out);
      if (s.length < 90000) c.put(k, s, 21600);
    }
    return out;
  });
}

// ------------------------------------------------------------
// 4. AUTH — password hash + token HMAC tanpa penyimpanan sesi
// ------------------------------------------------------------
function apiLogin_(ctx, d) {
  const username = String(d.username || '').trim().toLowerCase();
  const password = String(d.password || '');
  if (!username || !password) return fail_('Username dan password wajib diisi.');

  const cache = CacheService.getScriptCache(), kunciGagal = 'gagal_' + username;
  const gagal = Number(cache.get(kunciGagal) || 0);
  if (gagal >= APP.MAKS_GAGAL_LOGIN) {
    return fail_('Terlalu banyak percobaan. Coba lagi dalam ' + APP.KUNCI_MENIT + ' menit.', { code: 'LOCKED' });
  }

  const t = readTable_(SHEET.pengguna);
  const idx = t.rows.findIndex(function (r) { return String(r[t.col.username]).toLowerCase() === username; });
  const row = idx > -1 ? t.rows[idx] : null;
  if (!row || hash_(row[t.col.salt], password) !== row[t.col.hash_password]) {
    cache.put(kunciGagal, String(gagal + 1), APP.KUNCI_MENIT * 60);
    return fail_('Username atau password salah.', { code: 'WRONG' });
  }
  if (!truthy_(row[t.col.aktif])) return fail_('Akun ini sedang dinonaktifkan Admin.', { code: 'INACTIVE' });
  cache.remove(kunciGagal);

  const id = row[t.col.id_pengguna];
  // Tulis jam login terakhir hanya bila > 6 jam (jalur login tetap cepat)
  const last = new Date(row[t.col.terakhir_login] || 0).getTime() || 0;
  if (ctx.now - last > 6 * 3600e3) {
    try { getSheet_(SHEET.pengguna).getRange(idx + 2, t.col.terakhir_login + 1).setValue(iso_(new Date())); } catch (x) {}
  }

  const token = signToken_({ u: id, i: ctx.now, x: ctx.now + APP.TOKEN_HARI * 864e5 });
  const user = usersMap_()[id];
  return ok_({ token: token, boot: buildBootstrap_(user, ctx.now) });   // 1 panggilan: login + data layar pertama
}

function apiBootstrap_(ctx) { return ok_(buildBootstrap_(ctx.user, ctx.now)); }

function apiGantiPassword_(ctx, d) {
  const baru = String(d.baru || '');
  if (baru.length < 6) return fail_('Password baru minimal 6 karakter.');
  const t = readTable_(SHEET.pengguna);
  const i = t.rows.findIndex(function (r) { return r[t.col.id_pengguna] === ctx.user.id; });
  if (i < 0) return fail_('Akun tidak ditemukan.');
  if (hash_(t.rows[i][t.col.salt], String(d.lama || '')) !== t.rows[i][t.col.hash_password]) return fail_('Password lama salah.');
  const salt = Utilities.getUuid();
  const sh = getSheet_(SHEET.pengguna);
  sh.getRange(i + 2, t.col.hash_password + 1, 1, 2).setValues([[hash_(salt, baru), salt]]);
  return ok_({ pesan: 'Password berhasil diganti.' });
}

// ------------------------------------------------------------
// 1.0.20 — RESET CASHKU (khusus Admin, wajib password Admin)
// Dihapus : transaksi (riwayat & saldo), pengingat, anggaran, catatan yang diingat, target tabungan,
//           profil & riwayat Penasihat, log sinkron/aktivitas. Saldo awal semua dompet → 0.
// Tetap   : akun anggota, kategori, kamus kata, dompet (namanya), pengaturan, aturan & pertanyaan penasihat.
// ------------------------------------------------------------
function resetKe_() { return PropertiesService.getScriptProperties().getProperty('RESET_EPOCH') || ''; }

function apiResetCashku_(ctx, d) {
  const cache = CacheService.getScriptCache(), kunciGagal = 'reset_gagal_' + ctx.user.id;
  const gagal = Number(cache.get(kunciGagal) || 0);
  if (gagal >= 5) return fail_('Terlalu banyak percobaan password salah. Coba lagi 15 menit lagi.', { code: 'TERKUNCI' });
  const pt = readTable_(SHEET.pengguna);
  const row = pt.rows.find(function (r) { return r[pt.col.id_pengguna] === ctx.user.id; });
  if (!row || hash_(row[pt.col.salt], String(d.password || '')) !== row[pt.col.hash_password]) {
    cache.put(kunciGagal, String(gagal + 1), 900);
    return fail_('Password Admin salah.', { code: 'PASSWORD' });
  }
  cache.remove(kunciGagal);
  const hasil = resetData_(ctx.user, ctx.now, !!d.cadangan);
  return ok_(hasil);
}

function resetData_(user, now, cadangan) {
  let urlCadangan = '';
  if (cadangan) {
    const f = DriveApp.getFileById(CONFIG.SPREADSHEET_ID);
    const it = f.getParents();
    const nama = 'Cadangan CashKu ' + Utilities.formatDate(new Date(now), APP.TZ || Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
    const salinan = it.hasNext() ? f.makeCopy(nama, it.next()) : f.makeCopy(nama);
    urlCadangan = salinan.getUrl();
  }
  [SHEET.transaksi, SHEET.pengingat, SHEET.anggaran, SHEET.ingatan, SHEET.target, SHEET.profilPn, SHEET.riwayatPn,
    SHEET.logSinkron, SHEET.logAktivitas].forEach(kosongkanSheet_);
  // Saldo awal semua dompet jadi 0 per hari ini (dompetnya tetap ada)
  const dt = readTable_(SHEET.dompet);
  if (dt.rows.length) {
    const hari = tglStr_(new Date(now));
    const sh = getSheet_(SHEET.dompet);
    const nilai = dt.rows.map(function () { return [0, hari]; });
    sh.getRange(2, dt.col.saldo_awal + 1, nilai.length, 1).setValues(nilai.map(function (x) { return [x[0]]; }));
    sh.getRange(2, dt.col.tanggal_saldo_awal + 1, nilai.length, 1).setValues(nilai.map(function (x) { return [x[1]]; }));
  }
  Object.keys(_TBL).forEach(function (k) { delete _TBL[k]; });
  const props = PropertiesService.getScriptProperties();
  const epoch = String(now);
  props.setProperty('RESET_EPOCH', epoch);
  props.setProperty('LAST_TX', String(now));
  bumpMaster_();
  try { logAturLangsung_(user, 'RESET', 'Reset CashKu: riwayat, saldo, pengingat, anggaran, catatan, target & penasihat dikosongkan' + (urlCadangan ? ' (cadangan dibuat)' : '')); } catch (e) { /* log tidak wajib */ }
  return { resetKe: epoch, cadangan: urlCadangan, serverNow: now };
}

/** Hapus semua baris data (header tetap) */
function kosongkanSheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) return;
  const last = sh.getLastRow();
  if (last <= 1) return;
  if (last > 2) sh.deleteRows(3, last - 2);
  sh.getRange(2, 1, 1, Math.max(1, sh.getLastColumn())).clearContent();
  delete _TBL[name];
}

function hash_(salt, pw) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(pw), Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 0xff).toString(16)).slice(-2); }).join('');
}

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_SECRET', s); }
  return s;
}
function sign_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret_())).replace(/=+$/, ''); }
function signToken_(p) {
  const body = Utilities.base64EncodeWebSafe(JSON.stringify(p)).replace(/=+$/, '');
  return body + '.' + sign_(body);
}
function verifyToken_(t) {
  try {
    const parts = String(t || '').split('.');
    if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) return null;
    let b = parts[0]; while (b.length % 4) b += '=';
    const p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString());
    if (!p.x || p.x < Date.now()) return null;
    const c = CacheService.getScriptCache();
    const rev = Number(c.get('rev_' + p.u) || PropertiesService.getScriptProperties().getProperty('REV_' + p.u) || 0);
    if (p.i < rev) return null;                      // dicabut (reset password / nonaktif)
    return p;
  } catch (e) { return null; }
}
function revokeAll_(id) {
  const t = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('REV_' + id, t);
  CacheService.getScriptCache().put('rev_' + id, t, 21600);
}

// ------------------------------------------------------------
// 5. BOOTSTRAP & MASTER DATA
// ------------------------------------------------------------
function buildBootstrap_(user, now) {
  const mulai = awalJendela_(now);
  const t = readTable_(SHEET.transaksi);
  const master = buildMaster_(user);
  const basis = {};
  const dompetById = {};
  master.dompetSemua.forEach(function (d) { dompetById[d.id_dompet] = d; basis[d.id_dompet] = 0; });

  const tx = [];
  t.rows.forEach(function (r) {
    const o = rowToTx_(t, r);
    if (o.status === 'DIHAPUS') return;
    if (o.tanggal_transaksi < mulai) {
      // Saldo sebelum jendela dihitung di server agar saldo di HP tetap benar
      if (o.status === 'AKTIF') tambahBasis_(basis, dompetById, o);
      return;
    }
    if (bolehLihat_(user, o)) tx.push(o);
  });
  delete master.dompetSemua;
  return {
    serverNow: now, verMaster: verMaster_(), jendelaMulai: mulai, resetKe: resetKe_(),
    saya: profilPublik_(user, true), master: master, tx: tx, basisSaldo: basis
  };
}

function tambahBasis_(basis, dompetById, o) {
  const n = Number(o.nominal) || 0;
  function geser(id, delta, tanggal) {
    const d = dompetById[id];
    if (!d) return;
    if (d.tanggal_saldo_awal && tanggal < d.tanggal_saldo_awal) return;
    basis[id] = (basis[id] || 0) + delta;
  }
  if (o.jenis === 'MASUK') geser(o.id_dompet, n, o.tanggal_transaksi);
  else if (o.jenis === 'KELUAR') geser(o.id_dompet, -n, o.tanggal_transaksi);
  else if (o.jenis === 'PINDAH') { geser(o.id_dompet, -n, o.tanggal_transaksi); geser(o.id_dompet_tujuan, n, o.tanggal_transaksi); }
  else if (o.jenis === 'SALDO') geser(o.id_dompet, n, o.tanggal_transaksi);
}

/** Master data lengkap di-cache per versi, lalu disaring per pengguna. */
function buildMaster_(user) {
  const ver = verMaster_();
  const base = cached_('master_' + ver, 3600, function () {
    return {
      kategori: tableObjects_(SHEET.kategori).map(function (k) { k.urutan = Number(k.urutan) || 0; k.aktif = truthy_(k.aktif); return k; }),
      kamus: tableObjects_(SHEET.kamus).filter(function (k) { return truthy_(k.aktif); })
        .map(function (k) { return { id_kamus: k.id_kamus, frasa: k.frasa, tipe: k.tipe, target: k.target, sumber: k.sumber }; }),
      dompet: tableObjects_(SHEET.dompet).map(function (d) {
        d.saldo_awal = Number(d.saldo_awal) || 0; if (dompetDihapus_(d.aktif)) d.dihapus = true; d.aktif = truthy_(d.aktif); d.tanggal_saldo_awal = tgl_(d.tanggal_saldo_awal); return d;
      }),
      anggaran: tableObjects_(SHEET.anggaran).map(function (a) {
        a.batas = Number(a.batas) || 0; a.ambang_peringatan = Number(a.ambang_peringatan) || 80; a.aktif = truthy_(a.aktif); return a;
      }),
      usulan: tableObjects_(SHEET.usulan),
      pengaturan: pengaturanMap_(),
      typo: amanTabel_(SHEET.typo).filter(function (x) { return truthy_(x.aktif); }).map(function (x) { return { salah: String(x.salah), benar: String(x.benar) }; }),
      aturan: aturanMap_(),
      ingatan: amanTabel_(SHEET.ingatan).filter(function (x) { return truthy_(x.aktif); }).map(function (x) {
        return { id_ingatan: x.id_ingatan, id_pengguna: x.id_pengguna, label: String(x.label), nilai: String(x.nilai), lingkup: x.lingkup || 'PRIBADI', diubah_pada: x.diubah_pada };
      }),
      penasihat: masterPenasihat_(),
      target: amanTabel_(SHEET.target).filter(function (x) { return truthy_(x.aktif); }).map(function (x) {
        return { id_target: x.id_target, nama: String(x.nama), nominal: Number(x.nominal) || 0, tenggat: tgl_(x.tenggat) || String(x.tenggat || ''), id_dompet: x.id_dompet || '', aktif: true };
      }),
      alias: amanTabel_(SHEET.alias).filter(function (x) { return x.alias && x.kata && String(x.aktif) !== 'false' && x.aktif !== false; }).map(function (x) {
        return { alias: String(x.alias).trim().toLowerCase(), kata: String(x.kata).trim().toLowerCase(), kelompok: String(x.kelompok || '').trim().toUpperCase() };
      }),
      pengingat: amanTabel_(SHEET.pengingat).filter(function (x) { return x.status !== 'DIHAPUS'; }).map(function (x) {
        return { id_pengingat: x.id_pengingat, id_pengguna: x.id_pengguna, judul: String(x.judul), pola: x.pola, tanggal: String(x.tanggal || ''), hari_bulan: String(x.hari_bulan || ''),
          hari_minggu: String(x.hari_minggu || ''), jam: String(x.jam || ''), berikutnya: Number(x.berikutnya) || 0, status: x.status };
      })
    };
  });
  const users = usersMap_();
  const sendiri = user.peran === 'ANAK' && user.izin_lihat !== 'SEMUA';
  const m = {
    kategori: base.kategori,
    kamus: base.kamus,
    dompetSemua: base.dompet,
    dompet: base.dompet.filter(function (d) { return !sendiri || !d.pemilik || d.pemilik === user.id; }),
    anggaran: base.anggaran.filter(function (a) { return !sendiri || (a.lingkup === 'PERORANG' && a.id_pengguna === user.id); }),
    usulan: base.usulan.filter(function (u) {
      if (user.peran === 'ANAK') return u.id_pengguna === user.id;
      return u.status === 'MENUNGGU';
    }),
    pengaturan: base.pengaturan,
    typo: base.typo || [],
    aturan: base.aturan || {},
    ingatan: (base.ingatan || []).filter(function (x) { return x.id_pengguna === user.id || x.lingkup === 'KELUARGA'; }),
    alias: base.alias || [],
    target: base.target || [],
    penasihat: base.penasihat || {},
    pengingat: (base.pengingat || []).filter(function (x) { return x.id_pengguna === user.id; }),
    anggota: Object.keys(users).map(function (id) { return profilPublik_(users[id], user.peran === 'ADMIN' || id === user.id); })
  };
  return m;
}

function profilPublik_(u, lengkap) {
  const p = { id: u.id, nama: u.nama_tampilan, peran: u.peran, warna: u.warna_avatar, aktif: truthy_(u.aktif),
    panggilan: String(u.panggilan || ''), sapaan: String(u.sapaan || ''), hubungan: String(u.hubungan || '') };
  if (lengkap) {
    p.username = u.username; p.izin_lihat = u.izin_lihat || 'SEMUA';
    p.id_dompet_default = u.id_dompet_default; p.mode_tema = u.mode_tema || 'OTOMATIS';
  }
  return p;
}

function usersMap_() {
  return cached_('users_' + verMaster_(), 3600, function () {
    const map = {};
    tableObjects_(SHEET.pengguna).forEach(function (u) {
      map[u.id_pengguna] = {
        id: u.id_pengguna, username: u.username, nama_tampilan: u.nama_tampilan, peran: u.peran,
        izin_lihat: u.izin_lihat || 'SEMUA', id_dompet_default: u.id_dompet_default, warna_avatar: u.warna_avatar,
        mode_tema: u.mode_tema, aktif: truthy_(u.aktif), panggilan: u.panggilan || '', sapaan: u.sapaan || '', hubungan: u.hubungan || ''
      };
    });
    return map;
  });
}

function bolehLihat_(user, tx) {
  if (user.peran !== 'ANAK' || user.izin_lihat === 'SEMUA') return true;
  if (tx.id_pengguna === user.id) return true;
  // 1.0.29: kiriman dari/ke dompet miliknya sendiri (mode saldo masing-masing) tetap terlihat agar saldonya benar
  const pm = pemilikDompet_();
  return (!!tx.id_dompet && pm[tx.id_dompet] === user.id) || (!!tx.id_dompet_tujuan && pm[tx.id_dompet_tujuan] === user.id);
}
function pemilikDompet_() {
  const m = {};
  tableObjects_(SHEET.dompet).forEach(function (d) { if (d.pemilik) m[d.id_dompet] = String(d.pemilik); });
  return m;
}

// ------------------------------------------------------------
// 6. SINKRON — kirim (push) operasi antrean dari HP
// ------------------------------------------------------------
function apiSinkronKirim_(ctx, d) {
  // 1.0.20: setelah "Reset CashKu", antrean lama dari HP yang belum tahu reset ditolak (data lama tidak muncul lagi)
  const rk = resetKe_();
  if (rk && d.resetKe !== undefined && String(d.resetKe || '') !== rk) return fail_('CashKu sudah direset oleh Admin.', { code: 'RESET', resetKe: rk });
  const ops = (d.ops || []).slice(0, 100);
  const user = ctx.user, now = ctx.now;
  const cache = CacheService.getScriptCache();
  const sudah = ops.length ? cache.getAll(ops.map(function (o) { return 'op_' + o.op_id; })) : {};
  const hasil = [], logRows = [], aktivitas = [], logAtur = [];
  let txBerubah = false, masterBerubah = false;

  // Data dimuat malas (lazy) supaya operasi kecil tetap cepat
  let txIdx = null, kamusT = null, katT = null, angT = null, usulT = null, typoT = null, ingT = null, pgnT = null, pgT = null, tgtT = null;
  const txBaru = [], txUbah = {};

  ops.forEach(function (op) {
    let r;
    try {
      if (sudah['op_' + op.op_id]) r = { hasil: 'DUPLIKAT' };
      else switch (op.type) {
        case 'tx.put':
          if (!txIdx) txIdx = indexTransaksi_();
          r = opTxPut_(user, op, txIdx, txBaru, txUbah, now);
          if (r.hasil === 'OK') txBerubah = true;
          break;
        case 'kamus.put':
        case 'kamus.del':
          if (!bolehKelola_(user)) { r = { hasil: 'DITOLAK', pesan: 'Akun Anak tidak boleh mengubah kamus.' }; break; }
          if (!kamusT) kamusT = readTable_(SHEET.kamus);
          r = opKamus_(user, op, kamusT, now); masterBerubah = true;
          break;
        case 'usulan.put':
          if (!usulT) usulT = readTable_(SHEET.usulan);
          r = opUsulanPut_(user, op, usulT, now); masterBerubah = true;
          break;
        case 'usulan.putuskan':
          if (!bolehKelola_(user)) { r = { hasil: 'DITOLAK', pesan: 'Tidak diizinkan.' }; break; }
          if (!usulT) usulT = readTable_(SHEET.usulan);
          if (!kamusT) kamusT = readTable_(SHEET.kamus);
          r = opUsulanPutuskan_(user, op, usulT, kamusT, now); masterBerubah = true;
          break;
        case 'kategori.put':
          if (!bolehKelola_(user)) { r = { hasil: 'DITOLAK', pesan: 'Tidak diizinkan.' }; break; }
          if (!katT) katT = readTable_(SHEET.kategori);
          logAtur.push(catatAtur_(user, 'KATEGORI', katT, 'id_kategori', op.data, function (x, lama) {
            return (lama ? (lama.nama !== x.nama ? 'ganti nama ' + lama.nama + ' → ' + x.nama : 'ubah ' + x.nama) + (truthy_(x.aktif) ? '' : ' (nonaktif)') : 'tambah ' + x.ikon + ' ' + x.nama + ' (' + x.jenis + ')');
          }));
          r = opUpsertSederhana_(katT, 'id_kategori', op.data, now, ['nama', 'jenis', 'ikon', 'warna', 'urutan', 'aktif']);
          masterBerubah = true;
          break;
        case 'anggaran.put':
          if (!bolehKelola_(user)) { r = { hasil: 'DITOLAK', pesan: 'Tidak diizinkan.' }; break; }
          if (!angT) angT = readTable_(SHEET.anggaran);
          logAtur.push(catatAtur_(user, 'ANGGARAN', angT, 'id_anggaran', op.data, function (x, lama) {
            const k = (readTable_(SHEET.kategori).rows.find(function (rr) { return rr[0] === x.id_kategori; }) || [])[1] || (x.id_kategori === 'SEMUA' ? 'Total pengeluaran' : x.id_kategori);
            return k + ' ' + (lama ? rupiah_(lama.batas) + ' → ' : '') + rupiah_(x.batas) + '/' + (x.periode === 'MINGGUAN' ? 'minggu' : 'bulan') + (x.lingkup === 'PERORANG' ? ' (per orang: ' + x.id_pengguna + ')' : '') + (truthy_(x.aktif) ? '' : ' (nonaktif)');
          }));
          r = opUpsertSederhana_(angT, 'id_anggaran', op.data, now,
            ['lingkup', 'id_pengguna', 'id_kategori', 'periode', 'batas', 'ambang_peringatan', 'aktif']);
          masterBerubah = true;
          break;
        case 'typo.put':
          if (!typoT) typoT = readTable_(SHEET.typo);
          r = opTypo_(user, op, typoT, now); masterBerubah = true;
          break;
        case 'ingatan.put':
        case 'ingatan.del':
          if (!ingT) ingT = readTable_(SHEET.ingatan);
          r = opIngatan_(user, op, ingT, now); masterBerubah = true;
          break;
        case 'pengingat.put':
        case 'pengingat.del':
        case 'pengingat.ack':
        case 'pengingat.tunda':
          if (!pgnT) pgnT = readTable_(SHEET.pengingat);
          r = opPengingat_(user, op, pgnT, now); masterBerubah = true;
          PropertiesService.getScriptProperties().setProperty('PENGINGAT_NEXT', '0');   // pemicu alarm menghitung ulang
          break;
        case 'target.put':
          if (user.peran !== 'ADMIN') { r = { hasil: 'DITOLAK', pesan: 'Hanya Admin.' }; break; }
          if (!tgtT) tgtT = readTable_(SHEET.target);
          logAtur.push(catatAtur_(user, 'TARGET', tgtT, 'id_target', op.data, function (x, lama) {
            return (truthy_(x.aktif) ? (lama ? 'ubah ' : 'buat ') : 'hapus ') + x.nama + ' ' + rupiah_(x.nominal) + ' sampai ' + x.tenggat;
          }));
          r = opTarget_(user, op, tgtT, now); masterBerubah = true;
          break;
        case 'penasihat.profil':
          if (user.peran !== 'ADMIN') { r = { hasil: 'DITOLAK', pesan: 'Hanya Admin.' }; break; }
          r = opProfilPn_(user, op.data || {}); masterBerubah = true;
          break;
        case 'penasihat.riwayat':
          r = opRiwayatPn_(user, op.data || {}, now);
          break;
        case 'pemicu.put':
          r = opPemicu_(user, op.data || {}); masterBerubah = true;
          break;
        case 'pemetaan.put':
          if (user.peran !== 'ADMIN') { r = { hasil: 'DITOLAK', pesan: 'Hanya Admin.' }; break; }
          r = opPemetaan_(op.data || {}); masterBerubah = true;
          break;
        case 'profil.put':
          if (!pgT) pgT = readTable_(SHEET.pengguna);
          r = opProfil_(user, op, pgT); masterBerubah = true;
          break;
        case 'log.put':
          aktivitas.push([iso_(new Date()), user.id, String(op.data.aksi || 'INFO').slice(0, 40), String(op.data.detail || '').slice(0, 500)]);
          r = { hasil: 'OK' };
          break;
        default:
          r = { hasil: 'DITOLAK', pesan: 'Jenis operasi tidak dikenal.' };
      }
    } catch (err) {
      r = { hasil: 'DITOLAK', pesan: err.message };
    }
    r.op_id = op.op_id;
    hasil.push(r);
    logRows.push([op.op_id, user.id, op.type, (op.data && (op.data.id_transaksi || op.data.id_kamus || op.data.id_usulan ||
      op.data.id_kategori || op.data.id_anggaran || op.data.id_ingatan || op.data.id_pengingat || op.data.salah)) || '', now, r.hasil]);
    if (r.hasil === 'BENTROK') aktivitas.push([iso_(new Date()), user.id, 'BENTROK', op.type + ' ' + (op.data && op.data.id_transaksi)]);
  });

  // ---- Tulis sekaligus (batch) ----
  if (txBaru.length) appendRows_(SHEET.transaksi, txBaru);
  if (Object.keys(txUbah).length) {
    const sh = getSheet_(SHEET.transaksi);
    Object.keys(txUbah).forEach(function (rowNum) { sh.getRange(Number(rowNum), 1, 1, KOLOM.Transaksi.length).setValues([txUbah[rowNum]]); });
  }
  [kamusT, katT, angT, usulT, typoT, ingT, pgnT, pgT, tgtT].forEach(function (t) { if (t && t.dirty) writeTable_(t); });
  const logAtur2 = logAtur.filter(Boolean);
  if (logAtur2.length) { try { appendRows_(SHEET.logPengaturan, logAtur2); } catch (e) { /* sheet belum ada sebelum migrasi */ } }
  if (logRows.length) appendRows_(SHEET.logSinkron, logRows);
  if (aktivitas.length) appendRows_(SHEET.logAktivitas, aktivitas);

  const props = PropertiesService.getScriptProperties();
  if (txBerubah) props.setProperty('LAST_TX', String(now));
  if (masterBerubah) bumpMaster_();

  const m = {};
  hasil.forEach(function (r) { if (r.hasil === 'OK' || r.hasil === 'DUPLIKAT') m['op_' + r.op_id] = '1'; });
  if (Object.keys(m).length) cache.putAll(m, 21600);

  return ok_({ hasil: hasil, serverNow: now });
}

function bolehKelola_(user) { return user.peran === 'ADMIN' || user.peran === 'DEWASA'; }

function indexTransaksi_() {
  const sh = getSheet_(SHEET.transaksi), last = sh.getLastRow();
  const map = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r, i) { if (r[0]) map[String(r[0])] = i + 2; });
  return { map: map, sh: sh, next: last + 1 };
}

function opTxPut_(user, op, idx, txBaru, txUbah, now) {
  const x = op.data || {};
  const id = String(x.id_transaksi || '');
  if (!/^TRX-/.test(id)) return { hasil: 'DITOLAK', pesan: 'ID transaksi tidak valid.' };
  if (['KELUAR', 'MASUK', 'PINDAH', 'SALDO'].indexOf(x.jenis) < 0) return { hasil: 'DITOLAK', pesan: 'Jenis transaksi tidak valid.' };
  // SALDO = penyesuaian saldo dompet: nominal boleh minus (selisih), tidak dihitung sebagai pemasukan/pengeluaran
  if (x.jenis === 'SALDO' ? !(isFinite(Number(x.nominal)) && Number(x.nominal) !== 0 && x.id_dompet) : !(Number(x.nominal) > 0)) return { hasil: 'DITOLAK', pesan: 'Nominal tidak valid.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.tanggal_transaksi))) return { hasil: 'DITOLAK', pesan: 'Tanggal tidak valid.' };
  if (['AKTIF', 'DIBATALKAN', 'DIHAPUS'].indexOf(x.status) < 0) return { hasil: 'DITOLAK', pesan: 'Status tidak valid.' };

  const rowNum = idx.map[id];
  if (!rowNum) {
    // Transaksi baru: selalu dicatat atas nama pengirim
    if (x.id_pengguna !== user.id) return { hasil: 'DITOLAK', pesan: 'Transaksi baru harus atas nama sendiri.' };
    const row = txToRow_(x, Math.max(1, Number(x.versi) || 1), now);
    txBaru.push(row);
    idx.map[id] = idx.next++;
    return { hasil: 'OK', versi: row[16] };
  }

  // Transaksi lama: ambil versi terbaru (bisa sudah diubah di batch ini)
  const cur = txUbah[rowNum] || (rowNum < idx.next - txBaru.length
    ? idx.sh.getRange(rowNum, 1, 1, KOLOM.Transaksi.length).getValues()[0]
    : txBaru[rowNum - (idx.next - txBaru.length)]);
  const server = rowArrToTx_(cur);
  if (server.id_pengguna !== user.id && user.peran !== 'ADMIN') {
    return { hasil: 'DITOLAK', pesan: 'Hanya pemilik atau Admin yang boleh mengubah transaksi ini.', server: server };
  }
  const base = Number(op.baseVersi) || 0;
  const sv = Number(server.versi) || 1;
  // Kiriman ulang dari operasi yang sudah pernah diterima → bukan bentrok
  if (sv >= (Number(x.versi) || 1) && String(server.diubah_pada) === String(x.diubah_pada)) {
    return { hasil: 'DUPLIKAT', versi: sv };
  }
  if (sv > base) {
    // Bentrok: versi terbaru (waktu ubah) yang dipakai
    const serverLebihBaru = String(server.diubah_pada) >= String(x.diubah_pada);
    if (serverLebihBaru) return { hasil: 'BENTROK', server: server, pesan: 'Diubah oleh ' + namaPengguna_(server.diubah_oleh) };
  }
  if ((server.status === 'DIHAPUS' || server.status === 'DIBATALKAN') && x.status === 'AKTIF' &&
      String(server.diubah_pada) >= String(x.diubah_pada)) {
    return { hasil: 'BENTROK', server: server, pesan: 'Transaksi sudah dibatalkan/dihapus.' };
  }
  x.id_pengguna = server.id_pengguna;                 // pemilik tidak boleh berubah
  x.waktu_catat = server.waktu_catat;
  const row = txToRow_(x, Math.max(sv + 1, Number(x.versi) || 0), now);
  if (rowNum >= idx.next - txBaru.length) txBaru[rowNum - (idx.next - txBaru.length)] = row;
  else txUbah[rowNum] = row;
  return { hasil: 'OK', versi: row[16] };
}

function txToRow_(x, versi, now) {
  return [String(x.id_transaksi), String(x.id_batch || ''), String(x.waktu_catat || iso_(new Date())),
    String(x.tanggal_transaksi), String(x.id_pengguna), x.jenis, Math.round(Number(x.nominal)),
    String(x.keterangan || '').slice(0, 200), String(x.id_kategori || ''), String(x.id_dompet || ''),
    String(x.id_dompet_tujuan || ''), String(x.teks_asli || '').slice(0, 500), String(x.sumber || 'CHAT'), x.status,
    String(x.diubah_oleh || x.id_pengguna), String(x.diubah_pada || iso_(new Date())), versi, now];
}
function rowArrToTx_(r) {
  const o = {};
  KOLOM.Transaksi.forEach(function (k, i) { o[k] = r[i]; });
  return normTx_(o);
}
function rowToTx_(t, r) { return rowArrToTx_(r); }
function normTx_(o) {
  o.nominal = Number(o.nominal) || 0;
  o.versi = Number(o.versi) || 1;
  o.diterima_server = Number(o.diterima_server) || 0;
  o.tanggal_transaksi = tgl_(o.tanggal_transaksi);
  ['waktu_catat', 'diubah_pada'].forEach(function (k) { if (o[k] instanceof Date) o[k] = iso_(o[k]); });
  ['id_transaksi', 'id_batch', 'id_pengguna', 'keterangan', 'id_kategori', 'id_dompet', 'id_dompet_tujuan', 'teks_asli', 'sumber', 'diubah_oleh']
    .forEach(function (k) { o[k] = o[k] == null ? '' : String(o[k]); });
  return o;
}

function opKamus_(user, op, t, now) {
  const x = op.data || {};
  if (op.type === 'kamus.del') {
    const i = t.rows.findIndex(function (r) { return r[t.col.id_kamus] === x.id_kamus; });
    if (i > -1) { t.rows[i][t.col.aktif] = false; t.rows[i][t.col.diterima_server] = now; t.dirty = true; }
    return { hasil: 'OK' };
  }
  const frasa = String(x.frasa || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!frasa || frasa.length > 60) return { hasil: 'DITOLAK', pesan: 'Kata kunci tidak valid.' };
  const tipe = x.tipe || 'KATEGORI';
  // Gabung: frasa + tipe yang sama tidak dibuat ganda
  let i = t.rows.findIndex(function (r) { return r[t.col.id_kamus] === x.id_kamus; });
  if (i < 0) i = t.rows.findIndex(function (r) { return String(r[t.col.frasa]).toLowerCase() === frasa && r[t.col.tipe] === tipe; });
  if (i > -1) {
    const r = t.rows[i];
    r[t.col.frasa] = frasa; r[t.col.target] = String(x.target || ''); r[t.col.aktif] = true; r[t.col.diterima_server] = now;
    if (x.sumber) r[t.col.sumber] = x.sumber;
  } else {
    t.rows.push(objToRow_(t, {
      id_kamus: x.id_kamus || ('KMS-' + now.toString(36) + Math.random().toString(36).slice(2, 6)),
      frasa: frasa, tipe: tipe, target: String(x.target || ''), sumber: x.sumber || 'MANUAL',
      ditambah_oleh: user.id, jumlah_dipakai: 0, dibuat_pada: iso_(new Date()), aktif: true, diterima_server: now
    }));
  }
  t.dirty = true;
  return { hasil: 'OK' };
}

function opUsulanPut_(user, op, t, now) {
  const x = op.data || {};
  if (t.rows.some(function (r) { return r[t.col.id_usulan] === x.id_usulan; })) return { hasil: 'OK' };
  t.rows.push(objToRow_(t, {
    id_usulan: x.id_usulan, frasa: String(x.frasa || '').toLowerCase().slice(0, 60), id_kategori_usulan: x.id_kategori_usulan,
    id_pengguna: user.id, status: 'MENUNGGU', diputuskan_oleh: '', waktu: iso_(new Date()), diterima_server: now
  }));
  t.dirty = true;
  return { hasil: 'OK' };
}

function opUsulanPutuskan_(user, op, t, kamusT, now) {
  const x = op.data || {};
  const i = t.rows.findIndex(function (r) { return r[t.col.id_usulan] === x.id_usulan; });
  if (i < 0) return { hasil: 'DITOLAK', pesan: 'Usulan tidak ditemukan.' };
  const r = t.rows[i];
  if (r[t.col.status] !== 'MENUNGGU') return { hasil: 'OK' };
  r[t.col.status] = x.status === 'DISETUJUI' ? 'DISETUJUI' : 'DITOLAK';
  r[t.col.diputuskan_oleh] = user.id;
  r[t.col.diterima_server] = now;
  t.dirty = true;
  if (r[t.col.status] === 'DISETUJUI') {
    opKamus_(user, { type: 'kamus.put', data: { frasa: r[t.col.frasa], tipe: 'KATEGORI', target: x.id_kategori || r[t.col.id_kategori_usulan], sumber: 'BELAJAR' } }, kamusT, now);
  }
  return { hasil: 'OK' };
}

function opUpsertSederhana_(t, kunci, x, now, kolom) {
  if (!x || !x[kunci]) return { hasil: 'DITOLAK', pesan: 'Data tidak lengkap.' };
  let i = t.rows.findIndex(function (r) { return r[t.col[kunci]] === x[kunci]; });
  if (i < 0) { t.rows.push(objToRow_(t, {})); i = t.rows.length - 1; t.rows[i][t.col[kunci]] = x[kunci]; }
  const r = t.rows[i];
  kolom.forEach(function (k) { if (x[k] !== undefined && t.col[k] !== undefined) r[t.col[k]] = x[k]; });
  r[t.col.diterima_server] = now;
  t.dirty = true;
  return { hasil: 'OK' };
}

// ------------------------------------------------------------
// 7. SINKRON — tarik (pull) perubahan sejak waktu tertentu
// ------------------------------------------------------------
function apiSinkronTarik_(ctx, d) {
  const props = PropertiesService.getScriptProperties();
  const sejak = Number(d.sejak) || 0;
  const lastTx = Number(props.getProperty('LAST_TX') || 0);
  const ver = verMaster_();
  const out = { serverNow: ctx.now, verMaster: ver, tx: [], resetKe: resetKe_() };

  if (lastTx > sejak) {
    // Baca kolom diterima_server saja, lalu ambil blok baris yang berubah
    const sh = getSheet_(SHEET.transaksi), last = sh.getLastRow(), colTs = KOLOM.Transaksi.length;
    if (last > 1) {
      const ts = sh.getRange(2, colTs, last - 1, 1).getValues();
      let min = -1, max = -1;
      for (let i = 0; i < ts.length; i++) {
        if (Number(ts[i][0]) > sejak) { if (min < 0) min = i; max = i; }
      }
      if (min > -1) {
        const blok = sh.getRange(min + 2, 1, max - min + 1, colTs).getValues();
        blok.forEach(function (r) {
          if (Number(r[colTs - 1]) <= sejak) return;
          const o = rowArrToTx_(r);
          if (bolehLihat_(ctx.user, o)) out.tx.push(o);
        });
      }
    }
  }
  if (String(d.verMaster || '') !== ver) {
    const m = buildMaster_(ctx.user);
    delete m.dompetSemua;
    out.master = m;
    out.saya = profilPublik_(ctx.user, true);
  }
  return ok_(out);
}

// ------------------------------------------------------------
// 8. LAPORAN — data periode lama (> 24 bulan); PDF tetap dibuat di HP
// ------------------------------------------------------------
function apiLaporanData_(ctx, d) {
  const mulai = String(d.mulai || ''), sampai = String(d.sampai || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mulai) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) return fail_('Periode tidak valid.');
  const t = readTable_(SHEET.transaksi);
  const tx = [];
  t.rows.forEach(function (r) {
    const o = rowArrToTx_(r);
    if (o.status !== 'AKTIF' || o.tanggal_transaksi < mulai || o.tanggal_transaksi > sampai) return;
    if (bolehLihat_(ctx.user, o)) tx.push(o);
  });
  return ok_({ tx: tx });
}

// ------------------------------------------------------------
// 9. AKSI ONLINE — profil, Admin (anggota, dompet, pengaturan)
// ------------------------------------------------------------
function apiProfilSimpan_(ctx, d) {
  const patch = {};
  if (d.nama_tampilan) patch.nama_tampilan = String(d.nama_tampilan).trim().slice(0, 30);
  if (d.id_dompet_default !== undefined) patch.id_dompet_default = String(d.id_dompet_default || '');
  if (d.mode_tema) patch.mode_tema = String(d.mode_tema);
  updateByKey_(SHEET.pengguna, 'id_pengguna', ctx.user.id, patch);
  bumpMaster_();
  return ok_({ pesan: 'Profil disimpan.' });
}

function apiPenggunaSimpan_(ctx, d) {
  const t = readTable_(SHEET.pengguna);
  const username = String(d.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(username)) return fail_('Username 3–20 karakter: huruf kecil, angka, titik, minus, garis bawah.', { code: 'USERNAME_INVALID' });
  const dup = t.rows.find(function (r) { return String(r[t.col.username]).toLowerCase() === username && r[t.col.id_pengguna] !== d.id; });
  if (dup) return fail_('Username sudah dipakai.', { code: 'USERNAME_DIPAKAI' });
  const peran = ['ADMIN', 'DEWASA', 'ANAK'].indexOf(d.peran) > -1 ? d.peran : 'DEWASA';
  const aktif = d.aktif === undefined ? true : truthy_(d.aktif);

  let i = d.id ? t.rows.findIndex(function (r) { return r[t.col.id_pengguna] === d.id; }) : -1;
  let aksiLog = 'tambah';
  if (i > -1) {
    // Jangan sampai tidak ada Admin aktif
    const lama = t.rows[i];
    const adminAktifLain = t.rows.filter(function (r, j) { return j !== i && r[t.col.peran] === 'ADMIN' && truthy_(r[t.col.aktif]); }).length;
    if (lama[t.col.peran] === 'ADMIN' && (peran !== 'ADMIN' || !aktif) && adminAktifLain === 0) {
      return fail_('Harus ada minimal satu Admin aktif.');
    }
    lama[t.col.username] = username;
    lama[t.col.nama_tampilan] = String(d.nama_tampilan || '').trim().slice(0, 30) || username;
    lama[t.col.peran] = peran;
    lama[t.col.izin_lihat] = peran === 'ANAK' ? (d.izin_lihat === 'SEMUA' ? 'SEMUA' : 'SENDIRI') : 'SEMUA';
    lama[t.col.id_dompet_default] = String(d.id_dompet_default || '');
    if (d.warna_avatar) lama[t.col.warna_avatar] = d.warna_avatar;
    if (d.hubungan !== undefined && t.col.hubungan !== undefined) lama[t.col.hubungan] = hubungan_(d.hubungan);
    aksiLog = !aktif && truthy_(lama[t.col.aktif]) ? 'nonaktifkan' : aktif && !truthy_(lama[t.col.aktif]) ? 'aktifkan' : 'ubah';
    if (!aktif && truthy_(lama[t.col.aktif])) revokeAll_(d.id);
    lama[t.col.aktif] = aktif;
  } else {
    const pw = String(d.password || '');
    if (pw.length < 6) return fail_('Password awal minimal 6 karakter.', { code: 'PASSWORD_PENDEK' });
    const salt = Utilities.getUuid();
    const warna = ['#008069', '#2563EB', '#DB2777', '#F59E0B', '#7C3AED', '#0EA5E9', '#DC2626', '#16A34A'];
    t.rows.push(objToRow_(t, {
      id_pengguna: 'USR-' + Date.now().toString(36).toUpperCase(), username: username,
      nama_tampilan: String(d.nama_tampilan || '').trim().slice(0, 30) || username, peran: peran,
      hash_password: hash_(salt, pw), salt: salt,
      izin_lihat: peran === 'ANAK' ? (d.izin_lihat === 'SEMUA' ? 'SEMUA' : 'SENDIRI') : 'SEMUA',
      id_dompet_default: String(d.id_dompet_default || ''), warna_avatar: d.warna_avatar || warna[t.rows.length % warna.length],
      mode_tema: 'OTOMATIS', aktif: aktif, dibuat_pada: iso_(new Date()), terakhir_login: '', hubungan: hubungan_(d.hubungan)
    }));
  }
  t.dirty = true;
  writeTable_(t);
  // 1.0.32: saldo masing-masing → anggota aktif (baru, diaktifkan lagi, atau diubah) selalu punya set dompetnya
  if (aktif && modeSaldo_() === 'MASING') {
    const uidDompet = aksiLog === 'tambah' ? t.rows[t.rows.length - 1][t.col.id_pengguna] : d.id;
    const td = readTable_(SHEET.dompet);
    if (salinDompetAnggota_(td, [uidDompet])) writeTable_(td);
  }
  bumpMaster_();
  logAturLangsung_(ctx.user, 'AKUN', aksiLog + ' @' + username + ' — ' + (String(d.nama_tampilan || '').trim() || username) + ' (' + peran + (d.hubungan ? ', ' + hubungan_(d.hubungan) : '') + ')');
  return ok_({ pesan: 'Anggota disimpan.' });
}

function apiPenggunaReset_(ctx, d) {
  const pw = String(d.password || '');
  if (pw.length < 6) return fail_('Password minimal 6 karakter.');
  const salt = Utilities.getUuid();
  if (!updateByKey_(SHEET.pengguna, 'id_pengguna', d.id, { hash_password: hash_(salt, pw), salt: salt })) return fail_('Anggota tidak ditemukan.');
  revokeAll_(d.id);
  return ok_({ pesan: 'Password direset. Anggota perlu masuk lagi.' });
}

function apiDompetSimpan_(ctx, d) {
  const t = readTable_(SHEET.dompet);
  const nama = String(d.nama || '').trim().slice(0, 30);
  if (!nama) return fail_('Nama dompet wajib diisi.');
  const tipe = ['TUNAI', 'REKENING', 'EWALLET', 'TABUNGAN'].indexOf(d.tipe) > -1 ? d.tipe : 'TUNAI';
  const obj = {
    id_dompet: d.id_dompet || ('DMP-' + Date.now().toString(36).toUpperCase()), nama: nama, tipe: tipe,
    pemilik: String(d.pemilik || ''), saldo_awal: Math.round(Number(d.saldo_awal) || 0),
    tanggal_saldo_awal: /^\d{4}-\d{2}-\d{2}$/.test(String(d.tanggal_saldo_awal)) ? d.tanggal_saldo_awal : tglStr_(new Date()),
    ikon: d.ikon || ({ TUNAI: '💵', REKENING: '🏦', EWALLET: '📱', TABUNGAN: '💰' })[tipe],
    alias: String(d.alias || '').toLowerCase().slice(0, 300), aktif: d.aktif === undefined ? true : truthy_(d.aktif),
    diterima_server: Date.now()
  };
  const i = t.rows.findIndex(function (r) { return r[t.col.id_dompet] === obj.id_dompet; });
  if (i > -1) t.rows[i] = objToRow_(t, obj); else t.rows.push(objToRow_(t, obj));
  // 1.0.29: dompet keluarga punya salinan per anggota (mode saldo masing-masing) → nama/jenis/ikon/alias/aktif ikut
  if (!obj.pemilik && String(obj.id_dompet).indexOf('~') < 0) {
    t.rows.forEach(function (r) {
      if (String(r[t.col.id_dompet]).split('~')[0] !== obj.id_dompet || String(r[t.col.id_dompet]) === obj.id_dompet) return;
      ['nama', 'tipe', 'ikon', 'alias', 'aktif'].forEach(function (k) { r[t.col[k]] = obj[k]; });
    });
    if (i < 0 && modeSaldo_() === 'MASING') salinDompetAnggota_(t, null, [obj.id_dompet]);
  }
  t.dirty = true;
  writeTable_(t);
  bumpMaster_();
  logAturLangsung_(ctx.user, 'DOMPET', (i > -1 ? 'ubah ' : 'tambah ') + obj.nama + ' (' + tipe + ', saldo awal ' + rupiah_(obj.saldo_awal) + ')' + (truthy_(obj.aktif) ? '' : ' (nonaktif)'));
  return ok_({ pesan: 'Dompet disimpan.', id_dompet: obj.id_dompet });
}

/** 1.0.33: hapus dompet tambahan. Dompet bawaan tidak bisa dihapus (bisa dinonaktifkan).
 *  Belum ada transaksi → dihapus permanen. Sudah ada transaksi → sisa saldo dipindah ke dompet tujuan (transaksi PINDAH),
 *  lalu dompet ditandai DIHAPUS: hilang dari daftar, riwayat transaksi lama tetap bisa dibaca. Salinan per anggota ikut. */
const DOMPET_BAWAAN = ['DMP-TUNAI', 'DMP-BANK', 'DMP-EWALLET', 'DMP-TABUNGAN'];
function dompetDihapus_(v) { return String(v).toUpperCase() === 'DIHAPUS'; }
function apiDompetHapus_(ctx, d) {
  const id = String((d && d.id) || '');
  if (!id || id.indexOf('~') > -1) return fail_('Dompet tidak dikenal.');
  if (DOMPET_BAWAAN.indexOf(id) > -1) return fail_('Dompet bawaan tidak bisa dihapus. Matikan saja tombol Aktif bila tidak dipakai.');
  const td = readTable_(SHEET.dompet);
  const idOf = function (r) { return String(r[td.col.id_dompet]); };
  const utama = td.rows.find(function (r) { return idOf(r) === id; });
  if (!utama || dompetDihapus_(utama[td.col.aktif])) return fail_('Dompet sudah tidak ada.');
  const nama = String(utama[td.col.nama]);
  const grup = td.rows.filter(function (r) { return idOf(r) === id || idOf(r).split('~')[0] === id; }).map(idOf);
  const saldo = saldoServer_();
  const sisa = grup.filter(function (x) { return Math.round(saldo[x] || 0) !== 0; });
  const tt = readTable_(SHEET.transaksi);
  const adaTx = tt.rows.some(function (r) { const o = rowToTx_(tt, r); return o.status === 'AKTIF' && (grup.indexOf(o.id_dompet) > -1 || grup.indexOf(o.id_dompet_tujuan) > -1); });
  const tujuan = String(d.tujuan || '');
  if (sisa.length) {
    const rt = td.rows.find(function (r) { return idOf(r) === tujuan; });
    if (!tujuan || !rt || grup.indexOf(tujuan) > -1 || !truthy_(rt[td.col.aktif])) {
      return fail_('Pilih dompet untuk menampung sisa saldo ' + nama + '.', { code: 'PERLU_TUJUAN', saldo: grup.reduce(function (a, x) { return a + Math.round(saldo[x] || 0); }, 0) });
    }
  }
  const now = Date.now(), hari = tglStr_(new Date()), waktu = iso_(new Date()), batch = 'HAPUS-' + now.toString(36).toUpperCase();
  const uid = ctx.user.id, kode = String(uid).replace(/^USR-/, '');
  const txs = [];
  let n = 0;
  sisa.forEach(function (x) {
    const v = Math.round(saldo[x] || 0);
    const pem = x.indexOf('~') > -1 ? x.split('~')[1] : '';
    const rk = pem ? td.rows.find(function (r) { return idOf(r) === tujuan + '~' + pem && truthy_(r[td.col.aktif]); }) : null;
    const ke = rk ? idOf(rk) : tujuan;
    txs.push(txToRow_({ id_transaksi: 'TRX-' + hari.replace(/-/g, '') + '-' + kode + '-H' + now.toString(36).slice(-4).toUpperCase() + (++n),
      id_batch: batch, waktu_catat: waktu, tanggal_transaksi: hari, id_pengguna: pem || uid, jenis: 'PINDAH', nominal: Math.abs(v), keterangan: 'Sisa saldo ' + nama,
      id_kategori: '', id_dompet: v > 0 ? x : ke, id_dompet_tujuan: v > 0 ? ke : x, teks_asli: '', sumber: 'HAPUS_DOMPET', status: 'AKTIF', diubah_oleh: uid, diubah_pada: waktu }, 1, now));
  });
  const permanen = !adaTx && !txs.length;
  if (permanen) td.rows = td.rows.filter(function (r) { return grup.indexOf(idOf(r)) < 0; });
  else td.rows.forEach(function (r) { if (grup.indexOf(idOf(r)) > -1) { r[td.col.aktif] = 'DIHAPUS'; if (td.col.diterima_server !== undefined) r[td.col.diterima_server] = now; } });
  td.dirty = true;
  writeTable_(td);
  if (txs.length) appendRows_(SHEET.transaksi, txs);
  // dompet default anggota yang dihapus → kembali ke pilihan bawaan
  const tp = readTable_(SHEET.pengguna);
  if (tp.col.id_dompet_default !== undefined) {
    let ub = false;
    tp.rows.forEach(function (r) { if (grup.indexOf(String(r[tp.col.id_dompet_default])) > -1) { r[tp.col.id_dompet_default] = ''; ub = true; } });
    if (ub) { tp.dirty = true; writeTable_(tp); }
  }
  bumpMaster_();
  logAturLangsung_(ctx.user, 'DOMPET', 'hapus ' + nama + (txs.length ? ' (sisa saldo dipindah)' : ''));
  return ok_({ pesan: 'Dompet ' + nama + ' dihapus.', permanen: permanen, transaksi: txs.length });
}

function apiPengaturanSimpan_(ctx, d) {
  const izin = ['nama_keluarga', 'fitur_dompet', 'warna_utama', 'konfirmasi_nominal_kecil'];
  const t = readTable_(SHEET.pengaturan);
  izin.forEach(function (k) {
    if (d[k] === undefined) return;
    const i = t.rows.findIndex(function (r) { return r[0] === k; });
    if (i > -1) t.rows[i][1] = String(d[k]); else t.rows.push([k, String(d[k])]);
  });
  t.dirty = true;
  writeTable_(t);
  bumpMaster_();
  return ok_({ pesan: 'Pengaturan disimpan.' });
}

// ------------------------------------------------------------
// 9b. MODE SALDO KELUARGA (1.0.29)
//   BERSAMA  : semua anggota memakai dompet keluarga yang sama (bawaan).
//   MASING   : tiap anggota punya salinan dompet keluarga sendiri (id "<dompet>~<pengguna>").
//   Ganti ke MASING → saldo dompet keluarga dibagi Admin ke anggota (transaksi PINDAH "Pembagian saldo").
//   Ganti ke BERSAMA → saldo semua salinan digabung lagi ke dompet keluarga ("Gabung saldo").
// ------------------------------------------------------------
function modeSaldo_() { return String(pengaturanMap_().mode_saldo || 'BERSAMA').toUpperCase() === 'MASING' ? 'MASING' : 'BERSAMA'; }
/** Buat/aktifkan salinan dompet keluarga untuk anggota. idsOrang/idsDompet null = semua yang aktif. Mengembalikan true bila tabel berubah. */
function salinDompetAnggota_(td, idsOrang, idsDompet) {
  const orang = idsOrang || tableObjects_(SHEET.pengguna).filter(function (u) { return truthy_(u.aktif); }).map(function (u) { return u.id_pengguna; });
  const sumber = td.rows.filter(function (r) {
    const id = String(r[td.col.id_dompet]);
    return id.indexOf('~') < 0 && !r[td.col.pemilik] && truthy_(r[td.col.aktif]) && (!idsDompet || idsDompet.indexOf(id) > -1);
  });
  const ada = {};
  td.rows.forEach(function (r, i) { ada[String(r[td.col.id_dompet])] = i; });
  let ubah = false;
  sumber.forEach(function (r) {
    orang.forEach(function (uid) {
      const id = String(r[td.col.id_dompet]) + '~' + uid;
      if (ada[id] !== undefined) {
        const rr = td.rows[ada[id]];
        if (!truthy_(rr[td.col.aktif])) { rr[td.col.aktif] = true; ubah = true; }
        return;
      }
      td.rows.push(objToRow_(td, { id_dompet: id, nama: r[td.col.nama], tipe: r[td.col.tipe], pemilik: uid, saldo_awal: 0,
        tanggal_saldo_awal: tglStr_(new Date()), ikon: r[td.col.ikon], alias: r[td.col.alias], aktif: true, diterima_server: Date.now() }));
      ubah = true;
    });
  });
  if (ubah) td.dirty = true;
  return ubah;
}
/** Saldo terkini semua dompet menurut server (saldo awal + semua transaksi aktif sejak tanggal saldo awal) */
function saldoServer_() {
  const dompet = tableObjects_(SHEET.dompet), byId = {}, basis = {};
  dompet.forEach(function (d) { d.tanggal_saldo_awal = tgl_(d.tanggal_saldo_awal); byId[d.id_dompet] = d; basis[d.id_dompet] = Number(d.saldo_awal) || 0; });
  const t = readTable_(SHEET.transaksi);
  t.rows.forEach(function (r) { const o = rowToTx_(t, r); if (o.status === 'AKTIF') tambahBasis_(basis, byId, o); });
  return basis;
}
/** 1.0.32: Admin membuatkan set dompet untuk anggota yang belum punya (saldo masing-masing). Aman diulang. */
function apiDompetAnggota_(ctx, d) {
  if (modeSaldo_() !== 'MASING') return fail_('Dompet anggota hanya dipakai pada saldo masing-masing.');
  const aktifIds = tableObjects_(SHEET.pengguna).filter(function (u) { return truthy_(u.aktif); }).map(function (u) { return u.id_pengguna; });
  const ids = d && d.id ? [String(d.id)] : aktifIds;
  if (d && d.id && aktifIds.indexOf(String(d.id)) < 0) return fail_('Anggota tidak ditemukan atau nonaktif.');
  const td = readTable_(SHEET.dompet);
  const dibuat = salinDompetAnggota_(td, ids);
  if (dibuat) { writeTable_(td); bumpMaster_(); }
  return ok_({ dibuat: dibuat });
}
function apiModeSaldo_(ctx, d) {
  const mode = String(d.mode || '').toUpperCase();
  if (mode !== 'MASING' && mode !== 'BERSAMA') return fail_('Mode saldo tidak dikenal.');
  if (mode === modeSaldo_()) return fail_(mode === 'MASING' ? 'Saldo sudah masing-masing.' : 'Saldo sudah bersama.');
  const td = readTable_(SHEET.dompet);
  const now = Date.now(), hari = tglStr_(new Date()), waktu = iso_(new Date()), batch = 'MODE-' + now.toString(36).toUpperCase();
  const uid = ctx.user.id, kode = String(uid).replace(/^USR-/, '');
  const txs = [];
  let n = 0;
  const pindah = function (dari, ke, nominal, ket) {
    const v = Math.round(Number(nominal) || 0);
    if (!v) return;
    const a = v > 0 ? dari : ke, b = v > 0 ? ke : dari;
    txs.push(txToRow_({ id_transaksi: 'TRX-' + hari.replace(/-/g, '') + '-' + kode + '-M' + now.toString(36).slice(-4).toUpperCase() + (++n),
      id_batch: batch, waktu_catat: waktu, tanggal_transaksi: hari, id_pengguna: uid, jenis: 'PINDAH', nominal: Math.abs(v), keterangan: ket,
      id_kategori: '', id_dompet: a, id_dompet_tujuan: b, teks_asli: '', sumber: 'MODE', status: 'AKTIF', diubah_oleh: uid, diubah_pada: waktu }, 1, now));
  };
  const saldo = saldoServer_();
  const ringkas = [];
  if (mode === 'MASING') {
    salinDompetAnggota_(td, null, null);
    const anggota = tableObjects_(SHEET.pengguna).filter(function (u) { return truthy_(u.aktif); }).map(function (u) { return u.id_pengguna; });
    const bagi = d.bagi || {};
    const keluarga = td.rows.filter(function (r) { return String(r[td.col.id_dompet]).indexOf('~') < 0 && !r[td.col.pemilik] && truthy_(r[td.col.aktif]); });
    for (let i = 0; i < keluarga.length; i++) {
      const id = String(keluarga[i][td.col.id_dompet]), nama = String(keluarga[i][td.col.nama]);
      const total = Math.round(saldo[id] || 0);
      const per = bagi[id] || {};
      const jumlah = Object.keys(per).reduce(function (a, k) { return a + Math.round(Number(per[k]) || 0); }, 0);
      if (!Object.keys(per).length) { if (total) per[uid] = total; }           // tidak dibagi → semua ke Admin
      else if (jumlah !== total) return fail_('Saldo ' + nama + ' sekarang ' + rupiah_(total) + ', tetapi yang dibagi ' + rupiah_(jumlah) + '. Muat ulang lalu bagi lagi.', { code: 'SALDO_BERUBAH', saldo: saldo });
      Object.keys(per).forEach(function (k) {
        if (anggota.indexOf(k) < 0) return;
        pindah(id, id + '~' + k, per[k], 'Pembagian saldo');
      });
      if (total) ringkas.push(nama + ' ' + rupiah_(total));
    }
  } else {
    td.rows.forEach(function (r) {
      const id = String(r[td.col.id_dompet]);
      if (id.indexOf('~') < 0) return;
      const asal = id.split('~')[0];
      const v = Math.round(saldo[id] || 0);
      if (v && td.rows.some(function (x) { return String(x[td.col.id_dompet]) === asal; })) pindah(id, asal, v, 'Gabung saldo');
    });
    // dompet keluarga yang sempat dinonaktifkan tetapi menerima gabungan → aktifkan lagi
    td.rows.forEach(function (r) {
      const id = String(r[td.col.id_dompet]);
      if (id.indexOf('~') < 0 && !r[td.col.pemilik] && !truthy_(r[td.col.aktif]) && txs.some(function (x) { return x[10] === id; })) { r[td.col.aktif] = true; td.dirty = true; }
    });
  }
  if (td.dirty) writeTable_(td);
  if (txs.length) appendRows_(SHEET.transaksi, txs);
  const tp = readTable_(SHEET.pengaturan);
  const j = tp.rows.findIndex(function (r) { return r[0] === 'mode_saldo'; });
  if (j > -1) tp.rows[j][1] = mode; else tp.rows.push(['mode_saldo', mode]);
  writeTable_(tp);
  bumpMaster_();
  logAturLangsung_(ctx.user, 'SALDO', mode === 'MASING' ? 'saldo masing-masing' + (ringkas.length ? ' (dibagi: ' + ringkas.join(', ') + ')' : '') : 'saldo bersama (digabung)');
  return ok_({ pesan: mode === 'MASING' ? 'Saldo sekarang masing-masing.' : 'Saldo keluarga sekarang bersama.', mode: mode, transaksi: txs.length });
}

// ------------------------------------------------------------
// 10. UTILITIES — Sheets (memo per eksekusi), cache berversi, lock
// ------------------------------------------------------------
let _SS = null;
const _TBL = {};
function ss_() { return _SS || (_SS = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)); }
function getSheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan setupAppEnvironment().');
  return s;
}

/** Baca tabel sekali per eksekusi. rows = array baris (tanpa header), col = indeks kolom. */
function readTable_(name) {
  if (_TBL[name]) return _TBL[name];
  const sh = getSheet_(name), last = sh.getLastRow(), width = (KOLOM[name] || []).length || sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, width).getValues()[0].map(String);
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues().filter(function (r) { return r.join('') !== ''; }) : [];
  const col = {};
  head.forEach(function (h, i) { col[h] = i; });
  return (_TBL[name] = { name: name, head: head, rows: rows, col: col, width: width, dirty: false });
}
function tableObjects_(name) {
  const t = readTable_(name);
  return t.rows.map(function (r) {
    const o = {};
    t.head.forEach(function (h, i) { o[h] = r[i] instanceof Date ? iso_(r[i]) : r[i]; });
    return o;
  });
}
function objToRow_(t, o) { return t.head.map(function (h) { return o[h] === undefined ? '' : o[h]; }); }
function writeTable_(t) {
  const sh = getSheet_(t.name);
  const last = sh.getLastRow();
  if (t.rows.length) sh.getRange(2, 1, t.rows.length, t.width).setValues(t.rows);
  if (last - 1 > t.rows.length) sh.getRange(t.rows.length + 2, 1, last - 1 - t.rows.length, t.width).clearContent();
  t.dirty = false;
}
function appendRows_(name, rows) {
  if (!rows.length) return;
  const sh = getSheet_(name);
  const start = sh.getLastRow() + 1, butuh = start + rows.length - 1;
  // getRange di luar ukuran sheet akan gagal → tambah baris dulu (format ikut baris di atasnya)
  if (butuh > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), butuh - sh.getMaxRows() + 500);
  sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
  delete _TBL[name];
}
function updateByKey_(name, keyCol, key, patch) {
  const t = readTable_(name);
  const i = t.rows.findIndex(function (r) { return r[t.col[keyCol]] === key; });
  if (i < 0) return false;
  Object.keys(patch).forEach(function (k) { if (t.col[k] !== undefined) t.rows[i][t.col[k]] = patch[k]; });
  getSheet_(name).getRange(i + 2, 1, 1, t.width).setValues([t.rows[i]]);
  return true;
}
function pengaturanMap_() {
  const m = {};
  readTable_(SHEET.pengaturan).rows.forEach(function (r) { if (r[0]) m[String(r[0])] = String(r[1]); });
  return m;
}

function verMaster_() {
  const c = CacheService.getScriptCache();
  let v = c.get('VER_MASTER');
  if (!v) {
    v = PropertiesService.getScriptProperties().getProperty('VER_MASTER') || String(Date.now());
    c.put('VER_MASTER', v, 21600);
  }
  return v;
}
function bumpMaster_() {
  const v = String(Date.now());
  PropertiesService.getScriptProperties().setProperty('VER_MASTER', v);
  CacheService.getScriptCache().put('VER_MASTER', v, 21600);
  delete _TBL[SHEET.pengguna];
}

/** Cache server bertingkat dengan pemecahan (chunk) untuk nilai > 50 KB. */
const CacheX = {
  SZ: 50000,
  c: function () { return CacheService.getScriptCache(); },
  get: function (key) {
    const c = this.c(), head = c.get(key);
    if (head == null) return null;
    if (head.indexOf('__chunks:') !== 0) return JSON.parse(head);
    const n = +head.slice(9), keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '#' + i);
    const parts = c.getAll(keys);
    let s = '';
    for (let i = 0; i < n; i++) { if (parts[keys[i]] == null) return null; s += parts[keys[i]]; }
    return JSON.parse(s);
  },
  put: function (key, val, ttl) {
    const s = JSON.stringify(val), c = this.c();
    try {
      if (s.length <= this.SZ) return c.put(key, s, ttl);
      const n = Math.ceil(s.length / this.SZ);
      if (n > 20) return;
      const m = {};
      for (let i = 0; i < n; i++) m[key + '#' + i] = s.substr(i * this.SZ, this.SZ);
      c.putAll(m, ttl);
      c.put(key, '__chunks:' + n, ttl);
    } catch (e) { /* cache opsional */ }
  }
};
function cached_(key, ttl, build) {
  const v = CacheX.get(key);
  if (v !== null) return v;
  const d = build();
  CacheX.put(key, d, ttl);
  return d;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return fail_('Server sedang sibuk, coba lagi sebentar.', { retry: true });
  try { return fn(); } finally { lock.releaseLock(); }
}

function namaPengguna_(id) { const u = usersMap_()[id]; return u ? u.nama_tampilan : 'anggota lain'; }
function awalJendela_(now) {
  const d = new Date(now);
  const s = Utilities.formatDate(d, APP.TZ, 'yyyy-MM').split('-');
  let y = Number(s[0]), m = Number(s[1]) - (APP.JENDELA_BULAN - 1);
  while (m < 1) { m += 12; y--; }
  return y + '-' + ('0' + m).slice(-2) + '-01';
}
function tgl_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, APP.TZ, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}
function tglStr_(d) { return Utilities.formatDate(d, APP.TZ, 'yyyy-MM-dd'); }
function iso_(d) { return Utilities.formatDate(d, APP.TZ, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"); }
function truthy_(v) { return v === true || String(v).toUpperCase() === 'TRUE' || v === 1 || v === '1'; }
function ok_(data) { return { success: true, data: data }; }
function fail_(message, data) { return { success: false, message: message, data: data || {} }; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// ============================================================
// 11. SETUP — jalankan SEKALI saat pertama memasang
// ============================================================
function setupAppEnvironment() {
  const props = PropertiesService.getScriptProperties();
  const lama = props.getProperty('SPREADSHEET_ID');
  if (lama) {
    try {
      SpreadsheetApp.openById(lama);
      Logger.log('⚠️ Setup sudah pernah dijalankan. Database: ' + SpreadsheetApp.openById(lama).getUrl());
      Logger.log('   Tidak ada yang dibuat ulang. Untuk memulai dari nol, hapus Script Property SPREADSHEET_ID dulu.');
      return;
    } catch (e) { /* database lama hilang → buat baru */ }
  }
  if (String(SETUP.ADMIN_PASSWORD).length < 6) throw new Error('SETUP.ADMIN_PASSWORD minimal 6 karakter.');
  Logger.log('🚀 Memulai setup ' + APP.NAMA + '...');
  const hasil = setupInti_({ nama: SETUP.ADMIN_NAMA, username: SETUP.ADMIN_USERNAME, password: SETUP.ADMIN_PASSWORD });
  Logger.log('✅ Setup selesai!');
  Logger.log('   Spreadsheet : ' + hasil.ssUrl);
  Logger.log('   Folder Drive: ' + hasil.folderUrl);
  Logger.log('   Login Admin : ' + SETUP.ADMIN_USERNAME + ' / (password di SETUP.ADMIN_PASSWORD)');
  Logger.log('   Lanjut: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone');
}

/** Membuat folder, Google Sheet, semua sheet + data bawaan, dan akun Admin pertama. */
function setupInti_(admin) {
  const props = PropertiesService.getScriptProperties();

  const folder = DriveApp.createFolder('📁 ' + APP.NAMA);
  const ss = SpreadsheetApp.create('🗃️ Database — ' + APP.NAMA);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  ss.setSpreadsheetTimeZone(APP.TZ);

  // Buat semua sheet dengan header + format teks untuk kolom ID/tanggal
  const first = ss.getSheets()[0].setName(SHEET.config);
  first.getRange(1, 1, 1, 3).setValues([['key', 'value', 'keterangan']]);
  Object.keys(KOLOM).forEach(function (name) {
    const sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, KOLOM[name].length).setValues([KOLOM[name]])
      .setFontWeight('bold').setBackground('#008069').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), KOLOM[name].length).setNumberFormat('@');
    const angka = KOLOM_ANGKA[name] || [];
    angka.forEach(function (k) {
      const c = KOLOM[name].indexOf(k) + 1;
      sh.getRange(2, c, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('0');
    });
  });

  const now = Date.now();
  const nowIso = Utilities.formatDate(new Date(), APP.TZ, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
  const hariIni = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd');

  // Kategori bawaan
  const kat = SEED_KATEGORI.map(function (k, i) { return [k[0], k[1], k[2], k[3], k[4], i + 1, true, now]; });
  ss.getSheetByName(SHEET.kategori).getRange(2, 1, kat.length, 8).setValues(kat);

  // Kamus bawaan
  const kamus = [];
  let n = 0;
  SEED_KATEGORI.forEach(function (k) {
    (SEED_KAMUS[k[0]] || []).forEach(function (f) {
      kamus.push(['KMS-' + ('000' + (++n)).slice(-4), f, 'KATEGORI', k[0], 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]);
    });
  });
  SEED_PENANDA.MASUK.forEach(function (f) { kamus.push(['KMS-' + ('000' + (++n)).slice(-4), f, 'JENIS_MASUK', 'MASUK', 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]); });
  SEED_PENANDA.PINDAH.forEach(function (f) { kamus.push(['KMS-' + ('000' + (++n)).slice(-4), f, 'JENIS_PINDAH', 'PINDAH', 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]); });
  const shKamus = ss.getSheetByName(SHEET.kamus);
  if (kamus.length + 1 > shKamus.getMaxRows()) shKamus.insertRowsAfter(shKamus.getMaxRows(), kamus.length + 1 - shKamus.getMaxRows() + 200);
  shKamus.getRange(2, 1, kamus.length, 10).setValues(kamus);

  // Dompet bawaan
  const dompet = [
    ['DMP-TUNAI', 'Tunai', 'TUNAI', '', 0, hariIni, '💵', 'tunai, cash, kes, kontan, uang tunai', true, now],
    ['DMP-BANK', 'Rekening Bank', 'REKENING', '', 0, hariIni, '🏦', 'rekening, rek, bank, atm, debit, transfer, tf, m-banking, bri, brimo, bni, bca, mandiri, livin, bsi, btn, bankaltimtara, seabank, jago, blu', true, now],
    ['DMP-EWALLET', 'E-Wallet', 'EWALLET', '', 0, hariIni, '📱', 'e-wallet, ewallet, gopay, ovo, dana, shopeepay, spay, linkaja', true, now],
    ['DMP-TABUNGAN', 'Tabungan', 'TABUNGAN', '', 0, hariIni, '💰', 'tabungan, celengan, simpanan, dana darurat', true, now]
  ];
  ss.getSheetByName(SHEET.dompet).getRange(2, 1, dompet.length, 10).setValues(dompet);

  // Pengaturan
  const peng = [['fitur_dompet', 'ON'], ['warna_utama', '#25D366'],
    ['awal_minggu', 'SENIN'], ['zona_waktu', APP.TZ], ['konfirmasi_nominal_kecil', 'ON']];
  ss.getSheetByName(SHEET.pengaturan).getRange(2, 1, peng.length, 2).setValues(peng);

  // Aturan parser (bobot & ambang) dan kamus typo bawaan
  ss.getSheetByName(SHEET.aturan).getRange(2, 1, SEED_ATURAN.length, 3).setValues(SEED_ATURAN);
  ss.getSheetByName(SHEET.typo).getRange(2, 1, SEED_TYPO.length, 8).setValues(SEED_TYPO.map(function (x) { return [x[0], x[1], 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]; }));
  ss.getSheetByName(SHEET.alias).getRange(2, 1, SEED_ALIAS.length, 5).setValues(barisAlias_());
  // Penasihat keuangan: aturan, pemicu, pertanyaan, pemetaan kategori bawaan
  const tulis = function (name, rows) { if (rows.length) ss.getSheetByName(name).getRange(2, 1, rows.length, rows[0].length).setValues(rows); };
  tulis(SHEET.aturanPn, SEED_ATURAN_PN.map(function (x) { return [x[0], x[1], x[2]]; }));
  tulis(SHEET.pemicu, SEED_PEMICU.map(function (f) { return [f, 'PENASIHAT', 'BAWAAN', 'SYSTEM', true, nowIso]; }));
  tulis(SHEET.tanyaPn, SEED_PERTANYAAN_PN.map(function (x) { return x.concat([true]); }));
  tulis(SHEET.petaPn, SEED_KATEGORI.filter(function (k) { return k[2] === 'KELUAR' && tebakKelompokPn_(k[1]); }).map(function (k) { return [k[0], k[1], tebakKelompokPn_(k[1]), nowIso]; }));

  // Admin pertama
  const salt = Utilities.getUuid();
  ss.getSheetByName(SHEET.pengguna).getRange(2, 1, 1, 13).setValues([[
    'USR-ADMIN', String(admin.username).toLowerCase(), admin.nama, 'ADMIN', hash_(salt, admin.password), salt,
    'SEMUA', 'DMP-TUNAI', '#008069', 'OTOMATIS', true, nowIso, '']]);

  // Catatan permanen
  first.getRange(2, 1, 5, 3).setValues([
    ['APP_NAME', APP.NAMA, 'Nama aplikasi'],
    ['ROOT_FOLDER_ID', folder.getId(), 'ID folder root Drive'],
    ['SPREADSHEET_ID', ss.getId(), 'ID spreadsheet ini'],
    ['CREATED_AT', nowIso, 'Tanggal setup'],
    ['VERSI', APP.VERSI, 'Versi backend']
  ]);
  first.setFrozenRows(1);
  first.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#008069').setFontColor('#ffffff');
  first.autoResizeColumns(1, 3);

  props.setProperties({
    SPREADSHEET_ID: ss.getId(), ROOT_FOLDER_ID: folder.getId(),
    VER_MASTER: String(now), LAST_TX: String(now), MIGRASI: String(MIGRASI_VERSI)
  });
  secret_();
  return { ssUrl: ss.getUrl(), folderUrl: folder.getUrl() };
}

// ------------------------------------------------------------
// PEMASANG OTOMATIS (mode jual)
// ------------------------------------------------------------
function apiInfoServer_() {
  const props = PropertiesService.getScriptProperties();
  return ok_({ app: APP.NAMA, versi: APP.VERSI, modeJual: !!modeJual_(), siap: !!props.getProperty('SPREADSHEET_ID'),
    terpasang: !!props.getProperty('PASANG_SELESAI') || (!modeJual_() && !!props.getProperty('SPREADSHEET_ID')) });
}

/** Sekali saja: membuat database + akun Admin pertama + pemicu, memakai token rahasia dari Pasang.gs. */
function apiPasangAwal_(ctx, d) {
  if (!modeJual_()) return fail_('Server ini tidak dipasang lewat halaman pemasangan.');
  if (String(d.token || '') !== String(PASANG.TOKEN)) return fail_('Token pemasangan tidak cocok.', { code: 'TOKEN' });
  const nama = String(d.nama || '').trim().slice(0, 40);
  const username = String(d.username || '').trim().toLowerCase();
  const password = String(d.password || '');
  if (!nama) return fail_('Nama wajib diisi.');
  if (!/^[a-z0-9._]{3,20}$/.test(username)) return fail_('Username 3–20 huruf kecil/angka, tanpa spasi.');
  if (password.length < 6) return fail_('Password minimal 6 karakter.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return fail_('Server sedang sibuk, coba lagi.', { retryable: true });
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('PASANG_SELESAI')) return fail_('Server ini sudah terpasang. Silakan masuk di aplikasi CashKu.', { code: 'SUDAH' });
    let hasil;
    if (!props.getProperty('SPREADSHEET_ID')) hasil = setupInti_({ nama: nama, username: username, password: password });
    else {
      // percobaan sebelumnya terputus setelah database dibuat → cukup perbarui akun Admin
      const t = readTable_(SHEET.pengguna), salt = Utilities.getUuid();
      const i = t.rows.findIndex(function (r) { return r[t.col.id_pengguna] === 'USR-ADMIN'; });
      if (i > -1) {
        t.rows[i][t.col.username] = username; t.rows[i][t.col.nama_tampilan] = nama; t.rows[i][t.col.salt] = salt; t.rows[i][t.col.hash_password] = hash_(salt, password);
        writeTable_(t); bumpMaster_();
      }
      hasil = { ssUrl: SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID')).getUrl() };
    }
    try { pasangPemanas(); } catch (e) {}
    try { pasangPengingat(); } catch (e) {}
    props.setProperty('PASANG_SELESAI', String(Date.now()));
    return ok_({ nama: nama, username: username, database: hasil.ssUrl, versi: APP.VERSI });
  } finally { lock.releaseLock(); }
}

// ------------------------------------------------------------
// MIGRASI — menambah data bawaan baru ke database yang sudah ada (berjalan otomatis, aman diulang)
// ------------------------------------------------------------
const MIGRASI_VERSI = 9;      // 2 = kategori "Belanja Online" + kata e-commerce; 3 = Hobi, dompet Tabungan, "belanja" umum; 4 = sheet typo/aturan/ingatan/pengingat; 5 = alias catatan, sapaan, log pengaturan; 6 = target tabungan; 7 = penasihat keuangan; 8 = kosakata kategori tambahan; 9 = ikon Tabungan bukan babi
function pastikanMigrasi_() {
  const c = CacheService.getScriptCache();
  if (c.get('MIGRASI') === String(MIGRASI_VERSI)) return;
  const props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty('MIGRASI') || 1) >= MIGRASI_VERSI) { c.put('MIGRASI', String(MIGRASI_VERSI), 21600); return; }
  withLock_(function () {
    if (Number(props.getProperty('MIGRASI') || 1) >= MIGRASI_VERSI) return;
    jalankanMigrasi_(Number(props.getProperty('MIGRASI') || 1));
    props.setProperty('MIGRASI', String(MIGRASI_VERSI));
    c.put('MIGRASI', String(MIGRASI_VERSI), 21600);
  });
}
function jalankanMigrasi_(dari) {
  const log = [];
  if (dari < 2) { const h = migrasiBelanjaOnline_(); log.push((h.kategori ? 'kategori Belanja Online ditambahkan' : 'kategori Belanja Online sudah ada') + ', ' + h.kata + ' kata e-commerce'); }
  if (dari < 3) { const h = migrasiV3_(); log.push(h.join(', ')); }
  if (dari < 4) { const h = migrasiV4_(); log.push(h.join(', ')); }
  if (dari < 5) { const h = migrasiV5_(); log.push(h.join(', ')); }
  if (dari < 6) { const h = migrasiV6_(); log.push(h.join(', ')); }
  if (dari < 7) { const h = migrasiV7_(); log.push(h.join(', ')); }
  if (dari < 8) { const h = migrasiV8_(); log.push(h.join(', ')); }
  if (dari < 9) { const h = migrasiV9_(); log.push(h.join(', ')); }
  return log.join('; ');
}

/** v9: ikon dompet Tabungan diganti dari babi menjadi kantong uang */
function migrasiV9_() {
  const t = readTable_(SHEET.dompet);
  if (t.col.ikon === undefined) return ['ikon dompet: kolom tidak ada'];
  let n = 0;
  t.rows.forEach(function (r) { if (/\uD83D\uDC37|\uD83D\uDC16|\uD83D\uDC3D/.test(String(r[t.col.ikon]))) { r[t.col.ikon] = '\uD83D\uDCB0'; n++; } });
  if (n) { writeTable_(t); bumpMaster_(); }
  return [n + ' ikon dompet diganti'];
}

/** v8: kosakata tambahan — hanya kata yang belum ada sama sekali (kata yang sudah ada / buatan pengguna tidak diubah) */
function migrasiV8_() {
  const tm = readTable_(SHEET.kamus), tk = readTable_(SHEET.kategori), nowIso = iso_(new Date()), now = Date.now();
  const ada = {}, katAda = {};
  tm.rows.forEach(function (r) { ada[String(r[1]).trim().toLowerCase()] = true; });
  tk.rows.forEach(function (r) { katAda[r[0]] = true; });
  const baru = [];
  Object.keys(KAMUS_V8).forEach(function (k, ki) {
    if (!katAda[k]) return;
    KAMUS_V8[k].forEach(function (f, n) {
      if (ada[f]) return;
      ada[f] = true;
      baru.push(['KMS-V8-' + ('0' + ki).slice(-2) + ('00' + n).slice(-3), f, 'KATEGORI', k, 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]);
    });
  });
  if (baru.length) { appendRows_(SHEET.kamus, baru); bumpMaster_(); }
  return [baru.length + ' kata kategori baru'];
}

/** Tambah kata kunci kategori yang belum ada (kata bawaan lama boleh dipindah; kata buatan pengguna dibiarkan) */
function tambahKamus_(daftar, target, awalanId) {
  const tm = readTable_(SHEET.kamus), nowIso = iso_(new Date()), now = Date.now();
  const peta = {};
  tm.rows.forEach(function (r, i) { peta[String(r[1]).trim().toLowerCase()] = i; });
  const baru = []; let ubah = false, dipindah = 0;
  daftar.forEach(function (f, n) {
    const i = peta[f];
    if (i === undefined) baru.push([awalanId + ('00' + (n + 1)).slice(-3), f, 'KATEGORI', target, 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]);
    else if (tm.rows[i][4] === 'BAWAAN' && tm.rows[i][2] === 'KATEGORI' && tm.rows[i][3] !== target) { tm.rows[i][3] = target; tm.rows[i][9] = now; ubah = true; dipindah++; }
  });
  if (ubah) writeTable_(tm);
  if (baru.length) appendRows_(SHEET.kamus, baru);
  return { baru: baru.length, dipindah: dipindah };
}

function migrasiV3_() {
  const now = Date.now(), hasil = [];
  // 1) Kategori Hobi
  const tk = readTable_(SHEET.kategori);
  let idHobi = 'KAT-HOBI';
  const ada = tk.rows.find(function (r) { return r[0] === 'KAT-HOBI' || String(r[1]).trim().toLowerCase() === 'hobi'; });
  if (ada) { idHobi = ada[0]; hasil.push('kategori Hobi sudah ada'); }
  else {
    const hib = tk.rows.find(function (r) { return r[0] === 'KAT-HIBURAN'; });
    appendRows_(SHEET.kategori, [['KAT-HOBI', 'Hobi', 'KELUAR', '🎣', '#0891B2', hib ? Number(hib[5]) + 0.5 : tk.rows.length + 1, true, now]]);
    hasil.push('kategori Hobi ditambahkan');
  }
  hasil.push(tambahKamus_(KAMUS_HOBI, idHobi, 'KMS-HOB').baru + ' kata hobi');
  // 2) "belanja" saja tidak lagi berarti Kebutuhan Bulanan
  const tm = readTable_(SHEET.kamus);
  let mati = 0;
  tm.rows.forEach(function (r) {
    if (String(r[1]).trim().toLowerCase() === 'belanja' && r[2] === 'KATEGORI' && r[4] === 'BAWAAN' && r[8] !== false) { r[8] = false; r[9] = now; mati++; }
  });
  if (mati) writeTable_(tm);
  tambahKamus_(KAMUS_BULANAN_BARU, 'KAT-BULANAN', 'KMS-BLN');
  hasil.push('kata "belanja" dibuat umum');
  // 3) Dompet Tabungan
  const td = readTable_(SHEET.dompet);
  if (!td.rows.some(function (r) { return r[2] === 'TABUNGAN'; })) {
    appendRows_(SHEET.dompet, [['DMP-TABUNGAN', 'Tabungan', 'TABUNGAN', '', 0, tglStr_(new Date()), '💰', 'tabungan, celengan, simpanan, dana darurat', true, now]]);
    hasil.push('dompet Tabungan ditambahkan');
  } else hasil.push('dompet Tabungan sudah ada');
  bumpMaster_();
  return hasil;
}

function migrasiBelanjaOnline_() {
  const now = Date.now(), nowIso = iso_(new Date());
  const hasil = { kategori: false, kata: 0, dipindah: 0 };
  // 1) Kategori
  const tk = readTable_(SHEET.kategori);
  let idOnline = 'KAT-ONLINE';
  const ada = tk.rows.find(function (r) { return r[0] === 'KAT-ONLINE' || String(r[1]).trim().toLowerCase() === 'belanja online'; });
  if (ada) idOnline = ada[0];
  else {
    const bul = tk.rows.find(function (r) { return r[0] === 'KAT-BULANAN'; });
    const urutan = bul ? Number(bul[5]) + 0.5 : tk.rows.length + 1;
    appendRows_(SHEET.kategori, [['KAT-ONLINE', 'Belanja Online', 'KELUAR', '🛍️', '#EE4D2D', urutan, true, now]]);
    hasil.kategori = true;
  }
  // 2) Kata kunci: tambahkan yang belum ada; kata bawaan lama dipindah ke Belanja Online, kata buatan pengguna dibiarkan
  const tm = readTable_(SHEET.kamus);
  const peta = {};
  tm.rows.forEach(function (r, i) { peta[String(r[1]).trim().toLowerCase()] = i; });
  const baru = [];
  let ubah = false;
  KAMUS_ONLINE.concat(['shopee food']).forEach(function (f, n) {
    const target = f === 'shopee food' ? 'KAT-MAKAN' : idOnline;
    const i = peta[f];
    if (i === undefined) {
      baru.push(['KMS-ONL' + ('00' + (n + 1)).slice(-3), f, 'KATEGORI', target, 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]);
    } else if (tm.rows[i][4] === 'BAWAAN' && tm.rows[i][2] === 'KATEGORI' && tm.rows[i][3] !== target) {
      tm.rows[i][3] = target; tm.rows[i][9] = now; ubah = true; hasil.dipindah++;
    }
  });
  if (ubah) writeTable_(tm);
  if (baru.length) appendRows_(SHEET.kamus, baru);
  hasil.kata = baru.length;
  bumpMaster_();
  return hasil;
}

/** Bisa dijalankan manual dari editor untuk memastikan migrasi sudah terpasang. Aman diulang. */
function migrasiData() {
  const props = PropertiesService.getScriptProperties();
  const sebelum = Number(props.getProperty('MIGRASI') || 1);
  if (sebelum >= MIGRASI_VERSI) { Logger.log('✅ Database sudah versi terbaru (migrasi ' + sebelum + '). Tidak ada yang diubah.'); return; }
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const log = jalankanMigrasi_(sebelum);
    props.setProperty('MIGRASI', String(MIGRASI_VERSI));
    CacheService.getScriptCache().put('MIGRASI', String(MIGRASI_VERSI), 21600);
    Logger.log('✅ Migrasi selesai: ' + log + '.');
  } finally { lock.releaseLock(); }
}

/** Opsional: menjaga server tetap "hangat" agar respons pertama lebih cepat. Jalankan sekali. */
function pasangPemanas() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pemanas') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pemanas').timeBased().everyMinutes(10).create();
  Logger.log('✅ Pemanas terpasang (tiap 10 menit).');
}
function pemanas() { verMaster_(); usersMap_(); }

// ------------------------------------------------------------
// 1.0.12 — Kamus typo, aturan parser, ingatan data, pengingat & notifikasi
// ------------------------------------------------------------
/** Tabel yang mungkin belum ada (database lama sebelum migrasi) → [] */
function amanTabel_(name) { try { return tableObjects_(name); } catch (e) { return []; } }
function aturanMap_() {
  const m = {};
  amanTabel_(SHEET.aturan).forEach(function (x) { if (x.kunci) m[String(x.kunci).trim()] = String(x.nilai).trim(); });
  return m;
}
function rowObj_(t, r) { const o = {}; t.head.forEach(function (h, i) { o[h] = r[i] instanceof Date ? iso_(r[i]) : r[i]; }); return o; }
function offsetZona_() {
  const z = pengaturanMap_().zona_waktu || APP.TZ;
  return ({ 'Asia/Jakarta': 7, 'Asia/Pontianak': 7, 'Asia/Makassar': 8, 'Asia/Jayapura': 9 })[z] || 8;
}

function opTypo_(user, op, t, now) {
  const x = op.data || {};
  const salah = String(x.salah || '').trim().toLowerCase(), benar = String(x.benar || '').trim().toLowerCase();
  if (!/^[a-z]{2,30}$/.test(salah) || !benar || benar.length > 40 || salah === benar) return { hasil: 'DITOLAK', pesan: 'Data typo tidak valid.' };
  const i = t.rows.findIndex(function (r) { return String(r[t.col.salah]).toLowerCase() === salah; });
  if (i > -1) {
    const r = t.rows[i];
    if (r[t.col.sumber] === 'BAWAAN' && r[t.col.benar] !== benar && !bolehKelola_(user)) return { hasil: 'OK' };
    r[t.col.benar] = benar; r[t.col.aktif] = true; r[t.col.dipakai] = (Number(r[t.col.dipakai]) || 0) + 1; r[t.col.diterima_server] = now;
  } else {
    t.rows.push(objToRow_(t, { salah: salah, benar: benar, sumber: 'BELAJAR', id_pengguna: user.id, dipakai: 1, dibuat_pada: iso_(new Date()), aktif: true, diterima_server: now }));
  }
  t.dirty = true;
  return { hasil: 'OK' };
}

function opIngatan_(user, op, t, now) {
  const x = op.data || {};
  const id = String(x.id_ingatan || '');
  if (!/^ING-/.test(id)) return { hasil: 'DITOLAK', pesan: 'ID ingatan tidak valid.' };
  const i = t.rows.findIndex(function (r) { return r[t.col.id_ingatan] === id; });
  if (i > -1) {
    const r = t.rows[i];
    const pemilik = r[t.col.id_pengguna] === user.id || (r[t.col.lingkup] === 'KELUARGA' && user.peran === 'ADMIN');
    if (!pemilik) return { hasil: 'DITOLAK', pesan: 'Hanya pemilik yang boleh mengubah data ini.' };
    if (op.type === 'ingatan.del') { r[t.col.aktif] = false; r[t.col.diterima_server] = now; t.dirty = true; return { hasil: 'OK' }; }
    r[t.col.label] = String(x.label || r[t.col.label]).slice(0, 80);
    r[t.col.nilai] = String(x.nilai == null ? r[t.col.nilai] : x.nilai).slice(0, 500);
    r[t.col.lingkup] = x.lingkup === 'KELUARGA' ? 'KELUARGA' : 'PRIBADI';
    r[t.col.diubah_pada] = iso_(new Date()); r[t.col.aktif] = true; r[t.col.diterima_server] = now;
    ['jenis', 'lembaga', 'pemilik'].forEach(function (k) { if (t.col[k] !== undefined && x[k] !== undefined) r[t.col[k]] = String(x[k] || '').slice(0, 60); });
  } else {
    if (op.type === 'ingatan.del') return { hasil: 'OK' };
    t.rows.push(objToRow_(t, { id_ingatan: id, id_pengguna: user.id, label: String(x.label || '').slice(0, 80), nilai: String(x.nilai || '').slice(0, 500),
      lingkup: x.lingkup === 'KELUARGA' ? 'KELUARGA' : 'PRIBADI', dibuat_pada: iso_(new Date()), diubah_pada: iso_(new Date()), aktif: true, diterima_server: now,
      jenis: String(x.jenis || '').slice(0, 60), lembaga: String(x.lembaga || '').slice(0, 60), pemilik: String(x.pemilik || '').slice(0, 60) }));
  }
  t.dirty = true;
  return { hasil: 'OK' };
}

function opPengingat_(user, op, t, now) {
  const x = op.data || {}, off = offsetZona_();
  const id = String(x.id_pengingat || '');
  if (!/^PGN-/.test(id)) return { hasil: 'DITOLAK', pesan: 'ID pengingat tidak valid.' };
  const i = t.rows.findIndex(function (r) { return r[t.col.id_pengingat] === id; });
  if (i > -1 && t.rows[i][t.col.id_pengguna] !== user.id) return { hasil: 'DITOLAK', pesan: 'Pengingat milik anggota lain.' };
  if (op.type === 'pengingat.put') {
    const pola = ['SEKALI', 'HARIAN', 'MINGGUAN', 'BULANAN', 'TAHUNAN'].indexOf(x.pola) > -1 ? x.pola : 'SEKALI';
    const o = { id_pengingat: id, id_pengguna: user.id, judul: String(x.judul || 'Pengingat').slice(0, 120), pola: pola, tanggal: String(x.tanggal || ''),
      hari_bulan: String(x.hari_bulan || ''), hari_minggu: String(x.hari_minggu || ''), jam: /^\d{2}:\d{2}$/.test(String(x.jam)) ? String(x.jam) : '07:00',
      bunyi_ke: 0, terakhir_bunyi: '', status: 'AKTIF', dibuat_pada: i > -1 ? t.rows[i][t.col.dibuat_pada] : iso_(new Date()), diterima_server: now };
    o.berikutnya = Number(x.berikutnya) > now - 3600e3 ? Number(x.berikutnya) : (jadwalBerikutnya_(o, now - 60000, off) || '');
    if (!o.berikutnya) o.status = 'SELESAI';
    if (i > -1) t.rows[i] = objToRow_(t, o); else t.rows.push(objToRow_(t, o));
  } else {
    if (i < 0) return { hasil: 'OK' };
    const r = t.rows[i], p = rowObj_(t, r);
    if (op.type === 'pengingat.del') r[t.col.status] = 'DIHAPUS';
    else if (op.type === 'pengingat.tunda') {
      const sampai = Number(x.sampai) || (now + 10 * 60000);
      r[t.col.berikutnya] = sampai; r[t.col.status] = 'AKTIF'; r[t.col.bunyi_ke] = 0; r[t.col.terakhir_bunyi] = '';
    } else if (op.type === 'pengingat.ack') {
      const b = Number(x.berikutnya) || Number(p.berikutnya) || now;
      if ((Number(p.berikutnya) || 0) <= b + 1000) {
        const nb = jadwalBerikutnya_(p, Math.max(b, now) + 1000, off);
        if (nb) r[t.col.berikutnya] = nb; else r[t.col.status] = 'SELESAI';
        r[t.col.bunyi_ke] = 0; r[t.col.terakhir_bunyi] = '';
      }
    }
    r[t.col.diterima_server] = now;
  }
  t.dirty = true;
  return { hasil: 'OK' };
}

/** Waktu bunyi berikutnya (ms) setelah "sejak" — sama persis dengan Jadwal.berikutnya di aplikasi (js/pengingat.js) */
function jadwalBerikutnya_(p, sejak, off) {
  const hm = String(p.jam || '07:00').split(':'), hh = Number(hm[0]) || 0, mm = Number(hm[1]) || 0;
  const geser = off * 3600000;
  const L = new Date(sejak + geser);
  const Ly = L.getUTCFullYear(), Lm = L.getUTCMonth() + 1, Ld = L.getUTCDate();
  function cek(y, m, d) { const t = Date.UTC(y, m - 1, d, hh, mm) - geser; return t > sejak ? t : null; }
  function hariKe(i) { const x = new Date(Date.UTC(Ly, Lm - 1, Ld + i)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: ((x.getUTCDay() + 6) % 7) + 1 }; }
  function jmlHari(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  let i, a, x, t;
  switch (p.pola) {
    case 'SEKALI':
      a = String(p.tanggal || '').split('-').map(Number);
      return a.length === 3 && a[0] ? cek(a[0], a[1], a[2]) : null;
    case 'HARIAN':
      for (i = 0; i < 3; i++) { x = hariKe(i); t = cek(x.y, x.m, x.d); if (t) return t; }
      return null;
    case 'MINGGUAN': {
      const hs = String(p.hari_minggu || '').split(',').map(Number).filter(function (n) { return n >= 1 && n <= 7; });
      if (!hs.length) return null;
      for (i = 0; i < 15; i++) { x = hariKe(i); if (hs.indexOf(x.dow) < 0) continue; t = cek(x.y, x.m, x.d); if (t) return t; }
      return null;
    }
    case 'BULANAN':
      for (i = 0; i < 14; i++) {
        let y = Ly, m = Lm + i;
        while (m > 12) { m -= 12; y++; }
        const n = jmlHari(y, m);
        const hb = String(p.hari_bulan).toUpperCase() === 'AKHIR' ? n : Math.min(Number(p.hari_bulan) || 1, n);
        t = cek(y, m, hb); if (t) return t;
      }
      return null;
    case 'TAHUNAN': {
      a = String(p.tanggal || '').split('-').map(Number);
      const mo = a.length === 3 ? a[1] : a[0], da = a.length === 3 ? a[2] : a[1];
      if (!mo || !da) return null;
      for (i = 0; i < 3; i++) { t = cek(Ly + i, mo, Math.min(da, jmlHari(Ly + i, mo))); if (t) return t; }
      return null;
    }
  }
  return null;
}

// ---------- Notifikasi (Web Push, VAPID ES256 — tanpa layanan pihak ketiga) ----------
const EC_ = (function () {
  if (typeof BigInt === 'undefined') return null;
  const B = BigInt;
  const P = B('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  const N = B('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  const G = [B('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'), B('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5'), B(1)];
  const _0 = B(0), _1 = B(1), _2 = B(2), _3 = B(3), _4 = B(4), _8 = B(8);
  function md(a, m) { const r = a % m; return r < _0 ? r + m : r; }
  function pw(b, e, m) { let r = _1; b = md(b, m); while (e > _0) { if (e & _1) r = r * b % m; b = b * b % m; e >>= _1; } return r; }
  function inv(a, m) { return pw(a, m - _2, m); }
  function dbl(p) {
    if (!p || p[1] === _0) return null;
    const X = p[0], Y = p[1], Z = p[2];
    const delta = Z * Z % P, gamma = Y * Y % P, beta = X * gamma % P;
    const alpha = _3 * md(X - delta, P) % P * ((X + delta) % P) % P;
    const X3 = md(alpha * alpha - _8 * beta, P);
    const Z3 = md((Y + Z) * (Y + Z) - gamma - delta, P);
    const Y3 = md(alpha * md(_4 * beta - X3, P) - _8 * (gamma * gamma % P), P);
    return [X3, Y3, Z3];
  }
  function add(p, q) {
    if (!p) return q; if (!q) return p;
    const Z1Z1 = p[2] * p[2] % P, Z2Z2 = q[2] * q[2] % P;
    const U1 = p[0] * Z2Z2 % P, U2 = q[0] * Z1Z1 % P;
    const S1 = p[1] * q[2] % P * Z2Z2 % P, S2 = q[1] * p[2] % P * Z1Z1 % P;
    const H = md(U2 - U1, P), r = md(_2 * (S2 - S1), P);
    if (H === _0) return r === _0 ? dbl(p) : null;
    const I = (_2 * H) * (_2 * H) % P, J = H * I % P, V = U1 * I % P;
    const X3 = md(r * r - J - _2 * V, P);
    const Y3 = md(r * md(V - X3, P) - _2 * S1 * J, P);
    const Z3 = md(((p[2] + q[2]) * (p[2] + q[2]) - Z1Z1 - Z2Z2) % P * H, P);
    return [X3, Y3, Z3];
  }
  function mul(k, p) { let r = null; const bits = k.toString(2); for (let i = 0; i < bits.length; i++) { r = dbl(r); if (bits[i] === '1') r = add(r, p); } return r; }
  function afin(p) { const zi = inv(p[2], P), zi2 = zi * zi % P; return [p[0] * zi2 % P, p[1] * zi2 % P * zi % P]; }
  function hex(n) { return n.toString(16).padStart(64, '0'); }
  function keBytes(h) { const a = []; for (let i = 0; i < h.length; i += 2) { const v = parseInt(h.substr(i, 2), 16); a.push(v > 127 ? v - 256 : v); } return a; }
  function dariBytes(bs) { return B('0x' + bs.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('')); }
  return {
    kunciBaru: function (acak) {
      const d = md(dariBytes(acak), N - _1) + _1, Q = afin(mul(d, G));
      return { d: hex(d), pub: keBytes('04' + hex(Q[0]) + hex(Q[1])) };
    },
    tanda: function (hash, dHex, acak) {
      const e = dariBytes(hash), d = B('0x' + dHex);
      for (let i = 0; i < 8; i++) {
        const k = md(dariBytes(acak(i)), N - _1) + _1;
        const R = afin(mul(k, G)), r = md(R[0], N);
        if (r === _0) continue;
        const s = md(inv(k, N) * (e + r * d), N);
        if (s === _0) continue;
        return keBytes(hex(r) + hex(s));
      }
      throw new Error('Gagal menandatangani VAPID.');
    }
  };
})();
function b64url_(x) { return Utilities.base64EncodeWebSafe(x).replace(/=+$/, ''); }
function vapid_() {
  const props = PropertiesService.getScriptProperties();
  let d = props.getProperty('VAPID_D'), pub = props.getProperty('VAPID_PUB');
  if (!d || !pub) {
    if (!EC_) throw new Error('Server ini belum mendukung notifikasi (BigInt tidak tersedia). Pastikan runtime V8 aktif.');
    const k = EC_.kunciBaru(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now(), Utilities.Charset.UTF_8));
    d = k.d; pub = b64url_(k.pub);
    props.setProperties({ VAPID_D: d, VAPID_PUB: pub });
  }
  return { d: d, pub: pub };
}
function jwtVapid_(aud, v) {
  const h = b64url_(Utilities.newBlob(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).getBytes());
  const sub = PropertiesService.getScriptProperties().getProperty('PUSH_SUB') || 'mailto:cashku@localhost.localdomain';
  const c = b64url_(Utilities.newBlob(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub })).getBytes());
  const input = h + '.' + c;
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  const sig = EC_.tanda(hash, v.d, function (i) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + i + Utilities.getUuid() + input, Utilities.Charset.UTF_8); });
  return input + '.' + b64url_(sig);
}
/** Kirim "colekan" push (tanpa isi) ke semua HP milik pengguna; HP lalu mengambil detail pengingat dari server */
function kirimPush_(userIds) {
  const t = readTable_(SHEET.push), v = vapid_(), jwt = {};
  const reqs = [], idx = [];
  t.rows.forEach(function (r, i) {
    if (!truthy_(r[t.col.aktif]) || !userIds[r[t.col.id_pengguna]]) return;
    const ep = String(r[t.col.endpoint]), m = /^https:\/\/[^/]+/.exec(ep);
    if (!m) return;
    jwt[m[0]] = jwt[m[0]] || jwtVapid_(m[0], v);
    reqs.push({ url: ep, method: 'post', contentType: 'application/octet-stream', payload: '', muteHttpExceptions: true,
      headers: { TTL: '600', Urgency: 'high', Authorization: 'vapid t=' + jwt[m[0]] + ', k=' + v.pub } });
    idx.push(i);
  });
  if (!reqs.length) return { terkirim: 0, perangkat: 0 };
  const res = UrlFetchApp.fetchAll(reqs);
  let ok = 0;
  res.forEach(function (x, j) {
    const code = x.getResponseCode(), r = t.rows[idx[j]];
    r[t.col.terakhir_kirim] = iso_(new Date()) + ' · ' + code;
    if (code >= 200 && code < 300) ok++;
    if (code === 404 || code === 410) r[t.col.aktif] = false;      // langganan kedaluwarsa
  });
  t.dirty = true; writeTable_(t);
  return { terkirim: ok, perangkat: reqs.length, kode: res.map(function (x) { return x.getResponseCode(); }) };
}

function apiPushKunci_(ctx) {
  try { return ok_({ kunci: vapid_().pub }); } catch (e) { return fail_(e.message, { code: 'PUSH_TIDAK_DIDUKUNG' }); }
}
function apiPushDaftar_(ctx, d) {
  const s = d.langganan || {}, keys = s.keys || {};
  if (!/^https:\/\//.test(String(s.endpoint || '')) || !keys.p256dh || !keys.auth) return fail_('Data langganan notifikasi tidak valid.');
  if (/^https:\/\//.test(String(d.asal || ''))) PropertiesService.getScriptProperties().setProperty('PUSH_SUB', String(d.asal).slice(0, 200));
  const t = readTable_(SHEET.push);
  const i = t.rows.findIndex(function (r) { return r[t.col.endpoint] === s.endpoint; });
  const o = { id_langganan: i > -1 ? t.rows[i][t.col.id_langganan] : 'PSH-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    id_pengguna: ctx.user.id, endpoint: s.endpoint, p256dh: keys.p256dh, auth: keys.auth, perangkat: String(d.perangkat || '').slice(0, 120),
    aktif: true, dibuat_pada: iso_(new Date()), terakhir_kirim: '' };
  if (i > -1) t.rows[i] = objToRow_(t, o); else t.rows.push(objToRow_(t, o));
  t.dirty = true; writeTable_(t);
  return ok_({ pesan: 'Notifikasi aktif di perangkat ini.' });
}
function apiPushUji_(ctx) {
  CacheService.getScriptCache().put('uji_' + ctx.user.id, '1', 180);
  const u = {}; u[ctx.user.id] = true;
  try { return ok_(kirimPush_(u)); } catch (e) { return fail_(e.message); }
}
/** Dipanggil service worker saat menerima push: pengingat milik pengguna yang sedang berbunyi */
function apiPengingatBunyi_(ctx) {
  const now = Date.now(), c = CacheService.getScriptCache();
  const uji = !!c.get('uji_' + ctx.user.id);
  if (uji) c.remove('uji_' + ctx.user.id);
  const list = amanTabel_(SHEET.pengingat).filter(function (p) {
    const b = Number(p.berikutnya) || 0;
    return p.id_pengguna === ctx.user.id && p.status === 'AKTIF' && b && b <= now + 60000 && now - b < 6 * 3600e3;
  }).map(function (p) { return { id: p.id_pengingat, judul: String(p.judul), berikutnya: Number(p.berikutnya), jam: p.jam }; });
  return ok_({ list: list, uji: uji, sapa: sapaTeks_(usersMap_()[ctx.user.id] || {}) });
}
/** Sapaan sesuai peran: suami → "Pak Dani", istri → "Bu Sinta" (tanpa nama: "Ibu"), anak → nama saja */
function sapaTeks_(u) {
  const n = String(u.panggilan || '').trim(), s = String(u.sapaan || '').trim(), h = String(u.hubungan || '').toUpperCase();
  let hormat = s ? (s === 'NAMA' ? '' : s) : h === 'SUAMI' ? 'Pak' : h === 'ISTRI' ? 'Bu' : (h === 'ANAK' || u.peran === 'ANAK') ? '' : null;
  if (hormat === null) return n;
  if (!n) return hormat === 'Bu' ? 'Ibu' : hormat === 'Pak' ? 'Bapak' : '';
  return hormat ? hormat + ' ' + n : n;
}

/** Pemicu tiap menit: bunyikan pengingat yang jatuh tempo (diulang sampai pengguna membuka/mematikan) */
function cekPengingat() {
  if (!CONFIG.SPREADSHEET_ID) return;
  const props = PropertiesService.getScriptProperties();
  const now = Date.now(), next = Number(props.getProperty('PENGINGAT_NEXT') || 0);
  if (next && now < next) return;                    // belum ada yang jatuh tempo → selesai cepat
  withLock_(function () {
    let t;
    try { t = readTable_(SHEET.pengingat); } catch (e) { props.setProperty('PENGINGAT_NEXT', String(now + 3600e3)); return; }
    const at = aturanMap_(), off = offsetZona_();
    const angka = function (v, d) { return v !== undefined && v !== '' && isFinite(Number(v)) ? Number(v) : d; };
    const maks = angka(at.alarm_ulang, 5), jeda = angka(at.alarm_jeda_menit, 1) * 60000;
    let minNext = now + 6 * 3600e3, ubah = false, maju = false;
    const kirim = {};
    t.rows.forEach(function (r) {
      if (r[t.col.status] !== 'AKTIF') return;
      const p = rowObj_(t, r);
      let b = Number(p.berikutnya) || 0;
      if (!b) {
        b = jadwalBerikutnya_(p, now - 60000, off) || 0;
        if (!b) { r[t.col.status] = 'SELESAI'; ubah = maju = true; return; }
        r[t.col.berikutnya] = b; ubah = true;
      }
      if (b > now) { minNext = Math.min(minNext, b); return; }
      const ke = Number(p.bunyi_ke) || 0, last = Number(p.terakhir_bunyi) || 0;
      if (ke >= maks || now - b > 6 * 3600e3) {
        const nb = jadwalBerikutnya_(p, Math.max(b, now) + 1000, off);
        if (nb) { r[t.col.berikutnya] = nb; minNext = Math.min(minNext, nb); } else r[t.col.status] = 'SELESAI';
        r[t.col.bunyi_ke] = 0; r[t.col.terakhir_bunyi] = ''; ubah = maju = true;
        return;
      }
      if (now - last >= jeda - 5000) {
        kirim[p.id_pengguna] = true;
        r[t.col.bunyi_ke] = ke + 1; r[t.col.terakhir_bunyi] = now; ubah = true;
        minNext = Math.min(minNext, now + jeda);
      } else minNext = Math.min(minNext, last + jeda);
    });
    if (ubah) writeTable_(t);
    if (maju) bumpMaster_();
    if (Object.keys(kirim).length) {
      try { kirimPush_(kirim); } catch (e) { appendRows_(SHEET.logAktivitas, [[iso_(new Date()), 'SYSTEM', 'PUSH_GAGAL', String(e.message).slice(0, 300)]]); }
    }
    props.setProperty('PENGINGAT_NEXT', String(minNext - 5000));
  });
}

/**
 * JALANKAN SEKALI setelah memasang versi 1.0.12:
 * memasang pemicu pengingat tiap menit + membuat kunci notifikasi + memastikan sheet baru ada.
 */
function pasangPengingat() {
  migrasiData();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'cekPengingat') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('cekPengingat').timeBased().everyMinutes(1).create();
  PropertiesService.getScriptProperties().setProperty('PENGINGAT_NEXT', '0');
  try {
    const v = vapid_();
    Logger.log('✅ Pemicu pengingat terpasang (tiap 1 menit). Kunci notifikasi siap: ' + v.pub.slice(0, 16) + '…');
  } catch (e) {
    Logger.log('⚠️ Pemicu terpasang, tetapi notifikasi HP belum bisa dipakai: ' + e.message);
  }
  Logger.log('   Lanjut: Deploy → Manage deployments → Edit → Version: New version → Deploy.');
}

function pastikanSheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (sh) return false;
  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, KOLOM[name].length).setValues([KOLOM[name]]).setFontWeight('bold').setBackground('#008069').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), KOLOM[name].length).setNumberFormat('@');
  (KOLOM_ANGKA[name] || []).forEach(function (k) { sh.getRange(2, KOLOM[name].indexOf(k) + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('0'); });
  return true;
}
function migrasiV4_() {
  const hasil = [];
  [SHEET.typo, SHEET.aturan, SHEET.ingatan, SHEET.pengingat, SHEET.push].forEach(function (n) { if (pastikanSheet_(n)) hasil.push('sheet ' + n + ' dibuat'); });
  // Aturan: tambahkan kunci yang belum ada (nilai yang sudah Anda setel tidak diubah)
  const ta = readTable_(SHEET.aturan), ada = {};
  ta.rows.forEach(function (r) { ada[String(r[0]).trim()] = true; });
  const baruA = SEED_ATURAN.filter(function (x) { return !ada[x[0]]; });
  if (baruA.length) { appendRows_(SHEET.aturan, baruA); hasil.push(baruA.length + ' aturan parser'); }
  const tt = readTable_(SHEET.typo), adaT = {}, now = Date.now(), nowIso = iso_(new Date());
  tt.rows.forEach(function (r) { adaT[String(r[0]).trim().toLowerCase()] = true; });
  const baruT = SEED_TYPO.filter(function (x) { return !adaT[x[0]]; }).map(function (x) { return [x[0], x[1], 'BAWAAN', 'SYSTEM', 0, nowIso, true, now]; });
  if (baruT.length) { appendRows_(SHEET.typo, baruT); hasil.push(baruT.length + ' kata typo bawaan'); }
  bumpMaster_();
  return hasil.length ? hasil : ['sheet 1.0.12 sudah ada'];
}

// ------------------------------------------------------------
// 1.0.13 — catatan fleksibel (alias) & sapaan nama
// ------------------------------------------------------------
/** Pengguna mengubah sapaannya sendiri lewat chat ("panggil saya Bang Dani") */
function opProfil_(user, op, t) {
  const x = op.data || {};
  const i = t.rows.findIndex(function (r) { return r[t.col.id_pengguna] === user.id; });
  if (i < 0) return { hasil: 'DITOLAK', pesan: 'Pengguna tidak ditemukan.' };
  const r = t.rows[i];
  if (t.col.panggilan === undefined) return { hasil: 'DITOLAK', pesan: 'Jalankan migrasiData dulu (kolom panggilan belum ada).' };
  if (x.panggilan !== undefined) r[t.col.panggilan] = String(x.panggilan || '').replace(/[^\p{L}\p{N} .'\-]/gu, '').trim().slice(0, 30);
  if (x.sapaan !== undefined) r[t.col.sapaan] = String(x.sapaan || '').replace(/[^\p{L} .\-]/gu, '').trim().slice(0, 15);
  t.dirty = true;
  return { hasil: 'OK' };
}
// ------------------------------------------------------------
// 1.0.15 — Penasihat Keuangan (pemicu, aturan, pertanyaan, pemetaan kategori, profil keluarga, riwayat)
// ------------------------------------------------------------
const SEED_ATURAN_PN = [['dasar_kebutuhan',50,'Persen awal kebutuhan'],['dasar_keinginan',30,'Persen awal keinginan'],['dasar_tabungan',20,'Persen awal tabungan'],['tanggungan_2',3,'Tambahan poin kebutuhan untuk 2 tanggungan (diambil dari keinginan)'],['tanggungan_3',6,'Tambahan poin untuk 3 tanggungan'],['tanggungan_4',10,'Tambahan poin untuk 4 tanggungan atau lebih'],['tabungan_dd_belum',25,'Persen tabungan bila dana darurat belum ada'],['tabungan_dd_sebagian',22,'Persen tabungan bila dana darurat baru sebagian'],['tabungan_dd_cukup',20,'Persen tabungan bila dana darurat sudah cukup'],['cicilan_tertampung',15,'Cicilan sampai persen ini dianggap sudah tertampung di kebutuhan'],['cicilan_peringatan',30,'Beri peringatan bila cicilan di atas persen ini'],['min_keinginan',5,'Batas bawah keinginan (%)'],['min_tabungan',10,'Batas bawah tabungan (%)'],['maks_kebutuhan',75,'Batas atas kebutuhan (%)'],['porsi_dana_darurat',60,'Persen jatah tabungan untuk dana darurat bila belum cukup'],['kali_dana_darurat',3,'Target dana darurat = sekian kali kebutuhan bulanan'],['pembulatan',1000,'Pembulatan rupiah']];
const SEED_PEMICU = ['mulai penasihat','penasihat keuangan','penasihat','saran keuangan','atur keuangan','bagi gaji','bagi pendapatan','bagi penghasilan','alokasi gaji','alokasi pendapatan','rencana keuangan','perencanaan keuangan','konsultasi keuangan','atur gaji','pembagian gaji','pembagian pendapatan','budgeting','kelola gaji','kelola keuangan','rencanakan keuangan','nasihat keuangan'];
const SEED_PERTANYAAN_PN = [
  ['pendapatan', 1, 'Berapa total pendapatan keluarga per bulan?', 'Contoh: **5jt**', ''],
  ['tanggungan', 2, 'Berapa orang yang jadi tanggungan?', 'Hitung semua yang dibiayai, termasuk diri sendiri.', '1,2,3,4+'],
  ['cicilan', 3, 'Total cicilan per bulan berapa?', 'KPR, motor, pinjaman, kartu kredit, paylater.', 'Tidak ada,500rb,1jt'],
  ['dana_darurat', 4, 'Dana darurat sudah ada?', 'Cukup = minimal 3× kebutuhan sebulan.', 'Belum,Sebagian,Cukup'],
  ['tujuan', 5, 'Tujuan utama menabung apa? Boleh lebih dari satu.', 'Ketuk salah satu, atau ketik langsung, misalnya **motor 15jt 24 bulan**.', 'Kendaraan,Rumah/tanah,Pendidikan,Ibadah,Usaha,Lunasi utang']
];
function tebakKelompokPn_(nama) {
  const s = String(nama || '').toLowerCase();
  if (/tabung|investasi|nabung|emas|deposito|reksa/.test(s)) return 'TABUNGAN';
  if (/makan|bulanan|dapur|tagihan|listrik|air|pulsa|paket data|transport|kendaraan|bensin|pendidikan|sekolah|kesehatan|obat|rumah|keluarga|anak|sosial|ibadah|cicilan|kredit|angsuran|utang|hutang|pinjaman|sewa|kos|kontrakan|asuransi|zakat/.test(s)) return 'KEBUTUHAN';
  if (/jajan|online|pakaian|hiburan|rekreasi|hobi|lain|nongkrong|kopi|game|liburan|kecantikan|perawatan/.test(s)) return 'KEINGINAN';
  return '';
}
/** Isi sheet penasihat bila masih kosong (aman diulang) */
function isiPenasihat_() {
  const hasil = [];
  const now = iso_(new Date());
  const isi = function (name, rows) { if (!rows.length) return; const t = readTable_(name); if (t.rows.length) return; appendRows_(name, rows); hasil.push(rows.length + ' baris ' + name); };
  isi(SHEET.aturanPn, SEED_ATURAN_PN.map(function (x) { return [x[0], x[1], x[2]]; }));
  isi(SHEET.pemicu, SEED_PEMICU.map(function (f) { return [f, 'PENASIHAT', 'BAWAAN', 'SYSTEM', true, now]; }));
  isi(SHEET.tanyaPn, SEED_PERTANYAAN_PN.map(function (x) { return x.concat([true]); }));
  const kat = amanTabel_(SHEET.kategori).filter(function (k) { return k.jenis === 'KELUAR'; });
  isi(SHEET.petaPn, kat.map(function (k) { return [k.id_kategori, k.nama, tebakKelompokPn_(k.nama), now]; }).filter(function (r) { return r[2]; }));
  return hasil;
}
function migrasiV7_() {
  const hasil = [];
  [SHEET.pemicu, SHEET.aturanPn, SHEET.tanyaPn, SHEET.petaPn, SHEET.profilPn, SHEET.riwayatPn].forEach(function (n) { if (pastikanSheet_(n)) hasil.push('sheet ' + n + ' dibuat'); });
  isiPenasihat_().forEach(function (h) { hasil.push(h); });
  bumpMaster_();
  return hasil.length ? hasil : ['sheet penasihat sudah ada'];
}
function jsonAman_(v, d) { if (v === '' || v === null || v === undefined) return d; if (typeof v === 'object') return v; try { return JSON.parse(String(v)); } catch (e) { return d; } }
function masterPenasihat_() {
  const aturan = {};
  amanTabel_(SHEET.aturanPn).forEach(function (x) { if (x.kunci) aturan[String(x.kunci).trim()] = String(x.nilai).trim(); });
  const pemicu = amanTabel_(SHEET.pemicu).filter(function (x) { return x.frasa && truthy_(x.aktif); }).map(function (x) { return String(x.frasa).trim().toLowerCase(); });
  const pertanyaan = amanTabel_(SHEET.tanyaPn).filter(function (x) { return x.kunci; }).map(function (x) {
    return { kunci: String(x.kunci).trim(), urutan: Number(x.urutan) || 0, teks: String(x.teks || ''), keterangan: String(x.keterangan || ''), pilihan: String(x.pilihan || ''), aktif: truthy_(x.aktif) };
  });
  const pemetaan = {};
  amanTabel_(SHEET.petaPn).forEach(function (x) { if (x.id_kategori && x.kelompok) pemetaan[x.id_kategori] = String(x.kelompok).toUpperCase(); });
  const pr = amanTabel_(SHEET.profilPn).find(function (x) { return x.id_profil === 'KELUARGA'; });
  const profil = pr ? { id_profil: 'KELUARGA', pendapatan: Number(pr.pendapatan) || 0, tanggungan: Number(pr.tanggungan) || 1, cicilan: Number(pr.cicilan) || 0,
    dana_darurat: String(pr.dana_darurat || 'BELUM'), tujuan: jsonAman_(pr.tujuan, []), ekstra_tabungan: Number(pr.ekstra_tabungan) || 0, lain: jsonAman_(pr.lain, {}),
    rencana_tertunda: jsonAman_(pr.rencana_tertunda, null), berlaku_mulai: tgl_(pr.berlaku_mulai) || String(pr.berlaku_mulai || '') } : null;
  return { aturan: aturan, pemicu: pemicu, pertanyaan: pertanyaan, pemetaan: pemetaan, profil: profil };
}
function opProfilPn_(user, x) {
  const t = readTable_(SHEET.profilPn);
  const obj = { pendapatan: Math.round(Number(x.pendapatan) || 0), tanggungan: Math.max(1, Math.round(Number(x.tanggungan) || 1)), cicilan: Math.round(Number(x.cicilan) || 0),
    dana_darurat: ['BELUM', 'SEBAGIAN', 'CUKUP'].indexOf(x.dana_darurat) > -1 ? x.dana_darurat : 'BELUM', tujuan: JSON.stringify(x.tujuan || []).slice(0, 5000),
    ekstra_tabungan: Number(x.ekstra_tabungan) || 0, lain: JSON.stringify(x.lain || {}).slice(0, 2000), rencana_tertunda: x.rencana_tertunda ? JSON.stringify(x.rencana_tertunda).slice(0, 8000) : '',
    berlaku_mulai: /^\d{4}-\d{2}-\d{2}$/.test(String(x.berlaku_mulai || '')) ? x.berlaku_mulai : '', diubah_oleh: user.id, diubah_pada: iso_(new Date()) };
  const i = t.rows.findIndex(function (r) { return r[t.col.id_profil] === 'KELUARGA'; });
  if (i > -1) Object.keys(obj).forEach(function (k) { t.rows[i][t.col[k]] = obj[k]; });
  else t.rows.push(objToRow_(t, Object.assign({ id_profil: 'KELUARGA' }, obj)));
  t.dirty = true; writeTable_(t);
  return { hasil: 'OK' };
}
function opRiwayatPn_(user, x, now) {
  const id = String(x.id_riwayat || '');
  if (!/^PNR-/.test(id)) return { hasil: 'DITOLAK', pesan: 'ID riwayat tidak valid.' };
  const t = readTable_(SHEET.riwayatPn);
  const i = t.rows.findIndex(function (r) { return r[t.col.id_riwayat] === id; });
  if (i > -1) { if (x.status) { t.rows[i][t.col.status] = String(x.status).slice(0, 20); t.dirty = true; writeTable_(t); } return { hasil: 'OK' }; }
  appendRows_(SHEET.riwayatPn, [objToRow_(t, { id_riwayat: id, waktu: iso_(new Date()), id_pengguna: user.id, sumber: String(x.sumber || 'SESI').slice(0, 20), status: String(x.status || 'SARAN').slice(0, 20),
    pendapatan: Number(x.pendapatan) || 0, kebutuhan: Number(x.kebutuhan) || 0, keinginan: Number(x.keinginan) || 0, tabungan: Number(x.tabungan) || 0,
    rincian: JSON.stringify(x.rincian || []).slice(0, 3000), profil: JSON.stringify(x.profil || {}).slice(0, 5000), diterima_server: now })]);
  return { hasil: 'OK' };
}
function opPemicu_(user, x) {
  const f = String(x.frasa || '').trim().toLowerCase().slice(0, 60);
  if (f.length < 3) return { hasil: 'DITOLAK', pesan: 'Frasa terlalu pendek.' };
  const ada = amanTabel_(SHEET.pemicu).some(function (r) { return String(r.frasa).trim().toLowerCase() === f; });
  if (!ada) appendRows_(SHEET.pemicu, [[f, 'PENASIHAT', 'PENGGUNA', user.id, true, iso_(new Date())]]);
  return { hasil: 'OK' };
}
function opPemetaan_(x) {
  const k = ['KEBUTUHAN', 'KEINGINAN', 'TABUNGAN', 'ABAIKAN'].indexOf(String(x.kelompok)) > -1 ? String(x.kelompok) : '';
  if (!x.id_kategori || !k) return { hasil: 'DITOLAK', pesan: 'Data tidak lengkap.' };
  const t = readTable_(SHEET.petaPn);
  const kat = amanTabel_(SHEET.kategori).find(function (r) { return r.id_kategori === x.id_kategori; }) || {};
  const i = t.rows.findIndex(function (r) { return r[t.col.id_kategori] === x.id_kategori; });
  const obj = { id_kategori: x.id_kategori, nama_kategori: kat.nama || '', kelompok: k, diubah_pada: iso_(new Date()) };
  if (i > -1) t.rows[i] = objToRow_(t, obj); else t.rows.push(objToRow_(t, obj));
  t.dirty = true; writeTable_(t);
  return { hasil: 'OK' };
}

// ---- 1.0.14: catatan perubahan pengaturan (siapa, apa, kapan) & target tabungan ----
function rupiah_(n) { return 'Rp' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function namaUser_(user) { const u = usersMap_()[user.id] || {}; return u.nama_tampilan || user.username || user.id; }
/** Baris Log_Pengaturan untuk perubahan lewat sinkron (dibaca SEBELUM data diubah agar nilai lama tercatat) */
function catatAtur_(user, apa, t, kunci, x, fnDetail) {
  try {
    if (!x || !x[kunci]) return null;
    const r = t.rows.find(function (rr) { return rr[t.col[kunci]] === x[kunci]; });
    const lama = r ? (function () { const o = {}; t.head.forEach(function (h, i) { o[h] = r[i]; }); return o; })() : null;
    return [iso_(new Date()), user.id, namaUser_(user), apa, String(fnDetail(x, lama)).slice(0, 300)];
  } catch (e) { return null; }
}
function logAturLangsung_(user, apa, detail) {
  try { appendRows_(SHEET.logPengaturan, [[iso_(new Date()), user.id, namaUser_(user), apa, String(detail).slice(0, 300)]]); } catch (e) { /* sebelum migrasi */ }
}
function opTarget_(user, op, t, now) {
  const x = op.data || {};
  const id = String(x.id_target || '');
  if (!/^TGT-/.test(id)) return { hasil: 'DITOLAK', pesan: 'ID target tidak valid.' };
  const obj = { nama: String(x.nama || 'Tabungan').slice(0, 40), nominal: Math.round(Number(x.nominal) || 0), tenggat: /^\d{4}-\d{2}-\d{2}$/.test(String(x.tenggat)) ? x.tenggat : '',
    id_dompet: String(x.id_dompet || ''), aktif: x.aktif === undefined ? true : truthy_(x.aktif), diubah_pada: iso_(new Date()), diterima_server: now };
  const i = t.rows.findIndex(function (r) { return r[t.col.id_target] === id; });
  if (i > -1) Object.keys(obj).forEach(function (k) { t.rows[i][t.col[k]] = obj[k]; });
  else t.rows.push(objToRow_(t, Object.assign({ id_target: id, id_pengguna: user.id, dibuat_pada: iso_(new Date()) }, obj)));
  t.dirty = true;
  return { hasil: 'OK' };
}
function migrasiV6_() {
  const hasil = [];
  [SHEET.target, SHEET.logPengaturan].forEach(function (n) { if (pastikanSheet_(n)) hasil.push('sheet ' + n + ' dibuat'); });
  bumpMaster_();
  return hasil.length ? hasil : ['sheet 1.0.14 sudah ada'];
}
function hubungan_(v) { v = String(v || '').toUpperCase(); return ['KEPALA', 'SUAMI', 'ISTRI', 'ANAK', 'LAINNYA'].indexOf(v) > -1 ? v : ''; }
function barisAlias_() { return SEED_ALIAS.map(function (x) { return [x[0], x[1], x[2], 'BAWAAN', true]; }); }
/** Tambah kolom baru di ujung kanan bila belum ada judulnya (data lama tidak berubah) */
function pastikanKolom_(name) {
  const sh = getSheet_(name), w = KOLOM[name].length;
  const head = sh.getRange(1, 1, 1, w).getValues()[0].map(String);
  let n = 0;
  KOLOM[name].forEach(function (k, i) {
    if (head[i] !== k && head.indexOf(k) < 0 && !head[i]) {
      sh.getRange(1, i + 1).setValue(k).setFontWeight('bold').setBackground('#008069').setFontColor('#ffffff');
      sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@'); n++;
    }
  });
  delete _TBL[name];
  return n;
}
function migrasiV5_() {
  const hasil = [];
  [SHEET.alias, SHEET.logPengaturan].forEach(function (n) { if (pastikanSheet_(n)) hasil.push('sheet ' + n + ' dibuat'); });
  [SHEET.ingatan, SHEET.pengguna].forEach(function (n) { const k = pastikanKolom_(n); if (k) hasil.push(k + ' kolom baru di ' + n); });
  const ta = readTable_(SHEET.alias), ada = {};
  ta.rows.forEach(function (r) { ada[String(r[0]).trim().toLowerCase()] = true; });
  const baru = barisAlias_().filter(function (x) { return !ada[x[0]]; });
  if (baru.length) { appendRows_(SHEET.alias, baru); hasil.push(baru.length + ' singkatan catatan'); }
  bumpMaster_();
  return hasil.length ? hasil : ['sheet 1.0.13 sudah ada'];
}
// Singkatan catatan bawaan: [alias, kata baku, kelompok]. Tambahkan baris sendiri di sheet "Alias_Catatan".
// Kelompok: JENIS (rekening, pln, telepon), LEMBAGA (bank/e-wallet), PEMILIK (istri, ayah), UMUM (boleh tidak disebut).
const SEED_ALIAS = [['rek','rekening','JENIS'], ['norek','rekening','JENIS'], ['rekn','rekening','JENIS'], ['reking','rekening','JENIS'], ['no','nomor','UMUM'], ['nmr','nomor','UMUM'], ['nomer','nomor','UMUM'], ['nmor','nomor','UMUM'], ['nomr','nomor','UMUM'], ['nombor','nomor','UMUM'], ['listrik','pln','JENIS'], ['token','pln','JENIS'], ['meteran','pln','JENIS'], ['idpel','pln','JENIS'], ['hp','telepon','JENIS'], ['telp','telepon','JENIS'], ['telpon','telepon','JENIS'], ['handphone','telepon','JENIS'], ['nohp','telepon','JENIS'], ['wa','telepon','JENIS'], ['whatsapp','telepon','JENIS'], ['ponsel','telepon','JENIS'], ['pass','password','JENIS'], ['pw','password','JENIS'], ['sandi','password','JENIS'], ['katasandi','password','JENIS'], ['mail','email','JENIS'], ['surel','email','JENIS'], ['gmail','email','JENIS'], ['almt','alamat','JENIS'], ['pdam','pdam','JENIS'], ['wi-fi','wifi','JENIS'], ['pin','pin','JENIS'], ['ktp','ktp','JENIS'], ['nik','nik','JENIS'], ['npwp','npwp','JENIS'], ['kk','kk','JENIS'], ['bpjs','bpjs','JENIS'], ['stnk','stnk','JENIS'], ['bpkb','bpkb','JENIS'], ['nopol','plat','JENIS'], ['username','akun','JENIS'], ['user','akun','JENIS'], ['kartu','kartu','JENIS'], ['polis','polis','JENIS'], ['va','va','JENIS'], ['pelanggan','pelanggan','JENIS'], ['kode','kode','JENIS'], ['brimo','bri','LEMBAGA'], ['bca','bca','LEMBAGA'], ['bni','bni','LEMBAGA'], ['mdr','mandiri','LEMBAGA'], ['bsi','bsi','LEMBAGA'], ['btn','btn','LEMBAGA'], ['cimb','cimb','LEMBAGA'], ['permata','permata','LEMBAGA'], ['danamon','danamon','LEMBAGA'], ['jago','jago','LEMBAGA'], ['seabank','seabank','LEMBAGA'], ['blu','blu','LEMBAGA'], ['jenius','jenius','LEMBAGA'], ['ocbc','ocbc','LEMBAGA'], ['muamalat','muamalat','LEMBAGA'], ['bjb','bjb','LEMBAGA'], ['bpd','bpd','LEMBAGA'], ['dana','dana','LEMBAGA'], ['ovo','ovo','LEMBAGA'], ['gopay','gopay','LEMBAGA'], ['spay','shopeepay','LEMBAGA'], ['linkaja','linkaja','LEMBAGA'], ['tsel','telkomsel','LEMBAGA'], ['im3','indosat','LEMBAGA'], ['xl','xl','LEMBAGA'], ['smartfren','smartfren','LEMBAGA'], ['indihome','indihome','LEMBAGA'], ['biznet','biznet','LEMBAGA'], ['aku','saya','PEMILIK'], ['ku','saya','PEMILIK'], ['sendiri','saya','PEMILIK'], ['gue','saya','PEMILIK'], ['gw','saya','PEMILIK'], ['sy','saya','PEMILIK'], ['istriku','istri','PEMILIK'], ['bini','istri','PEMILIK'], ['nyonya','istri','PEMILIK'], ['suamiku','suami','PEMILIK'], ['bapak','ayah','PEMILIK'], ['papa','ayah','PEMILIK'], ['papah','ayah','PEMILIK'], ['abah','ayah','PEMILIK'], ['abi','ayah','PEMILIK'], ['bapa','ayah','PEMILIK'], ['bunda','ibu','PEMILIK'], ['mama','ibu','PEMILIK'], ['mamah','ibu','PEMILIK'], ['umi','ibu','PEMILIK'], ['emak','ibu','PEMILIK'], ['mamak','ibu','PEMILIK'], ['anak','anak','PEMILIK'], ['kak','kakak','PEMILIK'], ['adek','adik','PEMILIK'], ['dek','adik','PEMILIK'], ['nenek','nenek','PEMILIK'], ['kakek','kakek','PEMILIK'], ['mertua','mertua','PEMILIK']];

// Bobot & ambang pembaca chat — boleh diubah langsung di sheet "Aturan_Parser"
const SEED_ATURAN = [
  ['bobot_kata_tanya', '3', 'Bobot kata tanya (berapa, apa, kapan, mana, ...) saat menilai apakah pesan adalah PERTANYAAN'],
  ['bobot_tanda_tanya', '2', 'Bobot tanda tanya "?" (tidak wajib ada)'],
  ['bobot_frasa_kategori', '5', 'Bobot frasa "termasuk apa", "masuk kategori apa" → menjawab kategori sebuah kata'],
  ['bobot_frasa_harga', '4', 'Bobot frasa "harga ... berapa" → menjawab harga dari catatan'],
  ['bobot_nominal', '3', 'Bobot adanya nominal (25rb, Rp25.000) saat menilai apakah pesan adalah TRANSAKSI'],
  ['bobot_kata_kerja', '2', 'Bobot kata kerja transaksi di awal kalimat (beli, bayar, isi, ...)'],
  ['ambang_tanya', '3', 'Skor minimal agar pesan dianggap pertanyaan (pertanyaan tidak pernah dicatat sebagai transaksi)'],
  ['typo_ambang_yakin', '0.85', 'Skor kemiripan (0–1) agar salah ketik langsung dibetulkan tanpa bertanya'],
  ['typo_ambang_ragu', '0.65', 'Skor kemiripan minimal untuk menanyakan "Maksudnya: ...?" (di bawah ini kata dianggap kata baru)'],
  ['typo_min_huruf', '3', 'Panjang kata minimal yang diperiksa salah ketiknya'],
  ['ingatan_ambang', '0.66', 'Kecocokan minimal label ingatan saat ditanya (contoh: "no pln saya" ↔ "nomor listrik")'],
  ['alarm_ulang', '5', 'Berapa kali notifikasi pengingat diulang bila HP belum dibuka'],
  ['alarm_jeda_menit', '1', 'Jeda antar-ulangan notifikasi (menit)'],
  ['alarm_tunda_menit', '10', 'Lama tombol "Tunda" (menit)']
];
// Singkatan/salah ketik umum (sheet "Kamus_Typo" — jawaban "Ya" pada konfirmasi typo ikut tersimpan di sini)
const SEED_TYPO = [['byr', 'bayar'], ['bayr', 'bayar'], ['blnja', 'belanja'], ['blanja', 'belanja'], ['blj', 'belanja'], ['bnsin', 'bensin'], ['bensn', 'bensin'],
  ['mkn', 'makan'], ['mkan', 'makan'], ['mnum', 'minum'], ['jjn', 'jajan'], ['lstrik', 'listrik'], ['lsitrik', 'listrik'], ['pls', 'pulsa'], ['plsa', 'pulsa'],
  ['tabngan', 'tabungan'], ['tbgn', 'tabungan'], ['nbung', 'nabung'], ['pengluaran', 'pengeluaran'], ['pngeluaran', 'pengeluaran'], ['pemsukan', 'pemasukan'],
  ['trnsfer', 'transfer'], ['trf', 'transfer'], ['sldo', 'saldo'], ['angaran', 'anggaran'], ['laporn', 'laporan'], ['ingtkan', 'ingatkan'], ['ingatkn', 'ingatkan']];

// ------------------------------------------------------------
// 12. DATA BAWAAN — kategori & kamus kata kunci (Lampiran A PRD)
// ------------------------------------------------------------
// [id, nama, jenis, ikon, warna]
const SEED_KATEGORI = [
  ['KAT-JAJAN', 'Jajan', 'KELUAR', '🍩', '#F59E0B'],
  ['KAT-MAKAN', 'Makan', 'KELUAR', '🍛', '#F97316'],
  ['KAT-BULANAN', 'Kebutuhan Bulanan', 'KELUAR', '🛒', '#008069'],
  ['KAT-ONLINE', 'Belanja Online', 'KELUAR', '🛍️', '#EE4D2D'],
  ['KAT-TAGIHAN', 'Tagihan & Langganan Rumah', 'KELUAR', '🧾', '#0EA5E9'],
  ['KAT-PULSA', 'Pulsa & Paket Data', 'KELUAR', '📱', '#6366F1'],
  ['KAT-TRANSPORT', 'Transportasi', 'KELUAR', '🛵', '#EAB308'],
  ['KAT-KENDARAAN', 'Perawatan Kendaraan', 'KELUAR', '🔧', '#64748B'],
  ['KAT-PENDIDIKAN', 'Pendidikan', 'KELUAR', '📚', '#8B5CF6'],
  ['KAT-KESEHATAN', 'Kesehatan', 'KELUAR', '💊', '#EF4444'],
  ['KAT-PAKAIAN', 'Pakaian & Perawatan Diri', 'KELUAR', '👕', '#EC4899'],
  ['KAT-RUMAH', 'Rumah Tangga & Perabot', 'KELUAR', '🏠', '#A16207'],
  ['KAT-SOSIAL', 'Sosial & Ibadah', 'KELUAR', '🤲', '#14B8A6'],
  ['KAT-HIBURAN', 'Hiburan & Rekreasi', 'KELUAR', '🎮', '#D946EF'],
  ['KAT-HOBI', 'Hobi', 'KELUAR', '🎣', '#0891B2'],
  ['KAT-KELUARGA', 'Keluarga & Anak', 'KELUAR', '👨‍👩‍👧', '#F43F5E'],
  ['KAT-LAIN', 'Lain-lain', 'KELUAR', '📦', '#94A3B8'],
  ['KAT-GAJI', 'Gaji', 'MASUK', '💼', '#16A34A'],
  ['KAT-USAHA', 'Usaha & Penjualan', 'MASUK', '🏪', '#22C55E'],
  ['KAT-BONUS', 'Bonus & Hadiah', 'MASUK', '🎁', '#10B981'],
  ['KAT-SAKU', 'Uang Saku', 'MASUK', '🪙', '#84CC16'],
  ['KAT-MASUKLAIN', 'Pemasukan Lain', 'MASUK', '➕', '#059669']
];

// Kata "belanja" saja TIDAK menentukan kategori (belanja mainan ≠ kebutuhan bulanan); yang jelas bulanan:
const KAMUS_BULANAN_BARU = ['belanja bulanan', 'belanja dapur', 'belanja pasar', 'belanja sayur', 'belanja sembako', 'belanja harian',
  'belanja mingguan', 'belanja kebutuhan', 'belanja rumah', 'kebutuhan dapur', 'kebutuhan rumah'];
// Kategori Hobi (juga dipakai migrasi untuk database lama)
const KAMUS_HOBI = ['hobi', 'hobby', 'mancing', 'memancing', 'pancing', 'pancingan', 'umpan', 'umpan pancing', 'joran', 'reel', 'senar pancing',
  'pemancingan', 'kolam pemancingan', 'burung', 'pakan burung', 'sangkar', 'kandang burung', 'voer', 'ikan hias', 'akuarium', 'aquarium',
  'aquascape', 'pakan ikan', 'tanaman hias', 'bibit tanaman', 'bibit bunga', 'pot bunga', 'pupuk tanaman', 'koleksi', 'action figure',
  'figure', 'gundam', 'lego', 'diecast', 'hot wheels', 'tamiya', 'kamera', 'lensa kamera', 'fotografi', 'gitar', 'senar gitar', 'alat musik',
  'drum', 'biola', 'lukis', 'melukis', 'cat lukis', 'kanvas', 'kuas lukis', 'rajut', 'benang rajut', 'sulam', 'futsal', 'sewa lapangan',
  'badminton', 'bulutangkis', 'shuttlecock', 'kok badminton', 'raket', 'sepak bola', 'sepatu bola', 'gowes', 'sepeda gunung', 'sepeda lipat',
  'aksesoris sepeda', 'gym', 'fitness', 'member gym', 'yoga', 'camping', 'kemah', 'naik gunung', 'pendakian', 'drone', 'batu akik',
  'komik', 'manga', 'novel'];

// Kata belanja online / e-commerce (juga dipakai migrasi untuk database lama)
const KAMUS_ONLINE = ['belanja online', 'beli online', 'pesan online', 'order online', 'online shop', 'olshop', 'ol shop', 'onlineshop',
  'e-commerce', 'ecommerce', 'e commerce', 'marketplace', 'checkout', 'check out', 'chekout', 'cekout', 'ceckout', 'checkot',
  'shopee', 'lazada', 'tokopedia', 'tokped', 'tiktok shop', 'tiktokshop', 'tik tok shop', 'blibli', 'bukalapak', 'zalora', 'shein',
  'aliexpress', 'amazon', 'sociolla', 'jd.id', 'bhinneka', 'ongkir', 'ongkos kirim', 'paket cod', 'bayar cod', 'cod'];
const SEED_KAMUS = {
  'KAT-JAJAN': ['jajan', 'ngemil', 'cemilan', 'camilan', 'snack', 'kopi', 'kopi susu', 'es kopi', 'es teh', 'teh botol', 'es jeruk', 'jus', 'boba', 'thai tea', 'minuman', 'gorengan', 'pentol', 'cilok', 'seblak', 'batagor', 'siomay', 'cireng', 'martabak', 'terang bulan', 'roti', 'kue', 'donat', 'es krim', 'permen', 'coklat', 'cokelat', 'keripik', 'kerupuk', 'amplang', 'pisang goreng', 'roti bakar', 'sosis bakar', 'telur gulung', 'pop ice', 'minuman dingin', 'wedang', 'kopi kenangan', 'janji jiwa'],
  'KAT-MAKAN': ['makan', 'makan siang', 'makan malam', 'sarapan', 'nasi', 'nasi kuning', 'nasi padang', 'nasi goreng', 'mie ayam', 'bakso', 'soto', 'soto banjar', 'ayam geprek', 'ayam penyet', 'pecel lele', 'ikan bakar', 'lalapan', 'warung makan', 'rumah makan', 'warteg', 'katering', 'catering', 'gofood', 'grabfood', 'shopeefood', 'shopee food', 'lauk', 'prasmanan'],
  'KAT-ONLINE': KAMUS_ONLINE,
  'KAT-BULANAN': KAMUS_BULANAN_BARU.concat(['beras', 'minyak goreng', 'minyak', 'gula', 'garam', 'telur', 'tepung', 'mie instan', 'indomie', 'sayur', 'sayuran', 'bumbu', 'ikan', 'ayam potong', 'daging', 'tahu', 'tempe', 'susu', 'kopi bubuk', 'teh celup', 'gas', 'gas elpiji', 'tabung gas', 'galon', 'air galon', 'sabun', 'sabun mandi', 'sabun cuci', 'deterjen', 'rinso', 'pewangi', 'sampo', 'shampo', 'pasta gigi', 'odol', 'sikat gigi', 'tisu', 'popok', 'pampers', 'pembalut', 'minyak kayu putih', 'pasar', 'sembako', 'alfamart', 'indomaret', 'swalayan', 'supermarket']),
  'KAT-HOBI': KAMUS_HOBI,
  'KAT-TAGIHAN': ['listrik', 'token listrik', 'token', 'pln', 'pdam', 'air pdam', 'tagihan air', 'wifi', 'internet', 'indihome', 'biznet', 'iuran', 'iuran rt', 'iuran sampah', 'sampah', 'keamanan', 'bpjs', 'kontrakan', 'sewa rumah', 'kos', 'kost', 'cicilan', 'angsuran', 'kredit'],
  'KAT-PULSA': ['pulsa', 'paket data', 'kuota', 'paket internet', 'isi pulsa', 'telkomsel', 'xl', 'indosat', 'im3', 'tri', 'axis', 'smartfren', 'by.u'],
  'KAT-TRANSPORT': ['bensin', 'bbm', 'pertalite', 'pertamax', 'solar', 'dexlite', 'isi bensin', 'spbu', 'parkir', 'ojek', 'ojol', 'gojek', 'grab', 'maxim', 'angkot', 'taksi', 'travel', 'bus', 'tiket bus', 'tiket pesawat', 'pesawat', 'tiket kapal', 'kapal', 'speedboat', 'klotok', 'tol', 'e-toll', 'tiket kereta'],
  'KAT-KENDARAAN': ['servis', 'service', 'servis motor', 'servis mobil', 'ganti oli', 'oli', 'oli mesin', 'bengkel', 'ban', 'ganti ban', 'tambal ban', 'aki', 'ganti aki', 'busi', 'kampas rem', 'rantai', 'gir', 'sparepart', 'suku cadang', 'cuci motor', 'cuci mobil', 'salon mobil', 'pajak motor', 'pajak mobil', 'pajak kendaraan', 'stnk', 'perpanjang stnk', 'spion', 'lampu motor', 'helm'],
  'KAT-PENDIDIKAN': ['spp', 'uang sekolah', 'uang gedung', 'daftar ulang', 'buku', 'lks', 'alat tulis', 'atk', 'pulpen', 'pensil', 'seragam', 'sepatu sekolah', 'tas sekolah', 'les', 'kursus', 'bimbel', 'fotokopi', 'fotocopy', 'print', 'ngeprint', 'jilid', 'study tour', 'uang praktik', 'ujian', 'wisuda'],
  'KAT-KESEHATAN': ['obat', 'apotek', 'apotik', 'dokter', 'klinik', 'puskesmas', 'rumah sakit', 'rs', 'bidan', 'periksa', 'cek darah', 'lab', 'vitamin', 'suplemen', 'masker', 'rawat inap', 'kacamata', 'gigi', 'dokter gigi'],
  'KAT-PAKAIAN': ['baju', 'kaos', 'kemeja', 'celana', 'rok', 'gamis', 'jilbab', 'kerudung', 'hijab', 'mukena', 'sarung', 'peci', 'sepatu', 'sandal', 'sendal', 'kaos kaki', 'jaket', 'potong rambut', 'cukur', 'pangkas', 'salon', 'skincare', 'bedak', 'lipstik', 'parfum', 'deodoran', 'laundry', 'setrika'],
  'KAT-RUMAH': ['perabot', 'perabotan', 'kipas angin', 'lampu', 'bohlam', 'peralatan dapur', 'panci', 'wajan', 'piring', 'gelas', 'sapu', 'pel', 'ember', 'kasur', 'bantal', 'sprei', 'gorden', 'tukang', 'perbaikan rumah', 'renovasi', 'cat', 'semen', 'kunci', 'servis ac', 'servis kulkas', 'elektronik'],
  'KAT-SOSIAL': ['infaq', 'infak', 'sedekah', 'shodaqoh', 'zakat', 'zakat fitrah', 'kotak amal', 'amal', 'sumbangan', 'donasi', 'kondangan', 'nikahan', 'amplop', 'takziah', 'arisan', 'hadiah', 'kado', 'kurban', 'qurban', 'iuran masjid', 'iuran pengajian'],
  'KAT-HIBURAN': ['jalan-jalan', 'jalan jalan', 'rekreasi', 'wisata', 'liburan', 'piknik', 'bioskop', 'nonton', 'tiket masuk', 'kolam renang', 'game', 'top up game', 'diamond', 'voucher game', 'mainan', 'netflix', 'spotify', 'youtube premium', 'vidio', 'langganan aplikasi'],
  'KAT-KELUARGA': ['uang jajan anak', 'uang saku anak', 'kirim orang tua', 'kirim ortu', 'bantu saudara', 'susu anak', 'susu formula', 'mainan anak', 'pengasuh'],
  'KAT-GAJI': ['gaji', 'gajian', 'honor', 'honorarium', 'upah', 'tunjangan', 'sertifikasi', 'tpp', 'insentif', 'lembur', 'uang lembur', 'thr', 'gaji ke-13', 'gaji 13'],
  'KAT-USAHA': ['jual', 'jualan', 'hasil jualan', 'penjualan', 'omzet', 'omset', 'laku', 'dagangan', 'pesanan', 'orderan', 'untung', 'laba'],
  'KAT-BONUS': ['bonus', 'dapat hadiah', 'angpau', 'angpao', 'dikasih', 'diberi', 'rezeki', 'menang', 'doorprize', 'kado uang'],
  'KAT-SAKU': ['uang saku', 'dapat uang jajan', 'uang jajan dari', 'dikasih uang jajan', 'uang mingguan'],
  'KAT-MASUKLAIN': ['cashback', 'refund', 'pengembalian dana', 'kembalian', 'bunga', 'bagi hasil', 'dividen', 'piutang dibayar', 'dibayar', 'pinjaman masuk', 'transfer masuk', 'uang masuk', 'pemasukan']
};

// 1.0.21 — kosakata tambahan (juga dipakai migrasi v8 untuk database lama; hanya kata yang belum ada yang ditambahkan)
const KAMUS_V8 = {
  'KAT-MAKAN': ['sate', 'sate ayam', 'sate kambing', 'sate sapi', 'sate padang', 'sate taichan', 'sate madura', 'sate maranggi', 'gulai', 'gule', 'rendang', 'rawon', 'pecel', 'nasi pecel', 'gado-gado', 'gado gado', 'ketoprak', 'lontong', 'lontong sayur', 'lontong orari', 'ketupat', 'ketupat kandangan', 'kupat tahu', 'opor', 'opor ayam', 'nasi uduk', 'nasi campur', 'nasi rames', 'nasi bungkus', 'nasi kotak', 'nasi box', 'nasi lemak', 'nasi kebuli', 'nasi briyani', 'nasi bakar', 'nasi tim', 'nasi itik', 'nasi bekepor', 'nasi kari', 'mie', 'mie goreng', 'mi goreng', 'mie rebus', 'mie kuah', 'mie aceh', 'bakmi', 'yamien', 'kwetiau', 'kwetiau goreng', 'bihun goreng', 'capcay', 'cap cay', 'fuyunghai', 'ayam goreng', 'ayam bakar', 'ayam crispy', 'ayam cincane', 'ayam betutu', 'bebek goreng', 'bebek bakar', 'iga bakar', 'sop', 'sup', 'sop buntut', 'sop iga', 'sop ayam', 'sop konro', 'konro', 'coto', 'coto makassar', 'pallubasa', 'soto ayam', 'soto betawi', 'tongseng', 'tengkleng', 'rica-rica', 'rica rica', 'ikan goreng', 'pepes', 'pepes ikan', 'gangan', 'seafood', 'kepiting saus', 'bubur', 'bubur ayam', 'bubur kacang hijau', 'pempek', 'empek-empek', 'tekwan', 'laksa', 'gudeg', 'masakan padang', 'padang', 'ampera', 'pizza', 'burger', 'kfc', 'mcd', 'mcdonalds', 'hokben', 'richeese', 'solaria', 'steak', 'sushi', 'ramen', 'dimsum', 'shabu-shabu', 'all you can eat', 'ayce', 'bakaran', 'traktir', 'traktiran', 'makan bareng', 'makan di luar', 'makan pagi', 'lunch', 'dinner', 'breakfast', 'kantin', 'warung nasi', 'bukber', 'sahur', 'lauk pauk'],
  'KAT-JAJAN': ['es campur', 'es buah', 'es doger', 'es cendol', 'cendol', 'dawet', 'es dawet', 'es kelapa', 'kelapa muda', 'es tebu', 'es oyen', 'es pisang ijo', 'pisang ijo', 'es teler', 'es podeng', 'es goyang', 'es lilin', 'es teh manis', 'es susu', 'jasuke', 'jagung bakar', 'jagung rebus', 'kacang rebus', 'ubi goreng', 'singkong goreng', 'tahu goreng', 'tahu isi', 'tahu bulat', 'tahu crispy', 'tempe goreng', 'bakwan', 'risol', 'risoles', 'lemper', 'pastel', 'onde-onde', 'onde onde', 'klepon', 'serabi', 'surabi', 'kue cubit', 'pukis', 'kue pukis', 'bolu', 'brownies', 'cake', 'croissant', 'roti maryam', 'roti canai', 'sari roti', 'wafer', 'biskuit', 'chiki', 'chitato', 'taro', 'oreo', 'beng-beng', 'silverqueen', 'yakult', 'teh pucuk', 'air mineral', 'aqua botol', 'le minerale', 'minuman kaleng', 'susu kotak', 'milo', 'cimol', 'cilor', 'cilung', 'tela-tela', 'kentang goreng', 'french fries', 'corndog', 'sempol', 'pisang keju', 'pisang molen', 'molen', 'ote-ote', 'combro', 'misro', 'cakwe', 'kue lapis', 'kue basah', 'jajan pasar', 'kue kering', 'nastar', 'durian', 'mixue', 'chatime', 'starbucks', 'sbux', 'point coffee', 'fore', 'tomoro', 'excelso', 'es teh indonesia', 'teh poci', 'warkop', 'kafe', 'cafe', 'ngopi', 'nongkrong', 'angkringan', 'wedang ronde', 'susu jahe', 'bandrek', 'sekoteng', 'kopi hitam', 'kopi tubruk', 'cappuccino', 'latte', 'matcha', 'milkshake', 'smoothies', 'jajanan'],
  'KAT-BULANAN': ['kecap', 'saos', 'saus', 'sambal botol', 'terasi', 'merica', 'lada', 'ketumbar', 'kemiri', 'bawang', 'bawang merah', 'bawang putih', 'bawang bombay', 'cabai', 'cabe', 'cabe rawit', 'tomat', 'kentang', 'wortel', 'kol', 'kubis', 'kangkung', 'bayam', 'sawi', 'buncis', 'terong', 'jagung', 'kacang panjang', 'labu', 'timun', 'mentimun', 'tauge', 'jamur', 'ikan asin', 'teri', 'ikan teri', 'udang', 'cumi', 'cumi-cumi', 'daging sapi', 'daging ayam', 'ayam kampung', 'ayam fillet', 'sosis', 'nugget', 'frozen food', 'kornet', 'sarden', 'susu kental manis', 'skm', 'mentega', 'margarin', 'blue band', 'keju', 'roti tawar', 'selai', 'mayones', 'santan', 'kelapa parut', 'kopi sachet', 'gula pasir', 'gula merah', 'minyak sayur', 'beras merah', 'mie telor', 'bihun', 'buah', 'buah-buahan', 'pisang', 'apel', 'jeruk', 'semangka', 'mangga', 'anggur', 'melon', 'pepaya', 'salak', 'nanas', 'alpukat', 'buah naga', 'sabun cuci piring', 'sunlight', 'mama lemon', 'pembersih lantai', 'wipol', 'super pel', 'so klin', 'molto', 'downy', 'pemutih', 'bayclin', 'kapur barus', 'obat nyamuk', 'baygon', 'autan', 'tisu basah', 'kapas', 'cotton bud', 'sabun cair', 'pepsodent', 'korek api', 'lilin', 'plastik sampah', 'kantong plastik', 'kresek', 'aluminium foil', 'plastik wrap', 'sabun colek', 'spons', 'air isi ulang', 'isi ulang galon', 'elpiji', 'lpg', 'gas melon', 'gas 3 kg', 'bright gas', 'minyak tanah', 'arang', 'grosir', 'toko kelontong', 'warung sembako', 'pasar pagi', 'hypermart', 'lotte mart', 'transmart', 'superindo', 'kebutuhan pokok', 'bahan makanan', 'bahan masak', 'bahan dapur', 'sembilan bahan pokok'],
  'KAT-TAGIHAN': ['listrik pascabayar', 'pbb', 'pajak rumah', 'pajak bumi', 'tv kabel', 'first media', 'myrepublic', 'iconnet', 'ipl', 'iuran ipl', 'iuran kebersihan', 'iuran warga', 'iuran komplek', 'ronda', 'satpam', 'air bersih', 'sewa', 'kontrak rumah', 'kpr', 'cicilan rumah', 'cicilan motor', 'cicilan mobil', 'kredit motor', 'leasing', 'paylater', 'spaylater', 'kredivo', 'akulaku', 'pinjol', 'kartu kredit', 'tagihan kartu kredit', 'asuransi', 'premi', 'premi asuransi', 'bpjs kesehatan', 'bpjs ketenagakerjaan'],
  'KAT-PULSA': ['voucher internet', 'voucher data', 'kartu perdana', 'perdana', 'paket telepon', 'paket nelpon', 'paket sms', 'kuota internet', 'kuota belajar', 'kartu halo', 'simpati'],
  'KAT-TRANSPORT': ['ongkos', 'ongkos jalan', 'transport', 'pertamina', 'biosolar', 'grabbike', 'grabcar', 'gocar', 'goride', 'indrive', 'in drive', 'bluebird', 'damri', 'bis', 'tiket travel', 'krl', 'mrt', 'lrt', 'transjakarta', 'busway', 'kereta', 'kereta api', 'feri', 'ferry', 'pelabuhan', 'bandara', 'retribusi', 'sewa motor', 'sewa mobil', 'rental mobil', 'rental motor', 'becak', 'bentor', 'perahu', 'antar jemput', 'ongkos kapal'],
  'KAT-KENDARAAN': ['tune up', 'spooring', 'balancing', 'oli gardan', 'oli samping', 'filter oli', 'filter udara', 'kampas kopling', 'v-belt', 'van belt', 'cvt', 'radiator', 'air radiator', 'lampu mobil', 'kaca film', 'wiper', 'aksesoris motor', 'jok', 'cover jok', 'knalpot', 'velg', 'ban dalam', 'ban luar', 'pentil', 'isi angin', 'tambah angin', 'nitrogen', 'body repair', 'ketok magic', 'derek', 'kunci motor', 'asuransi kendaraan', 'ganti kampas'],
  'KAT-PENDIDIKAN': ['sekolah', 'kuliah', 'ukt', 'spp kuliah', 'uang kuliah', 'semester', 'skripsi', 'buku tulis', 'buku paket', 'buku pelajaran', 'kamus', 'penggaris', 'penghapus', 'rautan', 'spidol', 'krayon', 'crayon', 'pensil warna', 'map', 'kertas', 'kertas hvs', 'hvs', 'tinta printer', 'kalkulator', 'iuran sekolah', 'uang komite', 'komite', 'kegiatan sekolah', 'ekskul', 'ekstrakurikuler', 'pramuka', 'baju pramuka', 'seragam sekolah', 'les privat', 'les ngaji', 'tpa', 'tpq', 'mengaji', 'pesantren', 'pondok', 'buku cerita', 'kursus komputer', 'pelatihan', 'seminar', 'webinar', 'pendaftaran sekolah', 'ppdb', 'uang pangkal', 'buku gambar'],
  'KAT-KESEHATAN': ['paracetamol', 'panadol', 'bodrex', 'promag', 'antangin', 'tolak angin', 'obat batuk', 'obat flu', 'obat demam', 'obat sakit kepala', 'salep', 'betadine', 'plester', 'hansaplast', 'perban', 'termometer', 'tensi', 'cek kesehatan', 'medical check up', 'mcu', 'usg', 'imunisasi', 'vaksin', 'posyandu', 'fisioterapi', 'terapi', 'pijat', 'urut', 'tukang urut', 'bekam', 'rontgen', 'opname', 'operasi', 'kontrol dokter', 'resep', 'resep dokter', 'jamu', 'herbal', 'minyak angin', 'balsem', 'koyo', 'freshcare', 'kimia farma', 'k24', 'guardian', 'halodoc', 'alodokter', 'pil kb', 'suntik kb', 'test pack', 'behel', 'tambal gigi', 'cabut gigi', 'scaling gigi'],
  'KAT-PAKAIAN': ['pakaian', 'busana', 'polo', 'blus', 'blouse', 'dress', 'daster', 'piyama', 'baju tidur', 'celana jeans', 'jeans', 'celana pendek', 'legging', 'pakaian dalam', 'celana dalam', 'singlet', 'kaos dalam', 'topi', 'ikat pinggang', 'sabuk', 'tas', 'tas selempang', 'jam tangan', 'perhiasan', 'cincin', 'kalung', 'anting', 'gelang', 'sneakers', 'sandal jepit', 'jahit', 'jahit baju', 'permak', 'vermak', 'penjahit', 'kain', 'bahan baju', 'sabun muka', 'facial wash', 'facial', 'serum', 'toner', 'sunscreen', 'pelembab', 'moisturizer', 'body lotion', 'lotion', 'handbody', 'minyak rambut', 'pomade', 'cat rambut', 'creambath', 'smoothing', 'rebonding', 'barbershop', 'barber', 'cukur rambut', 'manicure', 'pedicure', 'eyeliner', 'maskara', 'foundation', 'make up', 'makeup', 'kosmetik', 'cushion', 'wardah', 'emina', 'somethinc', 'scarlett', 'laundry kiloan', 'dry clean', 'cuci baju', 'cuci setrika'],
  'KAT-RUMAH': ['meja', 'kursi', 'lemari', 'rak', 'sofa', 'karpet', 'tikar', 'keset', 'jam dinding', 'cermin', 'gantungan baju', 'hanger', 'jemuran', 'tali jemuran', 'rice cooker', 'magic com', 'magicom', 'blender', 'mixer', 'kompor', 'kompor gas', 'regulator', 'selang gas', 'kulkas', 'lemari es', 'mesin cuci', 'dispenser', 'setrika listrik', 'tv', 'televisi', 'kipas', 'ac', 'pompa air', 'mesin air', 'stop kontak', 'kabel', 'colokan', 'saklar', 'lampu led', 'senter', 'baterai', 'batre', 'paku', 'palu', 'obeng', 'pipa', 'paralon', 'kran', 'keran', 'genteng', 'seng', 'tukang bangunan', 'kayu', 'triplek', 'keramik', 'pasir', 'batu bata', 'bata', 'besi', 'kawat', 'cat tembok', 'kuas cat', 'sendok', 'garpu', 'mangkok', 'mangkuk', 'baskom', 'termos', 'teko', 'toples', 'rantang', 'tupperware', 'wadah', 'talenan', 'pisau', 'spatula', 'sutil', 'dandang', 'kukusan', 'tempat sampah', 'sapu lidi', 'kemoceng', 'pengki', 'sikat wc', 'sikat lantai', 'tirai', 'taplak', 'selimut', 'guling', 'handuk', 'servis tv', 'servis mesin cuci', 'pasang ac', 'cuci ac', 'sedot wc', 'tukang ledeng'],
  'KAT-SOSIAL': ['jumat berkah', 'santunan', 'anak yatim', 'yatim', 'panti asuhan', 'wakaf', 'fidyah', 'zakat mal', 'zakat profesi', 'bantuan', 'melayat', 'uang duka', 'sumbangan kematian', 'tahlilan', 'syukuran', 'selamatan', 'aqiqah', 'akikah', 'khitanan', 'sunatan', 'walimah', 'resepsi', 'hajatan', 'pernikahan', 'undangan', 'kado nikah', 'jenguk', 'besuk', 'parsel', 'hampers', 'patungan', 'urunan', 'kas rt', 'iuran 17an', 'tujuhbelasan', 'kerja bakti', 'persembahan', 'kolekte', 'perpuluhan'],
  'KAT-HIBURAN': ['karaoke', 'timezone', 'playground', 'wahana', 'kebun binatang', 'taman', 'pantai', 'tiket wisata', 'hotel', 'penginapan', 'villa', 'homestay', 'staycation', 'resort', 'konser', 'tiket konser', 'nobar', 'cgv', 'xxi', 'cinepolis', 'disney+', 'disney hotstar', 'prime video', 'viu', 'wetv', 'iqiyi', 'vision+', 'apple music', 'joox', 'youtube music', 'steam', 'playstation', 'rental ps', 'sewa ps', 'mobile legends', 'free fire', 'pubg', 'uc pubg', 'genshin', 'roblox', 'robux', 'battle pass', 'google play', 'voucher google play', 'itunes', 'app store', 'outbound', 'arung jeram', 'snorkeling', 'diving', 'billiard', 'biliar', 'bowling', 'trampolin', 'waterpark', 'water park', 'mall'],
  'KAT-KELUARGA': ['uang jajan adik', 'jajan anak', 'kirim ibu', 'kirim bapak', 'kirim mertua', 'kirim keluarga', 'transfer orang tua', 'bulanan orang tua', 'bulanan ortu', 'uang bulanan ortu', 'bantu keluarga', 'perlengkapan bayi', 'perlengkapan anak', 'baby sitter', 'babysitter', 'daycare', 'penitipan anak', 'asisten rumah tangga', 'gaji art', 'gaji pembantu', 'pembantu', 'mainan bayi', 'stroller', 'kereta bayi', 'botol susu', 'dot bayi', 'bubur bayi', 'mpasi', 'cerelac', 'diapers', 'tisu bayi', 'minyak telon', 'bedak bayi', 'ulang tahun anak', 'kado anak', 'baju anak', 'sepatu anak'],
  'KAT-GAJI': ['gaji pokok', 'gaji bulanan', 'rapel', 'rapelan', 'uang makan', 'tunjangan kinerja', 'tukin', 'tunkin', 'tpg', 'gaji guru', 'honor guru', 'komisi', 'uang jasa', 'gaji 14', 'gaji ke-14', 'pesangon', 'pensiun', 'uang pensiun', 'tunjangan hari raya'],
  'KAT-USAHA': ['hasil usaha', 'pendapatan usaha', 'penjualan online', 'jual online', 'jualan online', 'hasil panen', 'panen', 'jual hasil panen', 'terima sewa', 'dp masuk', 'pelunasan', 'customer bayar', 'pembeli bayar', 'jual pulsa', 'jual kue', 'jual barang', 'dagang', 'proyek', 'project', 'freelance'],
  'KAT-BONUS': ['hadiah uang', 'reward', 'menang lomba', 'juara', 'hadiah lomba', 'undian', 'giveaway', 'salam tempel'],
  'KAT-SAKU': ['uang saku dari', 'dikasih ayah', 'dikasih ibu', 'dikasih mama', 'dikasih papa', 'jajan dari', 'uang jajan mingguan'],
  'KAT-MASUKLAIN': ['pengembalian', 'retur', 'klaim asuransi', 'warisan', 'hibah', 'bunga bank', 'bunga deposito', 'deposito cair', 'pinjaman', 'dapat pinjaman', 'utang dibayar', 'hutang dibayar', 'subsidi', 'bansos', 'blt', 'pkh', 'bantuan pemerintah', 'beasiswa', 'kip', 'pip']
};
// Database baru langsung mendapat kosakata tambahan
Object.keys(KAMUS_V8).forEach(function (k) { if (SEED_KAMUS[k]) SEED_KAMUS[k] = SEED_KAMUS[k].concat(KAMUS_V8[k].filter(function (f) { return SEED_KAMUS[k].indexOf(f) < 0; })); });

const SEED_PENANDA = {
  MASUK: ['gaji', 'gajian', 'terima', 'diterima', 'menerima', 'dapat', 'dapet', 'masuk', 'cair', 'pemasukan', 'dikasih', 'diberi',
    'transfer masuk', 'uang masuk', 'jual', 'laku', 'untung', 'bonus', 'thr', 'honor', 'refund', 'cashback'],
  PINDAH: ['top up', 'topup', 'isi saldo', 'isi gopay', 'isi ovo', 'isi dana', 'isi shopeepay', 'tarik tunai', 'ambil atm',
    'ambil di atm', 'tarik di atm', 'setor', 'setor tunai', 'pindah', 'pindah saldo', 'transfer ke', 'nabung', 'menabung',
    'pindah dana', 'pindahin', 'pindahkan', 'transfer dari', 'tf ke', 'isi rekening', 'isi tabungan', 'ambil tabungan', 'tarik tabungan']
};
