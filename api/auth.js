export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const raw = process.env.BC_HR_PASSWORDS;
  if (!raw) {
    console.error('BC_HR_PASSWORDS env var not configured');
    res.status(500).json({ ok: false, error: 'Auth not configured' });
    return;
  }

  let passwords;
  try {
    passwords = JSON.parse(raw);
  } catch (e) {
    console.error('BC_HR_PASSWORDS is not valid JSON');
    res.status(500).json({ ok: false, error: 'Auth misconfigured' });
    return;
  }

  const { module, password } = req.body || {};

  if (!module || !password) {
    res.status(400).json({ ok: false, error: 'Missing module or password' });
    return;
  }

  const expected = passwords[module];
  if (!expected) {
    res.status(400).json({ ok: false, error: 'Unknown module' });
    return;
  }

  if (password === expected) {
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Incorrect password' });
  }
}
