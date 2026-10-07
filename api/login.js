// Login del Hub de RRHH con PIN personal. Runtime edge (Web Crypto, igual que el middleware).
//   POST {pin} → valida con app_login('rrhh', pin) de Supabase (bc-usuarios) y deja la cookie
//   GET        → quién soy { nombre, confidencial } (401 sin sesión)
//   DELETE     → salir
import { COOKIE, DURACION_S, crearSesion, leerSesion, leerCookie } from '../lib/sesion.js';

export const config = { runtime: 'edge' };

const json = (cuerpo, status, extra) => new Response(JSON.stringify(cuerpo), {
  status: status || 200,
  headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extra || {}),
});
const cookie = (valor, maxAge) => `${COOKIE}=${valor}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
// Pista para la interfaz (qué tarjetas mostrar y el nombre en el encabezado). NO da acceso:
// lo que vale es la cookie firmada; el middleware decide en el servidor.
const cookieUi = (valor, maxAge) => `bc_rrhh_ui=${valor}; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

export default async function handler(request) {
  const secreto = process.env.RRHH_SESSION_SECRET;
  const SB = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!secreto || !SB || !KEY) return json({ error: 'Acceso no configurado' }, 503);

  if (request.method === 'GET') {
    const s = await leerSesion(leerCookie(request.headers.get('cookie'), COOKIE), secreto);
    return s ? json({ nombre: s.nombre, confidencial: s.confidencial }) : json({ error: 'Sin sesión' }, 401);
  }
  if (request.method === 'DELETE') {
    const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
    h.append('set-cookie', cookie('', 0)); h.append('set-cookie', cookieUi('', 0));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
  }
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const pin = String((body && body.pin) || '').trim();
  if (!/^\d{4,8}$/.test(pin)) return json({ error: 'PIN incorrecto' }, 401);

  let filas;
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/app_login`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_app: 'rrhh', p_pin: pin }),
    });
    if (!r.ok) throw new Error('app_login ' + r.status);
    filas = await r.json();
  } catch (e) {
    console.error('login rrhh: ' + String(e && e.message));
    return json({ error: 'No se pudo validar el PIN. Intenta de nuevo.' }, 502);
  }
  const p = Array.isArray(filas) ? filas[0] : null;
  if (!p) {
    await new Promise((ok) => setTimeout(ok, 700)); // frena intentos seguidos
    return json({ error: 'PIN incorrecto o sin acceso al Hub de RRHH' }, 401);
  }
  const persona = { id: p.person_id, nombre: p.person_name, confidencial: !!p.puede_cerrar };
  const valor = await crearSesion(persona, secreto);
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  h.append('set-cookie', cookie(valor, DURACION_S));
  h.append('set-cookie', cookieUi(encodeURIComponent((persona.confidencial ? 'c|' : 'e|') + persona.nombre), DURACION_S));
  return new Response(JSON.stringify({ nombre: persona.nombre, confidencial: persona.confidencial }), { status: 200, headers: h });
}
