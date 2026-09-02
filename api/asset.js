const MAXIMO_URL = 'https://masdemo.manage.maslab.apps.apacdm.am.co-demo.com/maximo/api/os/mxasset';
const SITE_ID = 'BEDFORD';

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const assetId = typeof request.query.assetId === 'string' ? request.query.assetId.trim() : '';
  if (!assetId) return response.status(400).json({ error: 'assetId is required' });
  if (assetId.length > 100) return response.status(400).json({ error: 'assetId is too long' });
  if (!process.env.MAXIMO_API_KEY) return response.status(500).json({ error: 'MAXIMO_API_KEY is not configured' });

  const escapeOslc = value => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const url = new URL(MAXIMO_URL);
  url.searchParams.set('lean', '1');
  url.searchParams.set('oslc.select', '*');
  url.searchParams.set('oslc.where', `siteid="${SITE_ID}" and assetnum="${escapeOslc(assetId)}"`);

  try {
    const upstream = await fetch(url, { headers: { apikey: process.env.MAXIMO_API_KEY, Accept: 'application/json' } });
    const text = await upstream.text();
    if (!upstream.ok) return response.status(upstream.status).json({ error: `Maximo API returned ${upstream.status}`, detail: text.slice(0, 500) });
    response.setHeader('Cache-Control', 'no-store');
    return response.status(200).send(text);
  } catch (error) {
    return response.status(502).json({ error: 'Could not connect to the Maximo API', detail: error.message });
  }
};
