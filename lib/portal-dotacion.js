// Acceso servidor-a-servidor del colector de bc-portal (solo lectura, solo agregados).
// Un token dedicado (RRHH_PORTAL_READ_TOKEN, header "Authorization: Bearer …") autoriza
// ÚNICAMENTE GET /api/portal-dotacion. No abre otras rutas ni métodos, no reemplaza el PIN
// y no se acepta en la URL ni en cookies.
// Sin dependencias: Web Crypto + funciones puras, sirve en el middleware (edge), en la
// función edge y en Node 20 (tests).
export const RUTA_SERVICIO = '/api/portal-dotacion';
export const ESQUEMA = 'portal-dotacion/1';
export const ENV_TOKEN = 'RRHH_PORTAL_READ_TOKEN';

const enc = new TextEncoder();
const json = (cuerpo, status, extra) => new Response(JSON.stringify(cuerpo), {
  status,
  headers: Object.assign({ 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, extra || {}),
});

// Cualquier variante de la ruta de servicio (mayúsculas, slash final o doble, %-encoding,
// ".js", subrutas). Todas pasan por el control de token; solo la forma exacta se sirve.
export function esRutaServicio(ruta) {
  let r = ruta || '/';
  try { r = decodeURIComponent(r); } catch (e) {}
  return /^\/+api\/+portal-dotacion(\.js)?(\/.*)?$/i.test(r);
}

// Secreto aceptable: base64url de ≥ 32 bytes (43+ caracteres) y sin patrones triviales.
export function tokenConfigurado(secreto) {
  if (typeof secreto !== 'string' || !/^[A-Za-z0-9_-]{43,256}$/.test(secreto)) return false;
  return new Set(secreto).size >= 16;
}

// Solo "Authorization: Bearer <token>" (esquema sin importar mayúsculas). Nada de listas
// con coma, otros esquemas ni caracteres fuera de base64url.
export function leerBearer(header) {
  const m = /^\s*Bearer +([A-Za-z0-9_-]+)\s*$/i.exec(header || '');
  return m ? m[1] : '';
}

// Comparación en tiempo constante: se comparan los SHA-256, así tampoco se filtra el largo.
export async function igualSeguro(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let r = 0;
  for (let i = 0; i < u.length; i++) r |= u[i] ^ v[i];
  return r === 0;
}

// null = autorizado; si no, la Response de rechazo. Lo usan el middleware y el handler.
export async function autorizarServicio(request, env) {
  const vars = env || (typeof process !== 'undefined' ? process.env : {});
  const secreto = vars[ENV_TOKEN];
  if (!tokenConfigurado(secreto)) return json({ error: 'Acceso de servicio no configurado' }, 503);
  const tok = leerBearer(request.headers.get('authorization'));
  if (!tok || !(await igualSeguro(tok, secreto))) return json({ error: 'No autorizado' }, 401, { 'www-authenticate': 'Bearer' });
  const url = new URL(request.url);
  if (url.pathname !== RUTA_SERVICIO) return json({ error: 'No encontrado' }, 404);
  if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405, { allow: 'GET' });
  if (url.search) return json({ error: 'Esta ruta no acepta parámetros' }, 400);
  return null;
}

// ── Agregado de dotación ─────────────────────────────────────────────────────
// Reproduce exactamente las reglas de bc-portal scripts/bc_sources.py dotacion():
// activos (estado vacío = Activo), sin DUENOS, áreas por cargo y bruto imputado por local
// con el promedio entero de quienes sí tienen sueldo. NO devuelve filas, nombres ni
// sueldos individuales: solo conteos y sumas por local.
export const DUENOS = new Set(['Jonathan Fosk', 'Daniel Fosk', 'Llige Yang']);
const COCINA = ['Cocinero', 'Cocinera', 'Copera', 'Jefe de Cocina', 'Sous Chef', 'Chef', 'Subjefe de Cocina'];
const SALON = ['Garzón', 'Garzon', 'Garzona', 'Entrenador', 'Entrenadora', 'Jefe de Salón', 'Jefe de Garzones'];

