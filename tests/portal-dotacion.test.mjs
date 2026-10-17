// Tests del acceso servidor-a-servidor /api/portal-dotacion y de que el PIN sigue igual.
// Solo node:test + node:assert, sin dependencias ni red: fetch se reemplaza por un fake.
// Datos 100% sintéticos (personas, secretos y sesiones inventados para el test).
//   node --test tests/portal-dotacion.test.mjs   (Node ≥ 20.19 / 22.12: detecta ESM en los .js del repo)
// Con archivo explícito: "node --test tests/" falla en Node 24 (MODULE_NOT_FOUND).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../middleware.js';
import handler from '../api/portal-dotacion.js';
import { crearSesion, COOKIE } from '../lib/sesion.js';
import { agregarDotacion, tokenConfigurado, leerBearer, esRutaServicio, igualSeguro, ESQUEMA } from '../lib/portal-dotacion.js';

const TOKEN = 'SINTETICO-solo-tests-0123456789abcdefghijklmnopqrstuvwxyzABCD';
const SESION_SECRETA = 'secreto-de-sesion-sintetico-para-tests-0123456789';
const SHEET = 'https://sheet.invalid/exec';
const BASE = 'https://rrhh.test';

// Mismas filas y mismo resultado esperado que portal/tests/test_dotacion_rrhh.py.
const FILAS = [
  { nombre: 'Persona A', estado: 'Activo', local: 'BC1', cargo: 'Cocinero', sueldo_bruto: '800000' },
  { nombre: 'Persona B', estado: '', local: 'BC1', cargo: 'Garzón', sueldo_bruto: 700000 },
  { nombre: 'Persona C', local: 'BC1', cargo: 'Cajera', sueldo_bruto: '' },
  { nombre: 'Persona D', estado: 'Inactivo', local: 'BC1', cargo: 'Chef', sueldo_bruto: '900000' },
  { nombre: 'Jonathan Fosk', estado: 'Activo', local: 'BC1', cargo: 'Socio', sueldo_bruto: '' },
  { nombre: 'Persona E', estado: 'Activo', local: 'BC2', cargo: 'Sous Chef', sueldo_bruto: ' 1000000 ' },
  { nombre: 'Persona F', estado: 'Activo', local: 'BC2', cargo: 'Jefe de Garzones', sueldo_bruto: '1.000.000' },
  { nombre: 'Persona G', estado: 'Activo', local: 'Backoffice', cargo: 'Administrador', sueldo_bruto: '1200000' },
  { nombre: 'Persona H', estado: 'Activo', local: 'Externo', cargo: 'Copera', sueldo_bruto: '500000' },
  { nombre: 'Persona I', estado: 'Activo', local: 'BC2', cargo: null, sueldo_bruto: null },
];
const ESPERADO = {
  esquema: 'portal-dotacion/1',
  locales: {
    BC1: { headcount: 3, con_sueldo: 2, sin_sueldo: 1, bruto_cargado: 1500000, bruto_imputado: 750000,
           bruto_total: 2250000, promedio: 750000, cobertura: 2 / 3, por_area: { cocina: 1, salon: 1, otros: 1 } },
    BC2: { headcount: 3, con_sueldo: 1, sin_sueldo: 2, bruto_cargado: 1000000, bruto_imputado: 2000000,
           bruto_total: 3000000, promedio: 1000000, cobertura: 1 / 3, por_area: { cocina: 1, salon: 1, otros: 1 } },
  },
  backoffice: {
    Backoffice: { headcount: 1, con_sueldo: 1, sin_sueldo: 0, bruto_cargado: 1200000, bruto_imputado: 0,
                  bruto_total: 1200000, promedio: 1200000, cobertura: 1, por_area: { cocina: 0, salon: 0, otros: 1 } },
  },
  total: { headcount_equipo: 8, headcount_con_duenos: 9, bruto_locales: 5250000, bruto_backoffice: 1200000,
           bruto_total: 6450000, duenos_sin_nomina: 1 },
};

const sinFecha = (o) => { const c = { ...o }; delete c.generado; return c; };
const req = (path, { method = 'GET', auth, cookie } = {}) => {
  const h = new Headers();
  if (auth !== undefined) h.set('authorization', auth);
  if (cookie) h.set('cookie', cookie);
  return new Request(BASE + path, { method, headers: h });
};
const bearer = 'Bearer ' + TOKEN;
const sesion = async (confidencial) => COOKIE + '=' + encodeURIComponent(
  await crearSesion({ id: 'p-sintetica', nombre: 'Usuaria Sintética', confidencial }, SESION_SECRETA));

