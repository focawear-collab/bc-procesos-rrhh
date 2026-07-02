export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clean = (v, max) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, max || 500);
  const { message, source, lineno, colno, stack, url, timestamp } = req.body || {};

  console.error('[CLIENT ERROR]', JSON.stringify({
    message: clean(message || 'unknown', 500),
    source: clean(source, 300),
    lineno: Number(lineno) || 0,
    colno: Number(colno) || 0,
    stack: clean(stack, 2000),
    url: clean(url, 500),
    timestamp: clean(timestamp || new Date().toISOString(), 40)
  }));

  res.status(200).json({ ok: true });
}
