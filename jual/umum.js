/* CashKu — bantuan bersama untuk halaman jualan (pemasang & penjual) */
(function (g) {
  'use strict';
  const J = {};
  J.cfg = () => g.CASHKU_CONFIG || {};
  J.$ = (s, r) => (r || document).querySelector(s);
  J.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  J.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  J.tidur = (ms) => new Promise((r) => setTimeout(r, ms));
  /** "ck 7q4m 2xra" → "CK-7Q4M-2XRA" */
  J.rapikanKode = (k) => {
    const s = String(k || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^CK/, '');
    return s.length === 8 ? 'CK-' + s.slice(0, 4) + '-' + s.slice(4) : '';
  };
  /** Panggil Apps Script (server Penjual atau server pembeli). Jawaban bukan JSON → { success:false, bukanJson:true }. */
  J.gas = async (url, action, data, opt) => {
    opt = opt || {};
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), opt.timeout || 30000);
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', cache: 'no-store', signal: ctrl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: opt.token || '', data: data || {} }) });
      const teks = await res.text();
      try { return JSON.parse(teks); } catch (e) { return { success: false, bukanJson: true, message: 'Server belum siap (belum diizinkan pemiliknya).' }; }
    } catch (e) {
      return { success: false, jaringan: true, message: e.name === 'AbortError' ? 'Server terlalu lama menjawab. Coba lagi.' : 'Tidak bisa menghubungi server. Periksa internet Anda.' };
    } finally { clearTimeout(t); }
  };
  J.penjual = (action, data, opt) => {
    const url = J.cfg().PENJUAL_URL;
    if (!url || /TEMPEL/.test(url)) return Promise.resolve({ success: false, message: 'PENJUAL_URL belum diisi di js/config.js.' });
    return J.gas(url, action, data, opt);
  };
  J.simpan = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  J.ambil = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  J.alamatSitus = () => location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  g.Jual = J;
})(window);
