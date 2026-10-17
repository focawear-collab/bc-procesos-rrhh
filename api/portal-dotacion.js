// Dotación AGREGADA para el colector de bc-portal (servidor a servidor, solo lectura).
//   GET con "Authorization: Bearer $RRHH_PORTAL_READ_TOKEN" → conteos y sumas por local
// Sin filas, nombres ni sueldos individuales (ver lib/portal-dotacion.js). El middleware ya
// valida el token; aquí se vuelve a validar (defensa en profundidad).
// FAIL-CLOSED: fuente sin configurar, caída o con formato raro → 502/503, nunca [] ni ceros.
import { autorizarServicio, agregarDotacion } from '../lib/portal-dotacion.js';

export const config = { runtime: 'edge' };

const json = (cuerpo, status) => new Response(JSON.stringify(cuerpo), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

export default async function handler(request) {
  const negado = await autorizarServicio(request);
  if (negado) return negado;

  const SHEET_URL = process.env.BC_HR_SHEET_URL;
  if (!SHEET_URL) return json({ error: 'Fuente de dotación no configurada' }, 503);

  let gente;
  try {
    // El Apps Script responde con un redirect a googleusercontent: se sigue, pero a esta
    // petición no va ningún header del cliente (el token no sale de aquí).
    const sep = SHEET_URL.includes('?') ? '&' : '?';
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined;
    const r = await fetch(SHEET_URL + sep + 'tab=equipo', { redirect: 'follow', headers: { accept: 'application/json' }, signal });
    if (!r.ok) throw new Error('status ' + r.status);
    gente = await r.json();
  } catch (e) {
    console.error('portal-dotacion: fuente no disponible (' + String((e && (e.name === 'Error' ? e.message : e.name)) || 'error') + ')');
    return json({ error: 'No se pudo leer la fuente de dotación' }, 502);
  }

  try {
    return json(agregarDotacion(gente), 200);
  } catch (e) {
    console.error('portal-dotacion: fuente inválida (' + String(e && e.message) + ')');
    return json({ error: 'La fuente de dotación respondió con un formato inválido' }, 502);
  }
}