let fetchOriginal, envOriginal, llamadas;
const fakeFetch = (impl) => { globalThis.fetch = async (url, opts) => { llamadas.push({ url: String(url), opts }); return impl(url, opts); }; };
const okJson = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  envOriginal = { ...process.env };
  llamadas = [];
  process.env.RRHH_PORTAL_READ_TOKEN = TOKEN;
  process.env.RRHH_SESSION_SECRET = SESION_SECRETA;
  process.env.BC_HR_SHEET_URL = SHEET;
  globalThis.fetch = async () => { throw new Error('red prohibida en tests'); };
});
afterEach(() => {
  globalThis.fetch = fetchOriginal;
  for (const k of Object.keys(process.env)) if (!(k in envOriginal)) delete process.env[k];
  Object.assign(process.env, envOriginal);
});

// ── piezas ────────────────────────────────────────────────────────────────────
test('tokenConfigurado exige base64url largo y variado', () => {
  assert.equal(tokenConfigurado(undefined), false);
  assert.equal(tokenConfigurado(''), false);
  assert.equal(tokenConfigurado('corto-123'), false);
  assert.equal(tokenConfigurado('a'.repeat(64)), false);
  assert.equal(tokenConfigurado('ab'.repeat(32)), false);
  assert.equal(tokenConfigurado(TOKEN.slice(0, 40) + ' +/='), false);
  assert.equal(tokenConfigurado(TOKEN), true);
});

test('leerBearer normaliza el esquema y rechaza formas ambiguas', () => {
  assert.equal(leerBearer('Bearer ' + TOKEN), TOKEN);
  assert.equal(leerBearer('bearer ' + TOKEN), TOKEN);
  assert.equal(leerBearer('  BEARER   ' + TOKEN + '  '), TOKEN);
  for (const malo of [undefined, null, '', TOKEN, 'Basic ' + TOKEN, 'Bearer', 'Bearer ', 'Bearer' + TOKEN,
                      `Bearer ${TOKEN}, Bearer ${TOKEN}`, `Bearer ${TOKEN} extra`, 'Token ' + TOKEN]) {
    assert.equal(leerBearer(malo), '', String(malo));
  }
});

test('igualSeguro compara exacto', async () => {
  assert.equal(await igualSeguro(TOKEN, TOKEN), true);
  assert.equal(await igualSeguro(TOKEN, TOKEN + 'x'), false);
  assert.equal(await igualSeguro(TOKEN.slice(1), TOKEN), false);
  assert.equal(await igualSeguro('', TOKEN), false);
});

test('esRutaServicio detecta variantes de la ruta', () => {
  for (const r of ['/api/portal-dotacion', '/api/portal-dotacion/', '/API/Portal-Dotacion', '/api/portal-dotacion.js',
                   '/api/portal-dotacion/x', '//api/portal-dotacion', '/api//portal-dotacion', '/api/%70ortal-dotacion']) {
    assert.equal(esRutaServicio(r), true, r);
  }
  for (const r of ['/api/dotacion', '/api/portal-dotacionx', '/portal-dotacion', '/', '/api/login']) {
    assert.equal(esRutaServicio(r), false, r);
  }
});

