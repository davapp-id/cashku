/* CashKu — pemasang otomatis.
 * Membuat server CashKu (Apps Script) di akun Google PEMBELI lewat Apps Script API, langsung dari HP:
 *   kode aktivasi → masuk Google → (sakelar API) → buat proyek + isi kode + versi + deployment → izinkan server → akun Admin → selesai.
 * Mode ?perbarui=KODE: mengganti kode server pembeli dengan versi terbaru (alamat server tetap).
 */
(function (g) {
  'use strict';
  const J = g.Jual, $ = J.$;
  const KUNCI = 'cashku_pasang_v1';
  const API = 'https://script.googleapis.com/v1/projects';
  const CAKUPAN = ['https://www.googleapis.com/auth/script.projects', 'https://www.googleapis.com/auth/script.deployments', 'https://www.googleapis.com/auth/userinfo.email'];
  const TAHAP = { kode: 1, google: 2, sakelar: 3, pasang: 4, izin: 4, admin: 5, selesai: 5 };
  const q = new URLSearchParams(location.search);
  const MODE = q.get('perbarui') ? 'perbarui' : 'pasang';
  let S = J.ambil(KUNCI) || {};
  let tokenGoogle = null, kedaluwarsa = 0, pantau = null;

  // ---------- keadaan & tampilan ----------
  const simpan = () => J.simpan(KUNCI, S);
  function mulaiBaru(kode) { S = { mode: MODE, langkah: 'kode', kode: kode || '' }; simpan(); }
  function ke(l) { S.langkah = l; simpan(); tampil(); if (l === 'izin') mulaiPantau(); }
  function tampil() {
    J.$$('[data-langkah]').forEach((el) => el.classList.toggle('on', el.dataset.langkah === S.langkah));
    const n = TAHAP[S.langkah] || 1;
    J.$$('[data-tahap] i').forEach((el, i) => el.classList.toggle('on', i < n));
    $('#kode').value = S.kode || $('#kode').value;
    J.$$('[data-email]').forEach((el) => { el.textContent = S.email || ''; });
    if (MODE === 'perbarui') {
      $('[data-judul]').textContent = 'Perbarui server CashKu';
      $('[data-judul-pasang]').textContent = 'Perbarui server';
      $('[data-sub-pasang]').innerHTML = 'Kode server di akun <b>' + J.esc(S.email || '') + '</b> diganti dengan versi terbaru. Data Anda tidak berubah.';
      $('[data-aksi="pasang"]').textContent = 'Perbarui sekarang';
    }
    if (S.langkah === 'selesai') {
      $('[data-kode-selesai]').textContent = S.kode || '';
      if (S.judulSelesai) $('[data-judul-selesai]').textContent = S.judulSelesai;
      if (S.subSelesai) $('[data-sub-selesai]').textContent = S.subSelesai;
      $('[data-apk]').href = J.cfg().APK_URL || '#';
      $('[data-apk]').classList.toggle('tersembunyi', !J.cfg().APK_URL);
      $('[data-buka-web]').href = 'index.html?kode=' + encodeURIComponent(S.kode || '');
    }
    const wa = String(J.cfg().WA_PENJUAL || '').replace(/[^0-9]/g, '');
    const lw = $('[data-wa]'); if (wa) lw.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Halo, saya butuh bantuan memasang CashKu (kode ' + (S.kode || '-') + ').'); else lw.classList.add('tersembunyi');
  }
  function pesan(teks, jenis) {
    const el = $('[data-langkah="' + S.langkah + '"] [data-pesan]');
    if (!el) return;
    el.className = 'pesan ' + (jenis || 'galat'); el.innerHTML = teks || '';
  }
  async function dengan(tombol, label, fn) {
    const asal = tombol.textContent;
    tombol.disabled = true; tombol.textContent = label; pesan('');
    try { await fn(); } catch (e) { pesan(J.esc(e.message || String(e))); console.error(e); }
    finally { tombol.disabled = false; tombol.textContent = asal; }
  }

  // ---------- Google ----------
  function mintaToken(paksa) {
    return new Promise((res, rej) => {
      if (!paksa && tokenGoogle && Date.now() < kedaluwarsa - 60000) return res(tokenGoogle);
      const cid = J.cfg().GOOGLE_CLIENT_ID;
      if (!cid || /TEMPEL/.test(cid)) return rej(new Error('GOOGLE_CLIENT_ID belum diisi di js/config.js (hubungi penjual).'));
      const oa = g.google && g.google.accounts && g.google.accounts.oauth2;
      if (!oa) return rej(new Error('Layanan Google belum termuat. Periksa internet, lalu muat ulang halaman.'));
      const klien = oa.initTokenClient({
        client_id: cid, scope: CAKUPAN.join(' '), prompt: S.email ? '' : 'select_account', hint: S.email || undefined,
        callback: (r) => {
          if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Izin Google tidak diberikan. Ketuk lagi, lalu pilih Izinkan.' : 'Gagal masuk Google (' + r.error + ').'));
          if (oa.hasGrantedAllScopes && !oa.hasGrantedAllScopes(r, CAKUPAN[0], CAKUPAN[1])) return rej(new Error('Centang semua izin yang diminta, lalu coba lagi.'));
          tokenGoogle = r.access_token; kedaluwarsa = Date.now() + (Number(r.expires_in) || 3600) * 1000; res(tokenGoogle);
        },
        error_callback: (e) => rej(new Error(e && e.type === 'popup_closed' ? 'Jendela masuk Google ditutup sebelum selesai.' : 'Jendela Google tidak bisa dibuka. Izinkan pop-up untuk halaman ini, lalu coba lagi.'))
      });
      klien.requestAccessToken();
    });
  }
  async function gapi(method, jalur, isi, ulang) {
    const t = await mintaToken();
    const res = await fetch(jalur.indexOf('http') === 0 ? jalur : API + jalur, {
      method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: isi ? JSON.stringify(isi) : undefined });
    const j = await res.json().catch(() => ({}));
    if (res.status === 401 && !ulang) { tokenGoogle = null; return gapi(method, jalur, isi, true); }
    if (!res.ok) {
      const m = (j.error && j.error.message) || ('HTTP ' + res.status);
      const e = new Error(m); e.status = res.status;
      e.sakelar = /usersettings/i.test(m);
      if (e.sakelar) e.message = 'Sakelar "Google Apps Script API" belum menyala.';
      else if (/has not been used in project|apis\/api\/script/i.test(m)) e.message = 'Apps Script API belum diaktifkan di proyek Google Cloud penjual. Hubungi penjual CashKu.';
      else if (res.status === 403 || res.status === 404) e.message = 'Akun Google ini tidak punya akses ke server tersebut. ' + (S.emailPemilik ? 'Masuk dengan akun ' + S.emailPemilik + '.' : '') + ' (' + m + ')';
      throw e;
    }
    return j;
  }
  async function emailGoogle() {
    const t = await mintaToken();
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + t } });
    const j = await r.json().catch(() => ({}));
    return String(j.email || '').toLowerCase();
  }

  // ---------- berkas server ----------
  async function berkasServer() {
    const ambil = async (p) => { const r = await fetch('server/' + p + '?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('Berkas server/' + p + ' tidak ditemukan di situs.'); return r.text(); };
    const [kode, manifest, versi] = await Promise.all([ambil('Kode.gs'), ambil('appsscript.json'), ambil('versi.json')]);
    return { kode, manifest, versi: JSON.parse(versi).versi };
  }
  function acak(n) {
    const b = new Uint8Array(n); crypto.getRandomValues(b);
    return btoa(String.fromCharCode.apply(null, b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function isiPasangGs() {
    return '/** Dibuat otomatis oleh pemasang CashKu untuk kode ' + S.kode + '. Jangan diubah atau dihapus. */\n' +
      'const PASANG = ' + JSON.stringify({ TOKEN: S.tokenPasang, KODE: S.kode, PENJUAL: J.cfg().PENJUAL_URL || '', PEMASANG: J.alamatSitus() + 'pasang.html', DIBUAT: new Date().toISOString() }, null, 1) + ';\n';
  }
  const urlDari = (dep) => {
    const w = (dep.entryPoints || []).find((x) => x.entryPointType === 'WEB_APP');
    return (w && w.webApp && w.webApp.url) || 'https://script.google.com/macros/s/' + dep.deploymentId + '/exec';
  };

  // ---------- daftar centang ----------
  function daftarCek(item) {
    const box = $('[data-daftar-cek]');
    box.innerHTML = item.map((x, i) => '<div class="cek" data-cek="' + i + '"><span class="ic"></span><span>' + J.esc(x) + '</span></div>').join('');
    return (i, st) => { const el = box.querySelector('[data-cek="' + i + '"]'); el.className = 'cek ' + st; el.querySelector('.ic').textContent = st === 'selesai' ? '✓' : st === 'gagal' ? '!' : ''; };
  }

  // ---------- aksi ----------
  const AKSI = {
    async cekKode(btn) {
      const k = J.rapikanKode($('#kode').value);
      if (!k) return pesan('Kode Aktivasi berbentuk CK-XXXX-XXXX (8 huruf/angka).');
      await dengan(btn, 'Memeriksa…', async () => {
        const r = await J.penjual('cekKode', { kode: k });
        if (!r.success) throw new Error(r.message);
        if (S.kode !== r.data.kode) mulaiBaru(r.data.kode);
        S.nama = r.data.nama;
        if (MODE === 'pasang' && !r.data.bolehPasang) {
          S.judulSelesai = 'CashKu untuk kode ini sudah terpasang';
          S.subSelesai = 'Tinggal pasang aplikasinya, lalu masuk dengan kode ini dan akun Anda. Perlu pasang ulang? Hubungi penjual.';
          return ke('selesai');
        }
        ke('google');
      });
    },
    async masukGoogle(btn) {
      await dengan(btn, 'Menunggu Google…', async () => {
        await mintaToken(true);
        S.email = await emailGoogle(); simpan();
        if (MODE === 'perbarui') return ke('pasang');
        ke('sakelar');
      });
    },
    keLangkahPasang() { ke('pasang'); },
    async pasang(btn) { return MODE === 'perbarui' ? perbarui(btn) : pasangBaru(btn); },
    izinkanServer() {
      if (!S.url) return pesan('Alamat server belum ada. Ulangi langkah Pasang.');
      g.open(S.url + '?izin=1', '_blank', 'noopener');
      pesan('Setelah mengizinkan di halaman Google, kembali ke sini. Halaman ini memeriksa otomatis.', 'info');
      mulaiPantau();
    },
    async cekIzin(btn) { await dengan(btn, 'Memeriksa…', async () => { if (!(await periksaIzin())) pesan('Server belum diizinkan. Ketuk "Izinkan server" lalu ikuti langkah di halaman Google.'); }); },
    async buatAdmin(btn) {
      const nama = $('#a-nama').value.trim(), user = $('#a-user').value.trim().toLowerCase(), p1 = $('#a-pass').value, p2 = $('#a-pass2').value;
      if (!nama) return pesan('Isi nama Anda.');
      if (!/^[a-z0-9._]{3,20}$/.test(user)) return pesan('Username 3–20 huruf kecil atau angka, tanpa spasi.');
      if (p1.length < 6) return pesan('Password minimal 6 karakter.');
      if (p1 !== p2) return pesan('Ulangan password tidak sama.');
      await dengan(btn, 'Menyiapkan database… (±30 detik)', async () => {
        const r = await J.gas(S.url, 'pasangAwal', { token: S.tokenPasang, nama, username: user, password: p1 }, { timeout: 240000 });
        if (!r.success && !(r.data && r.data.code === 'SUDAH')) throw new Error(r.message || 'Gagal menyiapkan database.');
        S.judulSelesai = 'CashKu siap dipakai! 🎉';
        S.subSelesai = 'Pasang aplikasinya, lalu masuk dengan Kode Aktivasi di bawah dan akun "' + user + '".';
        bersihkanRahasia(); ke('selesai');
      });
    }
  };

  async function pasangBaru(btn) {
    const tanda = daftarCek(['Membuat server CashKu', 'Mengisi kode server', 'Menerapkan server', 'Mendaftarkan ke penjual']);
    let i = 0;
    await dengan(btn, 'Memasang…', async () => {
      try {
        const f = await berkasServer();
        tanda(0, 'jalan');
        if (!S.scriptId) { const p = await gapi('POST', '', { title: 'CashKu Server' }); S.scriptId = p.scriptId; simpan(); }
        tanda(0, 'selesai'); i = 1; tanda(1, 'jalan');
        S.tokenPasang = S.tokenPasang || acak(24); simpan();
        await gapi('PUT', '/' + S.scriptId + '/content', { files: [
          { name: 'appsscript', type: 'JSON', source: f.manifest },
          { name: 'Kode', type: 'SERVER_JS', source: f.kode },
          { name: 'Pasang', type: 'SERVER_JS', source: isiPasangGs() }] });
        tanda(1, 'selesai'); i = 2; tanda(2, 'jalan');
        if (!S.deploymentId) {
          const v = await gapi('POST', '/' + S.scriptId + '/versions', { description: 'CashKu ' + f.versi });
          const d = await gapi('POST', '/' + S.scriptId + '/deployments', { versionNumber: v.versionNumber, manifestFileName: 'appsscript', description: 'CashKu ' + f.versi });
          S.deploymentId = d.deploymentId; S.url = urlDari(d); simpan();
        }
        tanda(2, 'selesai'); i = 3; tanda(3, 'jalan');
        const r = await J.penjual('daftarPasang', { kode: S.kode, email: S.email, scriptId: S.scriptId, deploymentId: S.deploymentId, url: S.url, versi: f.versi });
        if (!r.success) throw new Error(r.message);
        tanda(3, 'selesai');
        ke('izin');
      } catch (e) {
        tanda(i, 'gagal');
        if (e.sakelar) { ke('sakelar'); pesan('Sakelar <b>Google Apps Script API</b> belum menyala. Nyalakan dulu, lalu ketuk Sudah, lanjutkan.'); return; }
        throw e;
      }
    });
  }

  async function perbarui(btn) {
    const tanda = daftarCek(['Mencari server Anda', 'Mengambil kode terbaru', 'Memperbarui server', 'Menerapkan versi baru']);
    let i = 0;
    await dengan(btn, 'Memperbarui…', async () => {
      try {
        tanda(0, 'jalan');
        const inf = await J.penjual('infoPerbarui', { kode: S.kode });
        if (!inf.success) throw new Error(inf.message);
        Object.assign(S, { scriptId: inf.data.scriptId, deploymentId: inf.data.deploymentId, url: inf.data.url, emailPemilik: inf.data.email }); simpan();
        const lama = await gapi('GET', '/' + S.scriptId + '/content');
        const pasangGs = (lama.files || []).find((x) => x.name === 'Pasang');
        if (!pasangGs) throw new Error('Server ini tidak dibuat lewat pemasang, jadi perlu diperbarui manual.');
        tanda(0, 'selesai'); i = 1; tanda(1, 'jalan');
        const f = await berkasServer(); S.versiBaru = f.versi; simpan();
        tanda(1, 'selesai'); i = 2; tanda(2, 'jalan');
        await gapi('PUT', '/' + S.scriptId + '/content', { files: [
          { name: 'appsscript', type: 'JSON', source: f.manifest },
          { name: 'Kode', type: 'SERVER_JS', source: f.kode },
          { name: 'Pasang', type: 'SERVER_JS', source: pasangGs.source }] });
        tanda(2, 'selesai'); i = 3; tanda(3, 'jalan');
        const v = await gapi('POST', '/' + S.scriptId + '/versions', { description: 'CashKu ' + f.versi });
        await gapi('PUT', '/' + S.scriptId + '/deployments/' + S.deploymentId, { deploymentConfig: { scriptId: S.scriptId, versionNumber: v.versionNumber, manifestFileName: 'appsscript', description: 'CashKu ' + f.versi } });
        tanda(3, 'selesai');
        if (!(await periksaIzin())) { ke('izin'); pesan('Versi baru membutuhkan izin ulang. Ketuk Izinkan server.', 'peringatan'); }
      } catch (e) {
        tanda(i, 'gagal');
        if (e.sakelar) { ke('sakelar'); pesan('Sakelar <b>Google Apps Script API</b> belum menyala. Nyalakan dulu, lalu ketuk Sudah, lanjutkan.'); return; }
        throw e;
      }
    });
  }

  /** true bila server sudah menjawab JSON (sudah diizinkan pemiliknya); lalu lanjut ke langkah berikutnya. */
  async function periksaIzin() {
    if (!S.url) return false;
    const r = await J.gas(S.url, 'infoServer', {}, { timeout: 20000 });
    if (!r.success) return false;
    berhentiPantau();
    if (MODE === 'perbarui') {
      await J.penjual('laporVersi', { kode: S.kode, versi: r.data.versi, email: S.email });
      S.judulSelesai = 'Server diperbarui ke versi ' + r.data.versi + ' ✓';
      S.subSelesai = 'Buka lagi aplikasi CashKu. Pembaruan langsung berlaku untuk semua anggota keluarga.';
      bersihkanRahasia(); ke('selesai'); return true;
    }
    if (r.data.terpasang) { bersihkanRahasia(); ke('selesai'); } else ke('admin');
    return true;
  }
  function mulaiPantau() {
    if (pantau) return;
    const t0 = Date.now();
    pantau = setInterval(async () => {
      if (S.langkah !== 'izin' || Date.now() - t0 > 10 * 60000) return berhentiPantau();
      if (document.visibilityState === 'visible') await periksaIzin();
    }, 3500);
  }
  function berhentiPantau() { if (pantau) clearInterval(pantau); pantau = null; }
  function bersihkanRahasia() { delete S.tokenPasang; delete S.scriptId; delete S.deploymentId; delete S.emailPemilik; simpan(); }

  // ---------- mulai ----------
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aksi]');
    if (b && AKSI[b.dataset.aksi]) { e.preventDefault(); AKSI[b.dataset.aksi](b); }
  });
  $('#kode').addEventListener('keydown', (e) => { if (e.key === 'Enter') AKSI.cekKode($('[data-aksi="cekKode"]')); });
  const kodeUrl = J.rapikanKode(q.get('perbarui') || q.get('kode') || '');
  if (S.mode !== MODE || (kodeUrl && kodeUrl !== S.kode) || (S.langkah === 'selesai' && !q.get('lanjut'))) mulaiBaru(kodeUrl || (S.mode === MODE ? S.kode : ''));
  if (!S.langkah) S.langkah = 'kode';
  // langkah yang butuh token Google tidak bisa dilanjutkan setelah halaman dimuat ulang → mulai dari "Masuk Google"
  if (S.langkah === 'pasang' || S.langkah === 'sakelar') S.langkah = S.email ? 'google' : 'kode';
  tampil();
  if (S.langkah === 'izin') { mulaiPantau(); periksaIzin(); }
  g.addEventListener('focus', () => { if (S.langkah === 'izin') periksaIzin(); });
  g.CashKuPasang = { keadaan: () => S };
})(window);
