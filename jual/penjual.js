/* CashKu — halaman penjual: buat Kode Aktivasi, kirim lewat WhatsApp, pantau pembeli & kuota Google */
(function (g) {
  'use strict';
  const J = g.Jual, $ = J.$;
  const KUNCI = 'cashku_penjual_token';
  let token = J.ambil(KUNCI) || '', daftar = [], hasilTerakhir = null;

  const nomorWa = (w) => { let s = String(w || '').replace(/[^0-9]/g, ''); if (s.indexOf('0') === 0) s = '62' + s.slice(1); return s; };
  const linkPasang = (kode) => J.alamatSitus() + 'pasang.html?kode=' + encodeURIComponent(kode);
  const pesanWa = (x) => 'Halo ' + x.nama + ', terima kasih sudah membeli CashKu! 🎉\n\n' +
    'Kode Aktivasi Anda: *' + x.kode + '*\n\n' +
    'Pasang CashKu dari HP (±5 menit) di link berikut:\n' + linkPasang(x.kode) + '\n\n' +
    'Simpan kode ini. Anggota keluarga juga memakai kode yang sama untuk masuk. Bila ada kendala, balas pesan ini ya.';
  const linkWa = (x) => (x.wa ? 'https://wa.me/' + nomorWa(x.wa) : 'https://wa.me/') + '?text=' + encodeURIComponent(pesanWa(x));
  const tgl = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? String(s).slice(0, 10) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };

  async function api(action, data) {
    const r = await J.penjual(action, data, { token });
    if (!r.success && r.data && r.data.code === 'AUTH') { keluar(); }
    return r;
  }
  function tampil() {
    $('[data-masuk]').classList.toggle('tersembunyi', !!token);
    $('[data-utama]').classList.toggle('tersembunyi', !token);
  }
  function keluar() { token = ''; J.simpan(KUNCI, null); tampil(); }

  async function muat() {
    const r = await api('daftar', {});
    if (!r.success) { $('[data-daftar]').innerHTML = '<div class="pesan galat">' + J.esc(r.message) + '</div>'; return; }
    daftar = r.data.list;
    const k = r.data.kuota, persen = Math.min(100, Math.round(k.terpakai / k.batas * 100));
    $('[data-n-total]').textContent = daftar.length;
    $('[data-n-pasang]').textContent = daftar.filter((x) => x.status === 'TERPASANG').length;
    $('[data-n-baru]').textContent = daftar.filter((x) => x.status === 'BARU').length;
    $('[data-kuota-teks]').textContent = k.terpakai + ' dari ' + k.batas + ' akun';
    $('[data-meter]').classList.toggle('awas', k.terpakai >= 60);
    $('[data-meter] i').style.width = persen + '%';
    $('[data-kuota-saran]').textContent = k.terpakai >= 60
      ? 'Sudah lewat 60. Saatnya mengajukan verifikasi Google supaya pembeli berikutnya tidak terhambat batas 100.'
      : 'Batas akun Google yang boleh memakai pemasang sebelum aplikasi diverifikasi Google.';
    gambarDaftar();
  }
  function gambarDaftar() {
    const c = String($('[data-cari]').value || '').toLowerCase();
    const list = daftar.filter((x) => !c || [x.nama, x.kode, x.email_google, x.wa].join(' ').toLowerCase().indexOf(c) > -1);
    if (!list.length) { $('[data-daftar]').innerHTML = '<p class="kecil">' + (daftar.length ? 'Tidak ada yang cocok.' : 'Belum ada pembeli. Buat kode pertama di atas.') + '</p>'; return; }
    $('[data-daftar]').innerHTML = list.map((x) => {
      const rinci = ['Dibuat ' + tgl(x.dibuat), x.dipasang ? 'dipasang ' + tgl(x.dipasang) : '', x.email_google, x.versi_server ? 'server v' + x.versi_server : '', x.izin_ulang === 'YA' ? 'boleh pasang ulang' : ''].filter(Boolean).join(' · ');
      return '<div class="pembeli"><div class="atas"><b>' + J.esc(x.nama) + '</b><span class="lencana ' + J.esc(x.status) + '">' + ({ BARU: 'Belum dipasang', TERPASANG: 'Terpasang', NONAKTIF: 'Nonaktif' }[x.status] || J.esc(x.status)) + '</span></div>' +
        '<div class="kodekecil">' + J.esc(x.kode) + '</div><div class="rinci">' + J.esc(rinci) + (x.catatan ? '<br>📝 ' + J.esc(x.catatan) : '') + '</div>' +
        '<div class="baris-tombol">' +
        '<a class="tombol garis kecil" target="_blank" rel="noopener" href="' + J.esc(linkWa(x)) + '">Kirim WA</a>' +
        (x.status === 'TERPASANG' && x.izin_ulang !== 'YA' ? '<button class="tombol garis kecil" data-ubah="pasangUlang" data-kode="' + J.esc(x.kode) + '">Izinkan pasang ulang</button>' : '') +
        (x.status === 'NONAKTIF' ? '<button class="tombol garis kecil" data-ubah="aktif" data-kode="' + J.esc(x.kode) + '">Aktifkan</button>'
          : '<button class="tombol garis kecil" data-ubah="nonaktif" data-kode="' + J.esc(x.kode) + '">Nonaktifkan</button>') +
        '</div></div>';
    }).join('');
  }

  const AKSI = {
    async masuk(btn) {
      const el = $('[data-pesan-masuk]'); el.textContent = ''; el.className = 'pesan';
      btn.disabled = true;
      const r = await J.penjual('login', { password: $('#pw').value });
      btn.disabled = false;
      if (!r.success) { el.className = 'pesan galat'; el.textContent = r.message; return; }
      token = r.data.token; J.simpan(KUNCI, token); $('#pw').value = '';
      tampil(); muat();
    },
    async buat(btn) {
      const el = $('[data-pesan-buat]'); el.className = 'pesan'; el.textContent = '';
      const x = { nama: $('#b-nama').value.trim(), wa: $('#b-wa').value.trim(), catatan: $('#b-cat').value.trim() };
      if (!x.nama) { el.className = 'pesan galat'; el.textContent = 'Isi nama pembeli.'; return; }
      btn.disabled = true; btn.textContent = 'Membuat…';
      const r = await api('buat', x);
      btn.disabled = false; btn.textContent = 'Buat kode';
      if (!r.success) { el.className = 'pesan galat'; el.textContent = r.message; return; }
      hasilTerakhir = Object.assign(x, { kode: r.data.kode });
      $('[data-hasil]').classList.remove('tersembunyi');
      $('[data-hasil-nama]').textContent = x.nama;
      $('[data-hasil-kode]').textContent = x.kode;
      $('[data-hasil-wa]').href = linkWa(x);
      ['#b-nama', '#b-wa', '#b-cat'].forEach((s) => { $(s).value = ''; });
      muat();
    },
    async salinHasil() {
      if (!hasilTerakhir) return;
      try { await navigator.clipboard.writeText(pesanWa(hasilTerakhir)); alertKecil('Pesan disalin ✓'); } catch (e) { alertKecil('Tidak bisa menyalin otomatis.'); }
    },
    muat() { muat(); },
    async gantiPw(btn) {
      const el = $('[data-pesan-pw]');
      btn.disabled = true;
      const r = await api('gantiPassword', { lama: $('#pl').value, baru: $('#pb').value });
      btn.disabled = false;
      el.className = 'pesan ' + (r.success ? 'info' : 'galat');
      el.textContent = r.success ? 'Password diganti. Perangkat lain perlu masuk lagi.' : r.message;
      if (r.success) { token = r.data.token; J.simpan(KUNCI, token); $('#pl').value = ''; $('#pb').value = ''; }
    },
    keluar() { keluar(); }
  };
  function alertKecil(t) { const el = $('[data-pesan-buat]'); el.className = 'pesan info'; el.textContent = t; }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-aksi]');
    if (b && AKSI[b.dataset.aksi]) { e.preventDefault(); return AKSI[b.dataset.aksi](b); }
    const u = e.target.closest('[data-ubah]');
    if (u) {
      const tanya = { nonaktif: 'Nonaktifkan kode ' + u.dataset.kode + '? Pembeli tidak bisa memasang atau menyambungkan HP baru dengan kode ini.', pasangUlang: 'Izinkan kode ' + u.dataset.kode + ' dipakai memasang sekali lagi?', aktif: 'Aktifkan lagi kode ' + u.dataset.kode + '?' }[u.dataset.ubah];
      if (tanya && !g.confirm(tanya)) return;
      u.disabled = true;
      const r = await api('ubah', { kode: u.dataset.kode, aksi: u.dataset.ubah });
      if (!r.success) g.alert(r.message);
      muat();
    }
  });
  $('[data-cari]').addEventListener('input', gambarDaftar);
  $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') AKSI.masuk($('[data-aksi="masuk"]')); });
  tampil();
  if (token) muat();
})(window);
