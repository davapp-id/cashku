/* CashKu — klien API: timeout, retry, reqId idempoten, pengukur performa */
(function (g) {
  'use strict';
  // 1.0.25 (mode jual): alamat server keluarga didapat dari Kode Aktivasi dan disimpan di HP.
  // Bila js/config.js berisi GAS_URL (cara lama, satu keluarga), alamat itu yang dipakai.
  const KUNCI_SERVER = 'cashku_server';
  const Server = {
    info() { try { return JSON.parse(localStorage.getItem(KUNCI_SERVER) || 'null'); } catch (e) { return null; } },
    url() { const i = Server.info(); return (i && i.url) || ''; },
    async simpan(i) { try { localStorage.setItem(KUNCI_SERVER, JSON.stringify(i)); } catch (e) {} await Server.sinkronKv(); },
    async lupakan() { try { localStorage.removeItem(KUNCI_SERVER); } catch (e) {} try { await g.DB.del('kv', 'server'); } catch (e) {} },
    /** service worker (sinkron latar & alarm) membaca alamat server dari IndexedDB */
    async sinkronKv() { const i = Server.info(); if (i) { try { await g.DB.put('kv', i, 'server'); } catch (e) {} } }
  };
  const cfg = () => g.CASHKU_CONFIG || {};
  const urlConfigTerisi = () => { const u = String(cfg().GAS_URL || ''); return !!u && !/TEMPEL|ID_DEPLOYMENT/i.test(u); };
  const GAS_URL = () => (urlConfigTerisi() ? cfg().GAS_URL : Server.url());
  /** Mode jual: config berisi PENJUAL_URL dan tidak berisi GAS_URL → HP perlu Kode Aktivasi */
  const modeKode = () => { const p = String(cfg().PENJUAL_URL || ''); return !!p && !/TEMPEL/i.test(p) && !urlConfigTerisi(); };
  const rapikanKode = (k) => { const s = String(k || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^CK/, ''); return s.length === 8 ? 'CK-' + s.slice(0, 4) + '-' + s.slice(4) : ''; };
  async function hubungkanKode(kode) {
    const k = rapikanKode(kode);
    if (!k) return { success: false, message: 'Kode Aktivasi berbentuk CK-XXXX-XXXX (8 huruf/angka).' };
    if (navigator.onLine === false) return { success: false, message: 'Menghubungkan kode perlu koneksi internet.' };
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(cfg().PENJUAL_URL, { method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'cariServer', data: { kode: k } }) });
      const j = JSON.parse(await res.text());
      if (!j.success) return j;
      await Server.simpan({ url: j.data.url, kode: j.data.kode, nama: j.data.nama || '', t: Date.now() });
      return j;
    } catch (e) {
      return { success: false, message: e.name === 'AbortError' ? 'Server penjual terlalu lama menjawab. Coba lagi.' : 'Tidak bisa memeriksa kode. Periksa koneksi internet.' };
    } finally { clearTimeout(t); }
  }
  const BACA = /^(ping|bootstrap|sinkronTarik|laporanData)$/;

  const Perf = {
    rows: [],
    add(action, total, server) {
      this.rows.push({ action, total, server: server == null ? null : server, net: server == null ? null : total - server, at: Date.now() });
      if (this.rows.length > 200) this.rows.shift();
    },
    table() { console.table(this.rows.slice(-30)); }
  };

  async function apiOnce(action, data, timeout, reqId, token) {
    if (!GAS_URL()) return { success: false, network: true, retryable: false, message: modeKode() ? 'CashKu belum tersambung. Masukkan Kode Aktivasi di halaman masuk.' : 'Alamat server di js/config.js belum diisi. Tempel URL /exec dari Apps Script.' };
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout), t0 = performance.now();
    try {
      const res = await fetch(GAS_URL(), {
        method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },     // hindari CORS preflight
        body: JSON.stringify({ action, token: token || '', reqId, data: data || {} })
      });
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        Perf.add(action, Math.round(performance.now() - t0), j.ms);
        return j;
      } catch (e) {
        return { success: false, network: true, retryable: res.status >= 500 || res.status === 429, message: 'Server membalas HTTP ' + res.status + ' (bukan JSON). Periksa URL di js/config.js.' };
      }
    } catch (err) {
      return { success: false, network: true, retryable: true, message: err.name === 'AbortError' ? 'Server terlalu lama merespons.' : 'Koneksi terputus.' };
    } finally { clearTimeout(timer); }
  }

  function tungguOnline(ms) {
    return new Promise((r) => {
      if (navigator.onLine !== false) return r();
      const t = setTimeout(done, ms);
      function done() { clearTimeout(t); removeEventListener('online', done); r(); }
      addEventListener('online', done);
    });
  }

  /** opt: { token, reqId, tries } */
  async function api(action, data, opt) {
    opt = opt || {};
    const baca = BACA.test(action);
    const reqId = baca ? '' : (opt.reqId || g.U.uuid());
    const tries = opt.tries || (baca ? 3 : 2);
    let res;
    for (let i = 0; i < tries; i++) {
      if (i) { await new Promise((r) => setTimeout(r, 1200 * i)); if (navigator.onLine === false) await tungguOnline(15000); }
      res = await apiOnce(action, data, baca ? (i ? 40000 : 25000) : 60000, reqId, opt.token !== undefined ? opt.token : (g.S && g.S.token));
      if (res.success || !res.retryable) break;
    }
    if (!res.success && res.data && res.data.code === 'AUTH' && g.App && g.App.sesiBerakhir) g.App.sesiBerakhir();
    if (!res.success && res.network && res.message === 'Koneksi terputus.') res.message = await diagnosa();
    return res;
  }

  /** Jelaskan kenapa server tidak bisa dihubungi (pengganti pesan umum "Koneksi terputus") */
  let _diag = null;
  function diagnosa() {
    if (navigator.onLine === false) return Promise.resolve('Tidak ada koneksi internet.');
    if (!urlTerisi()) return Promise.resolve(modeKode() ? 'CashKu belum tersambung. Masukkan Kode Aktivasi di halaman masuk.' : 'Alamat server di js/config.js belum diisi. Tempel URL /exec dari Apps Script.');
    if (_diag) return _diag;
    _diag = fetch(GAS_URL() + '?cek=' + Date.now(), { cache: 'no-store', redirect: 'follow' })
      .then((r) => r.json()).then((j) => (j && j.success
        ? 'Server terhubung, tetapi permintaan ini gagal diproses. Coba lagi sebentar lagi.'
        : 'Server membalas tidak wajar. Periksa URL /exec di js/config.js.'))
      .catch(() => 'Server tidak bisa dihubungi. Periksa URL /exec di js/config.js dan pastikan akses deployment Apps Script "Siapa saja".')
      .finally(() => setTimeout(() => { _diag = null; }, 3000));
    return _diag;
  }

  function pemanasan() {
    if (!GAS_URL()) return;
    try { fetch(GAS_URL() + '?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (e) {}
  }
  function urlTerisi() {
    const u = String(GAS_URL() || '');
    if (!u) return false;
    if (/TEMPEL|ID_DEPLOYMENT/i.test(u)) return false;
    return /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[^/]{20,}\/exec/.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)/.test(u);
  }

  g.API = { api, pemanasan, urlTerisi, diagnosa, Perf, Server, modeKode, hubungkanKode, rapikanKode, urlServer: GAS_URL };
  g.Perf = Perf;
})(window);
