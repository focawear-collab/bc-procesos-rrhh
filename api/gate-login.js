// Login del gate del Hub. Runtime edge (Web Crypto), mismo esquema HMAC que middleware.js.
// Valida la clave contra BC_GATE_PASSWORD y setea cookie firmada bc_gate (HttpOnly).
export const config = { runtime: 'edge' };

const COOKIE = 'bc_gate';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 días

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sign(payload, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64url(new Uint8Array(sig));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function json(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store' }, extraHeaders || {})
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const SECRET = process.env.BC_GATE_SECRET;
  const PASSWORD = process.env.BC_GATE_PASSWORD;
  if (!SECRET || !PASSWORD) return json({ error: 'Gate no configurado' }, 503);

  let body = {};
  try { body = await request.json(); } catch (e) {}
  const pw = (body && body.password != null) ? String(body.password) : '';

  if (!safeEqual(pw, PASSWORD)) return json({ ok: false }, 401);

  const exp = Date.now() + MAX_AGE * 1000;
  const payload = String(exp);
  const sig = await sign(payload, SECRET);
  const value = payload + '.' + sig;
  const cookie = COOKIE + '=' + value + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + MAX_AGE;
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}
