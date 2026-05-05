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

  if (!NOTION_TOKEN) {
    res.status(500).json({ error: 'NOTION_TOKEN not configured' });
    return;
  }

  const headers = {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
  };

  // PATCH: Update specific proceso
  if (req.method === 'PATCH') {
    try {
      const { id } = req.query;
      const body = req.body || {};
      const fase = stripHtml(body.fase);
      const estado = stripHtml(body.estado);
      const avance = body.avance;
      const items_completados = Array.isArray(body.items_completados)
        ? body.items_completados.map(item => typeof item === 'string' ? stripHtml(item) : item)
        : body.items_completados;
      const notas = stripHtml(body.notas);

      if (!id) {
        res.status(400).json({ error: 'Missing query param: id' });
        return;
      }

      const updatePayload = {
        properties: {}
      };

      const candidato = stripHtml(body.candidato);
      const cargo_edit = stripHtml(body.cargo);
      const local_edit = stripHtml(body.local);

      if (candidato) updatePayload.properties['Candidato'] = { title: [{ text: { content: candidato } }] };
      if (cargo_edit) updatePayload.properties['Cargo'] = { select: { name: cargo_edit } };
      if (local_edit) updatePayload.properties['Local'] = { select: { name: local_edit } };
      if (fase) updatePayload.properties['Fase'] = { select: { name: fase } };
      if (estado) updatePayload.properties['Estado'] = { status: { name: estado } };
      if (avance !== undefined) updatePayload.properties['Avance %'] = { number: avance };
      if (items_completados !== undefined) {
        updatePayload.properties['Items Completados'] = {
          rich_text: [{ text: { content: items_completados } }]
        };
      }
      if (notas !== undefined) {
        updatePayload.properties['Notas'] = {
          rich_text: notas ? [{ text: { content: notas } }] : []
        };
      }

      const response = await fetch(`https://api.notion.com/v1/pages/${id}`, {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify(updatePayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Notion API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const updated = parseProcesoPage(data);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(200).json(updated);
    } catch (error) {
      console.error('Error updating proceso:', error);
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
