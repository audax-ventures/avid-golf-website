// Runs once a day (see "crons" in vercel.json) so the free Supabase project never sits
// idle long enough to be paused. It makes one small read from the database, the same
// kind of request the public leaderboard makes. The URL and publishable key are the
// public ones already in dist/content.js; they can be overridden in Vercel's settings.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brujexxxuvffmnormscx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_jQezct0kJFBQBgoZIxazkw_ugOUf3RO';

module.exports = async (req, res) => {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/seasons?select=id&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, checked: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err && err.message || err) });
  }
};
