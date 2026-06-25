// Obsoleto. Reemplazado por /api/token (botón "Copiar token" en el hub).
export default async function handler(req, res) {
  res.status(410).json({ ok: false, error: 'Endpoint obsoleto. Usa /api/token.' });
}
