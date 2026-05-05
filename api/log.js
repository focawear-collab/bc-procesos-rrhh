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

  const { message, source, lineno, colno, stack, url, timestamp } = req.body || {};

  console.error('[CLIENT ERROR]', JSON.stringify({
    message: message || 'unknown',
    source: source || '',
    lineno: lineno || 0,
    colno: colno || 0,
    stack: stack || '',
    url: url || '',
    timestamp: timestamp || new Date().toISOString()
  }));

  res.status(200).json({ ok: true });
}
