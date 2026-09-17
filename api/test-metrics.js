export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, testMetrics: true });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false });
    return;
  }

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const cleanRouteStats = {};
  if (b.routes && typeof b.routes === 'object') {
    for (const [route, v] of Object.entries(b.routes).slice(0, 40)) {
      if (!/^[a-z0-9:_/-]{1,100}$/i.test(route) || !v || typeof v !== 'object') continue;
      cleanRouteStats[route] = {
        requests: Number(v.requests) || 0,
        bytes: Number(v.bytes) || 0,
        errors: Number(v.errors) || 0,
        maxMs: Math.round(Number(v.maxMs) || 0),
      };
    }
  }

  const metric = {
    tag: 'KIMSHOP_TEST_METRIC',
    session: String(b.session || '').slice(0, 64),
    seq: Number(b.seq) || 0,
    ageSec: Math.round(Number(b.ageSec) || 0),
    requests: Number(b.requests) || 0,
    bytes: Number(b.bytes) || 0,
    errors: Number(b.errors) || 0,
    slowestMs: Math.round(Number(b.slowestMs) || 0),
    nav: {
      ttfbMs: Math.round(Number(b.nav?.ttfbMs) || 0),
      domMs: Math.round(Number(b.nav?.domMs) || 0),
      loadMs: Math.round(Number(b.nav?.loadMs) || 0),
      fcpMs: Math.round(Number(b.nav?.fcpMs) || 0),
    },
    routes: cleanRouteStats,
    at: new Date().toISOString(),
  };

  // Deliberately logs only aggregate counts/timings. No auth headers, request
  // bodies, query strings, user ids, product names, phone numbers or addresses.
  console.log('KIMSHOP_TEST_METRIC ' + JSON.stringify(metric));
  res.status(204).end();
}
