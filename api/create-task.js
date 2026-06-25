// Obsoleto. Se optó por embeber la app completa del Task Tracker en el hub.
export default async function handler(req, res) {
  res.status(410).json({ ok: false, error: 'Endpoint no usado. El hub embebe la app completa del Task Tracker.' });
}
