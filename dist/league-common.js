/* Shared helpers for the league leaderboard and the league admin page. */
(() => {
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js';
  let clientPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.append(s);
    });
  }

  // Returns a Supabase client, or null when the site has no Supabase settings yet.
  function getClient() {
    const c = window.AVID_CONTENT || {};
    if (!c.supabaseUrl || !c.supabaseAnonKey) return Promise.resolve(null);
    if (!clientPromise) {
      clientPromise = (window.supabase ? Promise.resolve() : loadScript(SUPABASE_JS))
        .then(() => window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey));
    }
    return clientPromise;
  }

  // Supabase returns at most 1000 rows per request, so read big tables in pages.
  async function selectAll(makeQuery) {
    const size = 1000;
    let rows = [];
    for (let from = 0; ; from += size) {
      const { data, error } = await makeQuery().range(from, from + size - 1);
      if (error) throw error;
      rows = rows.concat(data);
      if (data.length < size) return rows;
    }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function slug(text) {
    return String(text || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
  }

  // 27 -> "2 ft 3 in"
  function formatDistance(inches) {
    if (inches == null || inches === '' || isNaN(inches)) return '';
    const total = Math.round(Number(inches) * 10) / 10;
    const ft = Math.floor(total / 12);
    const rest = Math.round((total - ft * 12) * 10) / 10;
    if (!ft) return rest + ' in';
    return rest ? `${ft} ft ${rest} in` : `${ft} ft`;
  }

  function formatToPar(n) {
    if (n == null) return '';
    if (n === 0) return 'E';
    return n > 0 ? '+' + n : '−' + Math.abs(n);
  }

  window.AVIDLeague = { getClient, selectAll, esc, slug, formatDistance, formatToPar };
})();
