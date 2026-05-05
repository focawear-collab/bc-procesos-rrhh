const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
    return;
  }

  const NOTION_TOKEN = process.env.NOTION_TOKEN;
  const DATABASE_ID = process.env.NOTION_DATABASE_ID || '37c3e919a705410cae2430e8f33b99fc';

  if (!NOTION_TOKEN) {
    res.status(500).json({ error: 'NOTION_TOKEN not configured' });
    return;
  }

  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };

  // GET: Fetch all procesos
  if (req.method === 'GET') {
    try {
      const status = req.query.status || 'active'; // 'active', 'all', 'completed'

      const response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          filter: status === 'all' ? undefined : status === 'completed'
            ? { property: 'Estado', status: { equals: 'Listo' } }
            : { property: 'Estado', status: { does_not_equal: 'Listo' } },
          sorts: [{ property: 'Fecha Inicio', direction: 'descending' }]
        })
      });

      if (!response.ok) {
        throw new Error(`Notion API error: ${response.status}`);
      }

      const data = await response.json();
      const procesos = data.results.map(page => parseProcesoPage(page));

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(procesos);
    } catch (error) {
      console.error('Error fetching procesos:', error);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({ error: error.message });
    }
  }
  // POST: Create new proceso
  else if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const candidato = stripHtml(body.candidato);
      const cargo = stripHtml(body.cargo);
      const local = stripHtml(body.local);
      const notas = stripHtml(body.notas);

      if (!candidato || !cargo || !local) {
        res.status(400).json({ error: 'Missing required fields: candidato, cargo, local' });
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      const response = await fetch(`https://api.notion.com/v1/pages`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          parent: { database_id: DATABASE_ID },
          properties: {
            'Candidato': { title: [{ text: { content: candidato } }] },
            'Cargo': { select: { name: cargo } },
            'Local': { select: { name: local } },
            'Fase': { select: { name: 'F1 Captación' } },
            'Estado': { status: { name: 'En curso' } },
            'Avance %': { number: 0 },
            'Fecha Inicio': { date: { start: today } },
            'Items Completados': { rich_text: [{ text: { content: JSON.stringify([]) } }] },
            'Notas': { rich_text: notas ? [{ text: { content: notas } }] : [] }
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Notion API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const proceso = parseProcesoPage(data);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(201).json(proceso);
    } catch (error) {
      console.error('Error creating proceso:', error);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(500).json({ error: error.message });
    }
  }
  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

function parseProcesoPage(page) {
  const props = page.properties;
  let itemsCompletados = [];
  try {
    const richText = props['Items Completados']?.rich_text?.[0]?.plain_text || '[]';
    itemsCompletados = JSON.parse(richText);
  } catch (e) {
    itemsCompletados = [];
  }

  return {
    id: page.id,
    candidato: props['Candidato']?.title?.[0]?.plain_text || '',
    cargo: props['Cargo']?.select?.name || '',
    local: props['Local']?.select?.name || '',
    fase: props['Fase']?.select?.name || 'F1 Captación',
    estado: props['Estado']?.status?.name || 'En curso',
    avance: props['Avance %']?.number || 0,
    fechaInicio: props['Fecha Inicio']?.date?.start || '',
    items_completados: itemsCompletados,
    notas: props['Notas']?.rich_text?.[0]?.plain_text || '',
    idProceso: props['ID Proceso']?.unique_id?.number || ''
  };
}