export function area(cargo) {
  const c = cargo ? String(cargo) : '';
  if (COCINA.some((k) => c.includes(k))) return 'cocina';
  if (SALON.some((k) => c.includes(k))) return 'salon';
  return 'otros';
}

// Python: int(str(x or "").strip()) si .isdigit(), si no None.
export function bruto(p) {
  const s = String(p.sueldo_bruto || '').trim();
  return /^[0-9]+$/.test(s) ? Number(s) : null;
}

// Forma mínima de cada fila de la fuente. Una sola fila mala invalida toda la respuesta:
// filtrarla haría pasar por completa una dotación a la que le falta gente. Los mensajes
// solo llevan el índice de la fila, nunca datos de la persona.
const opcionalTexto = (v) => v === undefined || v === null || typeof v === 'string';
export function validarFila(p, i) {
  const mal = (msg) => { throw new Error(`fila ${i}: ${msg}`); };
  if (!p || typeof p !== 'object' || Array.isArray(p)) mal('no es un objeto');
  if (typeof p.nombre !== 'string' || !p.nombre.trim()) mal('sin nombre');
  if (typeof p.local !== 'string' || !p.local.trim()) mal('sin local');
  if (!opcionalTexto(p.estado)) mal('estado no es texto');
  if (!opcionalTexto(p.cargo)) mal('cargo no es texto');
  // sueldo_bruto: vacío/null/0 o texto no numérico ("1.000.000") = sin sueldo, como antes.
  // Números: solo enteros seguros ≥ 0. Booleanos, listas u objetos no son sueldos.
  const s = p.sueldo_bruto;
  if (typeof s === 'number' ? !(Number.isSafeInteger(s) && s >= 0) : !opcionalTexto(s)) mal('sueldo_bruto inválido');
  const b = bruto(p);
  if (b !== null && !Number.isSafeInteger(b)) mal('sueldo_bruto fuera de rango');
}

// Lanza Error si la fuente no trae datos utilizables: nunca se responde vacío como éxito.
export function agregarDotacion(gente) {
  if (!Array.isArray(gente)) throw new Error('la fuente no devolvió una lista');
  if (!gente.length) throw new Error('la fuente devolvió una lista vacía');
  gente.forEach(validarFila);

  const activos = gente.filter((p) => (p.estado || 'Activo') === 'Activo');
  const equipo = activos.filter((p) => !DUENOS.has(p.nombre));
  if (!equipo.length) throw new Error('la fuente no trae equipo activo');

  const out = { esquema: ESQUEMA, generado: new Date().toISOString(), locales: {}, backoffice: {}, total: {} };
  for (const local of ['BC1', 'BC2', 'Backoffice']) {
    const g = equipo.filter((p) => p.local === local);
    const con = g.filter((p) => bruto(p) !== null);
    const sin = g.length - con.length;
    const suma = con.reduce((s, p) => s + bruto(p), 0);
    const prom = con.length ? Math.floor(suma / con.length) : 0;
    const por = { cocina: 0, salon: 0, otros: 0 };
    for (const p of g) por[area(p.cargo)] += 1;
    const d = {
      headcount: g.length, con_sueldo: con.length, sin_sueldo: sin,
      bruto_cargado: suma, bruto_imputado: prom * sin, bruto_total: suma + prom * sin,
      promedio: prom, cobertura: g.length ? con.length / g.length : 0, por_area: por,
    };
    (local === 'Backoffice' ? out.backoffice : out.locales)[local] = d;
  }
  const locales = out.locales.BC1.bruto_total + out.locales.BC2.bruto_total;
  const bo = out.backoffice.Backoffice.bruto_total;
  out.total = {
    headcount_equipo: equipo.length, headcount_con_duenos: activos.length,
    bruto_locales: locales, bruto_backoffice: bo, bruto_total: locales + bo,
    duenos_sin_nomina: activos.length - equipo.length,
  };
  // Todas las sumas son ≤ bruto_total: si este es entero seguro, ninguna perdió precisión.
  if (!Number.isSafeInteger(out.total.bruto_total)) throw new Error('sumas fuera de rango');
  return out;
}
