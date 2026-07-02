// Gate de acceso a nivel de plataforma (Vercel Routing Middleware, runtime edge).
// Protege TODO el deployment (documentos .html + /api) con una clave compartida.
// FAIL-OPEN: si no están definidas BC_GATE_SECRET y BC_GATE_PASSWORD, el gate
// queda inactivo y todo pasa normal. Se activa recién cuando ambas env vars existen.
// El endpoint /api/gate-login queda excluido para poder autenticarse.

export const config = { matcher: ['/((?!api/gate-login).*)'] };

const COOKIE = 'bc_gate';

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
async function isValid(cookieVal, secret) {
  if (!cookieVal) return false;
  const dot = cookieVal.lastIndexOf('.');
  if (dot < 1) return false;
  const payload = cookieVal.slice(0, dot);
  const sig = cookieVal.slice(dot + 1);
  const exp = parseInt(payload, 10);
  if (!exp || Date.now() > exp) return false;
  const expected = await sign(payload, secret);
  return safeEqual(sig, expected);
}
function readCookie(header, name) {
  if (!header) return '';
  const parts = header.split(/;\s*/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf('=');
    if (eq > 0 && p.slice(0, eq) === name) {
      try { return decodeURIComponent(p.slice(eq + 1)); } catch (e) { return p.slice(eq + 1); }
    }
  }
  return '';
}

const LOGIN_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Acceso · Black Chicken RRHH</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f0f0f;color:#e6e6e6;font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:36px 32px;width:100%;max-width:380px;text-align:center}
  .brand{font-size:12px;letter-spacing:.18em;color:#D4A843;font-weight:800;text-transform:uppercase;margin-bottom:6px}
  h1{font-size:20px;font-weight:700;margin-bottom:6px}
  p.sub{color:#9a9a9a;font-size:13px;margin-bottom:22px}
  input{width:100%;padding:12px 14px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:10px;color:#fff;font-size:15px;outline:none;text-align:center;letter-spacing:.05em}
  input:focus{border-color:#D4A843}
  button{width:100%;margin-top:12px;padding:12px 14px;background:#D4A843;color:#0a0a0a;border:0;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer}
  button:disabled{opacity:.6;cursor:default}
  .err{color:#e05555;font-size:13px;margin-top:12px;min-height:18px}
  .foot{color:#6a6a6a;font-size:11px;margin-top:18px}
</style></head><body>
  <form class="card" id="f">
    <div class="brand">Black Chicken · RRHH</div>
    <h1>Acceso restringido</h1>
    <p class="sub">Ingresa la clave del equipo para continuar.</p>
    <input id="pw" type="password" placeholder="Clave de acceso" autocomplete="current-password" autofocus>
    <button id="b" type="submit">Entrar</button>
    <div class="err" id="e"></div>
    <div class="foot">Uso interno · Black Chicken</div>
  </form>
<script>
  var f=document.getElementById('f'),pw=document.getElementById('pw'),b=document.getElementById('b'),e=document.getElementById('e');
  f.addEventListener('submit',function(ev){
    ev.preventDefault();
    b.disabled=true;b.textContent='Verificando…';e.textContent='';
    fetch('/api/gate-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw.value})})
      .then(function(r){return r.json().then(function(d){return {ok:r.ok&&d&&d.ok};});})
      .then(function(res){
        if(res.ok){ location.reload(); }
        else { b.disabled=false;b.textContent='Entrar';e.textContent='Clave incorrecta';pw.value='';pw.focus(); }
      })
      .catch(function(){ b.disabled=false;b.textContent='Entrar';e.textContent='Error de conexión — reintenta'; });
  });
</script>
</body></html>`;

export default async function middleware(request) {
  try {
    const SECRET = process.env.BC_GATE_SECRET;
    const PASSWORD = process.env.BC_GATE_PASSWORD;
    // Fail-open: gate inactivo hasta que ambas env vars estén configuradas.
    if (!SECRET || !PASSWORD) return;

    const cookie = readCookie(request.headers.get('cookie'), COOKIE);
    if (await isValid(cookie, SECRET)) return; // autenticado -> continuar

    const accept = request.headers.get('accept') || '';
    if (accept.indexOf('text/html') !== -1) {
      return new Response(LOGIN_HTML, {
        status: 401,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    return new Response(JSON.stringify({ error: 'No autorizado' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  } catch (e) {
    return; // fail-open ante cualquier error: nunca bloquear por un bug del gate
  }
}
