// Acceso al Hub de RRHH con PIN personal (Vercel Routing Middleware, runtime edge).
// Cada persona entra con su PIN de bc-usuarios. Dos niveles (permisos en bc-usuarios):
//   rrhh.entrar       → hub, publicaciones, descriptores, onboarding, desempeño, clima
//   rrhh.confidencial → además cartas oferta, ATS/postulantes, dashboards con sueldos,
//                       calendario, rotación, offboarding, templates, HR Brain, tokens
// La regla de cada ruta vive en lib/sesion.js (nivelDeRuta).
// FAIL-CLOSED: si falta el secreto de sesión, nada privado se sirve.
import { COOKIE, leerSesion, leerCookie, nivelDeRuta } from './lib/sesion.js';

export const config = { matcher: ['/((?!_vercel).*)'] };

const LOGO = '/blackchicken_logo.png';
const PAGINA = (titulo, cuerpo) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo} · Hub de RRHH</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0f0f0f;color:#e6e6e6;font-family:'Inter',system-ui,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:34px 30px;width:100%;max-width:360px;text-align:center}
  .card img{height:46px;margin-bottom:14px}
  .brand{font-size:12px;letter-spacing:.18em;color:#D4A843;font-weight:800;text-transform:uppercase;margin-bottom:6px}
  h1{font-size:20px;font-weight:700;margin-bottom:6px}
  p.sub{color:#9a9a9a;font-size:13px;margin-bottom:22px;line-height:1.5}
  input{width:100%;padding:13px 14px;background:#0f0f0f;border:1px solid #2a2a2a;border-radius:10px;color:#fff;font-size:22px;outline:none;text-align:center;letter-spacing:.4em}
  input:focus{border-color:#D4A843}
  button,a.btn{display:block;width:100%;margin-top:12px;padding:12px 14px;background:#D4A843;color:#0a0a0a;border:0;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;text-decoration:none}
  a.sec{background:transparent;color:#9a9a9a;border:1px solid #2a2a2a}
  button:disabled{opacity:.6;cursor:default}
  .err{color:#e05555;font-size:13px;margin-top:12px;min-height:18px}
  .foot{color:#6a6a6a;font-size:11px;margin-top:18px}
</style></head><body>${cuerpo}</body></html>`;

const LOGIN_HTML = PAGINA('Entrar', `
  <form class="card" id="f">
    <img src="${LOGO}" alt="Black Chicken">
    <div class="brand">Black Chicken · RRHH</div>
    <h1>Hub de RRHH</h1>
    <p class="sub">Entra con tu PIN personal (el mismo de las otras apps de BC).</p>
    <input id="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" autofocus aria-label="PIN">
    <button id="b" type="submit">Entrar</button>
    <div class="err" id="e" role="alert"></div>
    <div class="foot">Uso interno · el acceso se administra en bc-usuarios</div>
  </form>
<script>
  var f=document.getElementById('f'),pin=document.getElementById('pin'),b=document.getElementById('b'),e=document.getElementById('e');
  f.addEventListener('submit',function(ev){
    ev.preventDefault(); if(!pin.value) return;
    b.disabled=true;b.textContent='Verificando…';e.textContent='';
    fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:pin.value})})
      .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
      .then(function(x){
        if(x.ok){ location.reload(); return; }
        b.disabled=false;b.textContent='Entrar';e.textContent=(x.d&&x.d.error)||'PIN incorrecto';pin.value='';pin.focus();
      })
      .catch(function(){ b.disabled=false;b.textContent='Entrar';e.textContent='Error de conexión, intenta de nuevo'; });
  });
</script>`);

const SIN_ACCESO_HTML = (nombre) => PAGINA('Sin acceso', `
  <div class="card">
    <img src="${LOGO}" alt="Black Chicken">
    <div class="brand">Black Chicken · RRHH</div>
    <h1>Documento confidencial</h1>
    <p class="sub">${nombre ? nombre.split(' ')[0].replace(/[<>&"]/g, '') + ', tu' : 'Tu'} acceso no incluye documentos confidenciales de RRHH. Si lo necesitas, pídelo para que lo activen en bc-usuarios.</p>
    <a class="btn" href="/hub-index.html">Volver al hub</a>
  </div>`);

const responder = (cuerpo, status, html) => new Response(html ? cuerpo : JSON.stringify(cuerpo), {
  status,
  headers: { 'content-type': html ? 'text/html; charset=utf-8' : 'application/json', 'cache-control': 'no-store' },
});

export default async function middleware(request) {
  const url = new URL(request.url);
  const nivel = nivelDeRuta(url.pathname, request.method);
  if (nivel === 'publico') return;

  const esApi = url.pathname.startsWith('/api/');
  const secreto = process.env.RRHH_SESSION_SECRET;
  if (!secreto) {
    return esApi ? responder({ error: 'Acceso no configurado' }, 503) : responder(PAGINA('Mantención', '<div class="card"><h1>Hub en mantención</h1><p class="sub">Vuelve en unos minutos.</p></div>'), 503, true);
  }
  const sesion = await leerSesion(leerCookie(request.headers.get('cookie'), COOKIE), secreto);

  if (!sesion) {
    if (esApi) return responder({ error: 'Sesión vencida. Vuelve a entrar con tu PIN.' }, 401);
    return responder(LOGIN_HTML, 401, true);
  }
  if (nivel === 'confidencial' && !sesion.confidencial) {
    if (esApi) return responder({ error: 'Sin acceso a datos confidenciales de RRHH.' }, 403);
    // La raíz es el ATS; quien no ve lo confidencial va directo al hub.
    if (url.pathname === '/' || url.pathname === '/index.html') return Response.redirect(new URL('/hub-index.html', url), 302);
    return responder(SIN_ACCESO_HTML(sesion.nombre), 403, true);
  }
  // autorizado → sigue
}
