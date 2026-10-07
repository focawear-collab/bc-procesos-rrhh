import { COOKIE, leerSesion, leerCookie } from '../lib/sesion.js';
// Storage de plantillas HR creadas por el usuario (Inge).
// Mismo patrón que pub-status.js: GitHub Contents API, rama `data` (sin redeploy),
// GITHUB_TOKEN server-side; guardar exige la sesión del hub con PIN personal (nivel confidencial).
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
    html: s(t && t.html, 40000)
  })).filter(t => t.nombre.trim() && t.html.trim());
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

  const { templates } = req.body || {};
  if (!Array.isArray(templates)) {
    res.status(400).json({ ok: false, error: 'Missing templates' });
    return;
  }
  // Con sesión RRHH (PIN personal, nivel confidencial) no se pide clave; la clave compartida queda de respaldo.
  const sesion = await leerSesion(leerCookie(req.headers.cookie, COOKIE), process.env.RRHH_SESSION_SECRET);
  // Solo con PIN personal (sesión del hub, nivel confidencial). Ya no hay claves compartidas.
  if (!(sesion && sesion.confidencial)) {
    res.status(401).json({ ok: false, error: 'Entra al hub con tu PIN (acceso RRHH).' });
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
