const REPO = 'focawear-collab/bc-procesos-rrhh';
const FILE = 'pub-status.json';
const BRANCH = 'data';

async function gh(path, opts = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'bc-hub-rrhh',
      ...(opts.headers || {})
    }
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!process.env.GITHUB_TOKEN) {
    res.status(500).json({ ok: false, error: 'Storage not configured' });
    return;
  }

  if (req.method === 'GET') {
    const r = await gh(`/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`);
    if (r.status === 404) { res.status(200).json({ ok: true, statuses: {} }); return; }
    if (!r.ok) { res.status(502).json({ ok: false, error: 'Storage read failed' }); return; }
    const data = await r.json();
    let parsed = {};
    try { parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')); } catch (e) {}
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, statuses: parsed.statuses || {}, updatedAt: parsed.updatedAt || null });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  const { password, statuses } = req.body || {};
  if (!password || typeof statuses !== 'object' || statuses === null) {
    res.status(400).json({ ok: false, error: 'Missing password or statuses' });
    return;
  }
  let passwords = {};
  try { passwords = JSON.parse(process.env.BC_HR_PASSWORDS || '{}'); } catch (e) {}
  if (!Object.values(passwords).includes(password)) {
    res.status(401).json({ ok: false, error: 'Incorrect password' });
    return;
  }

  const clean = {};
  for (const [k, v] of Object.entries(statuses)) {
    if (/^[A-Za-z0-9_.-]+\.html$/.test(k) && (v === 'activa' || v === 'inactiva')) clean[k] = v;
  }

  const cur = await gh(`/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`);
  let sha;
  if (cur.ok) { sha = (await cur.json()).sha; }
  else if (cur.status !== 404) { res.status(502).json({ ok: false, error: 'Storage read failed' }); return; }

  const put = await gh(`/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Actualizar estado de publicaciones (hub HR)',
      content: Buffer.from(JSON.stringify({ statuses: clean, updatedAt: new Date().toISOString() }, null, 2)).toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });
  if (!put.ok) { res.status(502).json({ ok: false, error: 'Storage write failed' }); return; }
  res.status(200).json({ ok: true, statuses: clean });
}
