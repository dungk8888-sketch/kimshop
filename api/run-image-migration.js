export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'method' });
  const token = String(req.query?.token || '');
  if (token.length < 32) return res.status(401).json({ ok:false, error:'missing token' });

  const url = process.env.VITE_SUPABASE_URL || 'https://ygqqtudavuugrvpkhvdp.supabase.co';
  const anon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!anon) return res.status(500).json({ ok:false, error:'missing anon key' });

  try {
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
    try { body = JSON.parse(text); } catch { body = { raw:text }; }
    return res.status(r.status).json(body);
  } catch (e) {
    return res.status(500).json({ ok:false, error:String(e) });
  }
}
