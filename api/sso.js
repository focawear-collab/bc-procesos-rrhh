// GET /api/sso?t=<pase> — entrada desde BlackChicken APP sin volver a pedir el PIN.
// El portal firma el pase (sso1~persona~vence~dominio~emitido~firma, HMAC-SHA256 con SSO_SECRET);
// acá se verifica (para este dominio, emitido hace < 2 min), se confirma que la persona tiene
// rrhh.entrar con app_login_id('rrhh', id) y se deja la misma cookie que deja el login con PIN.
import { COOKIE, DURACION_S, crearSesion } from '../lib/sesion.js';

export const config = { runtime: 'edge' };

const enc = new TextEncoder();
async function hmacHex(texto, secreto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const ir = (url, cookies) => {
  const h = new Headers({ Location: url, 'cache-control': 'no-store' });
  (cookies || []).forEach((c) => h.append('set-cookie', c));
  return new Response(null, { status: 302, headers: h });
};

export default async function handler(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host).split(',')[0].trim().split(':')[0];
  const { SSO_SECRET, RRHH_SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  const inicio = url.origin + '/hub-index.html';
  if (!SSO_SECRET || !RRHH_SESSION_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return ir(inicio);

  const p = String(url.searchParams.get('t') || '').split('~');
  if (p.length !== 6 || p[0] !== 'sso1') return ir(inicio);
  const persona = Number(p[1]), hasta = Number(p[2]), emitido = Number(p[4]), ahora = Date.now();
  if (!igual(p[5], await hmacHex(p.slice(0, 5).join('~'), SSO_SECRET))) return ir(inicio);
  if (p[3] !== host || !(persona > 0) || !(hasta > ahora) || !(ahora - emitido < 120000)) return ir(inicio);

  let fila = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/app_login_id`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_app: 'rrhh', p_person: persona }),
    });
    if (r.ok) { const f = await r.json(); fila = Array.isArray(f) ? f[0] : f; }
    else console.error('sso rrhh: app_login_id ' + r.status);
  } catch (e) { console.error('sso rrhh: ' + String(e && e.message)); }
  if (!fila || !fila.person_id) return ir(inicio); // sin rrhh.entrar: queda en la pantalla de PIN

  const datos = { id: fila.person_id, nombre: fila.person_name, confidencial: !!fila.puede_cerrar };
  const maxAge = Math.max(60, Math.min(DURACION_S, Math.floor((hasta - ahora) / 1000)));
  const valor = await crearSesion(datos, RRHH_SESSION_SECRET);
  const ui = encodeURIComponent((datos.confidencial ? 'c|' : 'e|') + datos.nombre);
  return ir(url.origin + (datos.confidencial ? '/' : '/hub-index.html'), [
    `${COOKIE}=${valor}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
    `bc_rrhh_ui=${ui}; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`,
  ]);
}
