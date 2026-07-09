// Storage de plantillas HR creadas por el usuario (Inge).
// Mismo patrón que pub-status.js: GitHub Contents API, rama `data` (sin redeploy),
// GITHUB_TOKEN server-side y clave compartida BC_HR_PASSWORDS.
const REPO = 'focawear-collab/bc-procesos-rrhh';
const FILE = 'hr-templates.json';
const BRANCH = 'data';
const MAX = 80;

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

function s(v, max) { return (typeof v === 'string' ? v : '').slice(0, max); }

function clean(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX).map(t => ({
    id: s(t && t.id, 40) || ('t' + Date.now().toString(36)),
    nombre: s(t && t.nombre, 120),
    icono: s(t && t.icono, 8) || '📄',
    categoria: s(t && t.categoria, 60) || 'Mis plantillas',
    dirigido: s(t && t.dirigido, 300),
    cuerpo: s(t && t.cuerpo, 8000),
    firmante1: s(t && t.firmante1, 200),
    cargo1: s(t && t.cargo1, 200),
    firmante2: s(t && t.firmante2, 200),
    cargo2: s(t && t.cargo2, 200)
  })).filter(t => t.nombre.trim());
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
    if (r.status === 404) { res.status(200).json({ ok: true, templates: [] }); return; }
    if (!r.ok) { res.status(502).json({ ok: false, error: 'Storage read failed' }); return; }
    const data = await r.json();
    let parsed = {};
    try { parsed = JSON.parse(Buffer.from(data.content, 'base64').toString('utf-8')); } catch (e) {}
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, templates: parsed.templates || [], updatedAt: parsed.updatedAt || null });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  const { password, templates } = req.body || {};
  if (!password || !Array.isArray(templates)) {
    res.status(400).json({ ok: false, error: 'Missing password or templates' });
    return;
  }
  let passwords = {};
  try { passwords = JSON.parse(process.env.BC_HR_PASSWORDS || '{}'); } catch (e) {}
  if (!Object.values(passwords).includes(password)) {
    res.status(401).json({ ok: false, error: 'Incorrect password' });
    return;
  }

  const list = clean(templates);

  const cur = await gh(`/repos/${REPO}/contents/${FILE}?ref=${BRANCH}`);
  let sha;
  if (cur.ok) { sha = (await cur.json()).sha; }
  else if (cur.status !== 404) { res.status(502).json({ ok: false, error: 'Storage read failed' }); return; }

  const put = await gh(`/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Actualizar plantillas HR guardadas',
      content: Buffer.from(JSON.stringify({ templates: list, updatedAt: new Date().toISOString() }, null, 2)).toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });
  if (!put.ok) { res.status(502).json({ ok: false, error: 'Storage write failed' }); return; }
  res.status(200).json({ ok: true, templates: list });
}