// ── reglas de negocio: mismas que bc_sources.dotacion() ──────────────────────
test('agregarDotacion reproduce las reglas actuales sin nombres ni filas', () => {
  const r = agregarDotacion(FILAS);
  assert.equal(r.esquema, ESQUEMA);
  assert.match(r.generado, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(sinFecha(r), ESPERADO);
  const texto = JSON.stringify(r);
  for (const prohibido of ['Persona', 'Jonathan', 'nombre', 'sueldo_bruto', 'cargo', 'estado', 'Cocinero', 'sin_sueldo_nombres']) {
    assert.equal(texto.includes(prohibido), false, prohibido);
  }
});

test('agregarDotacion falla ante datos inutilizables (sin falsos verdes)', () => {
  for (const malo of [null, undefined, {}, 'x', 0, [], [null], [[1]], ['texto'],
                      [{ nombre: 'Persona X', estado: 'Inactivo', local: 'BC1' }],
                      [{ nombre: 'Daniel Fosk', estado: 'Activo', local: 'BC1' }]]) {
    assert.throws(() => agregarDotacion(malo), Error, JSON.stringify(malo));
  }
});

// Filas malformadas: cada una sola y mezclada con FILAS válidas debe fallar (no se filtran).
const FILA_OK = { nombre: 'Persona Y', estado: 'Activo', local: 'BC1', cargo: 'Cocinero', sueldo_bruto: '800000' };
const FILAS_MALAS = [
  {},
  { error: 'Exception: hoja no encontrada' },
  { ...FILA_OK, nombre: undefined },
  { ...FILA_OK, nombre: '' },
  { ...FILA_OK, nombre: '   ' },
  { ...FILA_OK, nombre: 42 },
  { ...FILA_OK, local: undefined },
  { ...FILA_OK, local: '' },
  { ...FILA_OK, local: null },
  { ...FILA_OK, local: ['BC1'] },
  { ...FILA_OK, estado: 1 },
  { ...FILA_OK, estado: true },
  { ...FILA_OK, estado: [] },
  { ...FILA_OK, cargo: 7 },
  { ...FILA_OK, cargo: { a: 1 } },
  { ...FILA_OK, sueldo_bruto: true },
  { ...FILA_OK, sueldo_bruto: [800000] },
  { ...FILA_OK, sueldo_bruto: { v: 800000 } },
  { ...FILA_OK, sueldo_bruto: Infinity },
  { ...FILA_OK, sueldo_bruto: NaN },
  { ...FILA_OK, sueldo_bruto: -1 },
  { ...FILA_OK, sueldo_bruto: 800000.5 },
  { ...FILA_OK, sueldo_bruto: 2 ** 53 },
  { ...FILA_OK, sueldo_bruto: '9'.repeat(400) },
  { ...FILA_OK, sueldo_bruto: '9007199254740993' },
];

test('agregarDotacion rechaza filas malformadas, solas o mezcladas con válidas', () => {
  for (const mala of FILAS_MALAS) {
    assert.throws(() => agregarDotacion([mala]), Error, JSON.stringify(mala));
    assert.throws(() => agregarDotacion([...FILAS, mala]), Error, 'mezcla ' + JSON.stringify(mala));
    assert.throws(() => agregarDotacion([mala, ...FILAS]), Error, 'mezcla ' + JSON.stringify(mala));
  }
  assert.throws(() => agregarDotacion([{}]), /fila 0: sin nombre/);
  assert.throws(() => agregarDotacion([...FILAS, { ...FILA_OK, local: '' }]), /fila 10: sin local/);
});

test('agregarDotacion: los mensajes de error no llevan datos de la persona', () => {
  const canario = { ...FILA_OK, nombre: 'Canario Nominal', sueldo_bruto: { v: 'SUELDO-CANARIO' } };
  assert.throws(() => agregarDotacion([canario]), (e) =>
    !e.message.includes('Canario') && !e.message.includes('SUELDO-CANARIO') && /fila 0/.test(e.message));
});

test('agregarDotacion: sumas que exceden enteros seguros fallan', () => {
  const grandes = [0, 1, 2].map((i) => ({ ...FILA_OK, nombre: 'Persona ' + i, sueldo_bruto: Number.MAX_SAFE_INTEGER - i }));
  assert.throws(() => agregarDotacion(grandes), /fuera de rango/);
});

test('agregarDotacion mantiene las formas vacías reconocidas y local ajeno', () => {
  // Sin sueldo como antes: '', null, ausente, 0 (falsy, igual que Python) y texto no numérico.
  const filas = [
    { nombre: 'Persona 1', local: 'BC1', sueldo_bruto: '' },
    { nombre: 'Persona 2', local: 'BC1', sueldo_bruto: null },
    { nombre: 'Persona 3', local: 'BC1' },
    { nombre: 'Persona 4', local: 'BC1', sueldo_bruto: 0 },
    { nombre: 'Persona 5', local: 'BC1', sueldo_bruto: '1.000.000' },
    { nombre: 'Persona 6', local: 'BC1', sueldo_bruto: 'pendiente' },
    { nombre: 'Persona 7', local: 'BC1', estado: null, cargo: null, sueldo_bruto: '600000' },
    { nombre: 'Persona 8', local: 'Externo', sueldo_bruto: '500000' },
  ];
  const r = agregarDotacion(filas);
  assert.equal(r.locales.BC1.headcount, 7);
  assert.equal(r.locales.BC1.con_sueldo, 1);
  assert.equal(r.locales.BC1.sin_sueldo, 6);
  assert.equal(r.locales.BC1.bruto_total, 600000 * 7);
  assert.equal(r.total.headcount_equipo, 8);
});

// ── middleware: ruta de servicio ─────────────────────────────────────────────
test('servicio: token válido + GET exacto pasa al handler', async () => {
  assert.equal(await middleware(req('/api/portal-dotacion', { auth: bearer })), undefined);
  assert.equal(await middleware(req('/api/portal-dotacion', { auth: 'bearer  ' + TOKEN })), undefined);
});

test('servicio: sin secreto configurado o secreto débil → 503', async () => {
  delete process.env.RRHH_PORTAL_READ_TOKEN;
  let r = await middleware(req('/api/portal-dotacion', { auth: bearer }));
  assert.equal(r.status, 503);
  process.env.RRHH_PORTAL_READ_TOKEN = 'x'.repeat(60);
  r = await middleware(req('/api/portal-dotacion', { auth: 'Bearer ' + 'x'.repeat(60) }));
  assert.equal(r.status, 503);
});

test('servicio: token ausente, incorrecto o en lugar indebido → 401', async () => {
  const casos = [
    req('/api/portal-dotacion'),
    req('/api/portal-dotacion', { auth: '' }),
    req('/api/portal-dotacion', { auth: 'Bearer ' + TOKEN.slice(0, -1) + 'Z' }),
    req('/api/portal-dotacion', { auth: 'Bearer ' + TOKEN + 'x' }),
    req('/api/portal-dotacion', { auth: 'Basic ' + TOKEN }),
    req('/api/portal-dotacion', { auth: TOKEN }),
    req('/api/portal-dotacion?token=' + TOKEN),
    req('/api/portal-dotacion?access_token=' + TOKEN),
    req('/api/portal-dotacion', { cookie: 'token=' + TOKEN + '; authorization=' + encodeURIComponent(bearer) }),
    req('/api/portal-dotacion', { cookie: await sesion(true) }),          // el PIN no abre la ruta de servicio
    req('/api/portal-dotacion', { method: 'POST' }),
  ];
  for (const c of casos) {
    const r = await middleware(c);
    assert.equal(r.status, 401, c.url);
    assert.equal(r.headers.get('www-authenticate'), 'Bearer');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.equal((await r.text()).includes(TOKEN), false);
  }
});

test('servicio: token válido no habilita otros métodos', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const r = await middleware(req('/api/portal-dotacion', { method, auth: bearer }));
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'GET');
  }
});

