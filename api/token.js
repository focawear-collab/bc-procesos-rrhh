// Entrega el token de un dashboard para copiar al portapapeles.
// Los tokens viven en env vars (no en el HTML del hub ni en git).
export default async function handler(req, res) {
  const tokens = {
    autoeval: process.env.DASH_AUTOEVAL_TOKEN,
    servicio: process.env.DASH_SERVICIO_TOKEN
  };

  const key = (req.query.d || '').toString();
  const token = tokens[key];

  res.setHeader('Cache-Control', 'no-store');

  if (!token) {
    res.status(404).json({ ok: false, error: 'Dashboard no encontrado o token no configurado' });
    return;
  }

  res.status(200).json({ ok: true, token });
}
