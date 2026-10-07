// Sesión del Hub de RRHH con PIN personal (bc-usuarios → app_login('rrhh', pin)).
// Cookie firmada HMAC-SHA256: bc_rrhh = base64url(JSON {i,n,c,e}) + "." + firma.
//   i = id de la persona · n = nombre · c = 1 si ve lo confidencial · e = vence (ms)
// Web Crypto: sirve igual en el middleware (edge), en funciones edge y en Node 20.
export const COOKIE = 'bc_rrhh';
export const DURACION_S = 12 * 60 * 60; // 12 horas

const enc = new TextEncoder();
function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function desdeB64url(t) {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function firma(texto, secreto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto))));
}
function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function crearSesion(persona, secreto) {
  const datos = { i: persona.id, n: persona.nombre, c: persona.confidencial ? 1 : 0, e: Date.now() + DURACION_S * 1000 };
  const cuerpo = b64url(enc.encode(JSON.stringify(datos)));
  return cuerpo + '.' + (await firma(cuerpo, secreto));
}

// Devuelve { id, nombre, confidencial } o null si no hay sesión válida.
export async function leerSesion(valor, secreto) {
  try {
    if (!valor || !secreto) return null;
    const p = valor.lastIndexOf('.');
    if (p < 1) return null;
    const cuerpo = valor.slice(0, p), sig = valor.slice(p + 1);
    if (!igual(sig, await firma(cuerpo, secreto))) return null;
    const d = JSON.parse(new TextDecoder().decode(desdeB64url(cuerpo)));
    if (!d || !d.e || Date.now() > d.e) return null;
    return { id: d.i, nombre: d.n, confidencial: d.c === 1 };
  } catch (e) { return null; }
}

export function leerCookie(header, nombre) {
  if (!header) return '';
  for (const parte of String(header).split(/;\s*/)) {
    const eq = parte.indexOf('=');
    if (eq > 0 && parte.slice(0, eq) === nombre) {
      try { return decodeURIComponent(parte.slice(eq + 1)); } catch (e) { return parte.slice(eq + 1); }
    }
  }
  return '';
}

// Qué pide cada ruta: 'publico' · 'equipo' (rrhh.entrar) · 'confidencial' (rrhh.confidencial)
export function nivelDeRuta(ruta, metodo) {
  let r = ruta || '/';
  try { r = decodeURIComponent(r); } catch (e) {}
  if (/^\/api\/(login|health|log)$/.test(r)) return 'publico';
  if (/^\/(blackchicken_logo\.png|design-tokens\.css|version\.json|favicon\.ico|robots\.txt)$/.test(r)) return 'publico';
  if (/^\/BC_Publicacion_[A-Za-z0-9_]+\.html$/.test(r)) return 'publico'; // se comparten con postulantes
  if (r === '/' || r === '/index.html' || r === '/index') return 'confidencial'; // ATS: datos de postulantes
  if (/^\/(BC_CartaOferta_|BlackChicken_Oferta_|BC_HR_)/i.test(r)) return 'confidencial';
  if (/^\/api\/(procesos|proceso|dotacion|token|hr-templates|auth)\/?$/i.test(r)) return 'confidencial';
  if (/^\/api\/pub-status\/?$/i.test(r) && metodo && metodo !== 'GET') return 'confidencial';
  return 'equipo';
}
