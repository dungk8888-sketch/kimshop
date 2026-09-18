export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method' });
  const token = String(req.query?.token || '');
  if (token.length < 32) return res.status(401).json({ ok:false, error:'missing token' });

  const url = process.env.VITE_SUPABASE_URL || 'https://ygqqtudavuugrvpkhvdp.supabase.co';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!anon) return res.status(500).json({ ok:false, error:'missing anon key' });

  const history = [];
  let totalMigrated = 0;
  try {
    for (let i = 1; i <= 40; i++) {
      const r = await fetch(url + '/functions/v1/migration-runner-v3-temp', {
        method:'POST',
        headers:{
          'Authorization':'Bearer ' + anon,
          'apikey':anon,
          'x-migration-token':token,
          'content-type':'application/json'
        },
        body:JSON.stringify({ limit:5 })
      });
      const text = await r.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { ok:false, raw:text }; }
      if (!r.ok) return res.status(r.status).json({ ok:false, error:'edge_failed', body, history });
      const migrated = Array.isArray(body?.migrated) ? body.migrated.length : 0;
      const failures = Array.isArray(body?.failures) ? body.failures : [];
      const remaining = body?.remaining || {};
      const left = Object.values(remaining).reduce((sum, n) => sum + Number(n || 0), 0);
      totalMigrated += migrated;
      history.push({ i, migrated, failures:failures.length, left, remaining });
      if (failures.length) return res.status(500).json({ ok:false, error:'migration_failures', totalMigrated, history });
      if (left === 0) return res.status(200).json({ ok:true, totalMigrated, remaining, runs:i, history });
      if (migrated === 0) return res.status(500).json({ ok:false, error:'stalled', totalMigrated, remaining, history });
    }
    return res.status(500).json({ ok:false, error:'max_runs', totalMigrated, history });
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e), totalMigrated, history });
  }
}