test('servicio: token válido no habilita variantes de la ruta', async () => {
  for (const p of ['/api/portal-dotacion/', '/API/portal-dotacion', '/api/portal-dotacion.js', '/api/portal-dotacion/x',
                   '//api/portal-dotacion', '/api//portal-dotacion', '/api/%70ortal-dotacion']) {
    const r = await middleware(req(p, { auth: bearer }));
    assert.equal(r.status, 404, p);
  }
  const q = await middleware(req('/api/portal-dotacion?x=1', { auth: bearer }));
  assert.equal(q.status, 400);
});

// ── middleware: el token no abre nada más y el PIN sigue igual ───────────────
test('token de servicio en otras rutas no autoriza (sigue pidiendo PIN)', async () => {
  for (const [p, method] of [['/api/dotacion', 'GET'], ['/api/procesos', 'GET'], ['/api/procesos', 'POST'],
                              ['/api/proceso', 'PATCH'], ['/api/proceso', 'DELETE'], ['/api/hr-templates', 'GET'],
                              ['/', 'GET'], ['/BC_HR_Dashboard.html', 'GET'], ['/hub-index.html', 'GET'], ['/api/pub-status', 'POST']]) {
    const r = await middleware(req(p, { method, auth: bearer }));
    assert.ok(r, `${method} ${p} debió rechazarse`);
    assert.equal(r.status, 401, `${method} ${p}`);
  }
});

test('sin secreto de sesión el resto sigue fail-closed aunque venga el token', async () => {
  delete process.env.RRHH_SESSION_SECRET;
  const r = await middleware(req('/api/dotacion', { auth: bearer }));
  assert.equal(r.status, 503);
});

test('PIN: sesión confidencial válida mantiene su acceso', async () => {
  const cookie = await sesion(true);
  for (const p of ['/api/dotacion', '/api/procesos', '/BC_HR_Dashboard.html', '/hub-index.html', '/']) {
    assert.equal(await middleware(req(p, { cookie })), undefined, p);
  }
});

test('PIN: sesión de equipo sigue sin ver lo confidencial', async () => {
  const cookie = await sesion(false);
  assert.equal(await middleware(req('/hub-index.html', { cookie })), undefined);
  assert.equal((await middleware(req('/api/dotacion', { cookie }))).status, 403);
  const raiz = await middleware(req('/', { cookie }));
  assert.equal(raiz.status, 302);
});

