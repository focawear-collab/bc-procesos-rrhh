// Proxy server-side para el Dashboard de Dotación.
// Lee BC_HR_SHEET_URL (URL del Apps Script Web App) desde env vars
// para que la URL con datos de nómina NUNCA quede expuesta en el HTML.
// Si no está configurada, devuelve [] y el dashboard mantiene sus datos estáticos.
const SHEET_URL = process.env.BC_HR_SHEET_URL;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  if (!SHEET_URL) { res.status(200).json([]); return; }

  try {
    const sep = SHEET_URL.includes('?') ? '&' : '?';
    const r = await fetch(SHEET_URL + sep + 'tab=equipo', { redirect: 'follow' });
    if (!r.ok) { console.error('Apps Script status', r.status); res.status(200).json([]); return; }
    const data = await r.json();
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    console.error('dotacion proxy error', e);
    res.status(200).json([]);
  }
}