test('PIN: sin sesión, sesión falsa o de otro secreto → 401; públicas siguen públicas', async () => {
  assert.equal((await middleware(req('/api/dotacion'))).status, 401);
  assert.equal((await middleware(req('/api/dotacion', { cookie: COOKIE + '=abc.def' }))).status, 401);
  const ajena = COOKIE + '=' + encodeURIComponent(await crearSesion({ id: 'x', nombre: 'X', confidencial: true }, 'otro-secreto-sintetico-0123456789'));
  assert.equal((await middleware(req('/api/dotacion', { cookie: ajena }))).status, 401);
  for (const p of ['/api/login', '/api/health', '/blackchicken_logo.png', '/BC_Publicacion_Copero.html']) {
    assert.equal(await middleware(req(p)), undefined, p);
  }
});

// ── handler ──────────────────────────────────────────────────────────────────
test('handler: éxito devuelve solo el agregado, no-store y sin CORS', async () => {
  fakeFetch(() => okJson(FILAS));
  const r = await handler(req('/api/portal-dotacion', { auth: bearer }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  const body = await r.json();
  assert.deepEqual(sinFecha(body), ESPERADO);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, SHEET + '?tab=equipo');
  const h = new Headers(llamadas[0].opts.headers);
  assert.equal(h.get('authorization'), null, 'el token no se reenvía a la fuente');
  assert.equal(JSON.stringify(llamadas[0]).includes(TOKEN), false);
});

test('handler: URL de la fuente con query usa &', async () => {
  process.env.BC_HR_SHEET_URL = SHEET + '?k=v';
  fakeFetch(() => okJson(FILAS));
  assert.equal((await handler(req('/api/portal-dotacion', { auth: bearer }))).status, 200);
  assert.equal(llamadas[0].url, SHEET + '?k=v&tab=equipo');
});

test('handler: repite el control de token (defensa en profundidad) sin tocar la fuente', async () => {
  fakeFetch(() => okJson(FILAS));
  assert.equal((await handler(req('/api/portal-dotacion'))).status, 401);
  assert.equal((await handler(req('/api/portal-dotacion', { auth: 'Bearer otro' }))).status, 401);
  assert.equal((await handler(req('/api/portal-dotacion', { method: 'POST', auth: bearer }))).status, 405);
  assert.equal((await handler(req('/api/portal-dotacion/', { auth: bearer }))).status, 404);
  delete process.env.RRHH_PORTAL_READ_TOKEN;
  assert.equal((await handler(req('/api/portal-dotacion', { auth: bearer }))).status, 503);
  assert.equal(llamadas.length, 0);
});

test('handler: fuente sin configurar → 503', async () => {
  delete process.env.BC_HR_SHEET_URL;
  const r = await handler(req('/api/portal-dotacion', { auth: bearer }));
  assert.equal(r.status, 503);
});

test('handler: fuente caída o con formato inválido → 502, nunca vacío como éxito', async () => {
  const casos = [
    () => { throw new TypeError('fetch failed'); },
    () => new Response('boom', { status: 500 }),
    () => new Response('{}', { status: 404 }),
    () => new Response('<html>login</html>', { status: 200 }),
    () => okJson({}),
    () => okJson({ error: 'x' }),
    () => okJson([]),
    () => okJson([null]),
    () => okJson(['fila']),
    () => okJson([{ nombre: 'Persona Z', estado: 'Retirado', local: 'BC1' }]),
    () => okJson([{}]),
    () => okJson([{ error: 'Exception: hoja no encontrada' }]),
    () => okJson([{ nombre: 'Persona Z', cargo: 'Cocinero', sueldo_bruto: '800000' }]),
    () => okJson([{ local: 'BC1', cargo: 'Cocinero', sueldo_bruto: '800000' }]),
    () => okJson([...FILAS, {}]),
    () => okJson([...FILAS, { ...FILA_OK, local: '' }]),
    () => okJson([...FILAS, { ...FILA_OK, sueldo_bruto: true }]),
    () => new Response('[{"nombre":"Persona Z","local":"BC1","sueldo_bruto":1e400}]', { status: 200 }),
  ];
  for (const impl of casos) {
    fakeFetch(impl);
    const r = await handler(req('/api/portal-dotacion', { auth: bearer }));
    assert.equal(r.status, 502, String(impl));
    const body = await r.json();
    assert.ok(body.error);
    assert.equal(body.locales, undefined);
  }
});
