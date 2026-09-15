const { escapeOslc, findSingle, maximoFetch, objectStructureUrl, parseBody, sendError, getEnvironment } = require('../lib/maximo');
const SITE_ID = 'BEDFORD';
const OBJECT_STRUCTURE = 'mxasset';
const PROTECTED_FIELDS = new Set(['href', '_rowstamp', 'assetid', 'assetnum', 'siteid', 'orgid', 'status_description']);

function cleanAttributes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || PROTECTED_FIELDS.has(key)) continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) output[key] = value;
  }
  return output;
}

module.exports = async function handler(request, response) {
  const envName = request.method === 'GET' ? request.query.env : parseBody(request.body).env;
  const assetId = request.method === 'GET'
    ? (typeof request.query.assetId === 'string' ? request.query.assetId.trim() : '')
    : String(parseBody(request.body).assetId || '').trim();
  if (!assetId) return response.status(400).json({ error: 'assetId is required' });
  if (assetId.length > 100) return response.status(400).json({ error: 'assetId is too long' });
  const where = `siteid="${escapeOslc(SITE_ID)}" and assetnum="${escapeOslc(assetId)}"`;

  try {
    const env = await getEnvironment(envName);
    if (request.method === 'GET') {
      const url = new URL(objectStructureUrl(env, OBJECT_STRUCTURE));
      url.searchParams.set('lean', '1'); url.searchParams.set('oslc.select', '*'); url.searchParams.set('oslc.where', where);
      const { data } = await maximoFetch(env, url); response.setHeader('Cache-Control', 'no-store'); return response.status(200).json(data);
    }
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

    const body = parseBody(request.body); const attributes = cleanAttributes(body.attributes);
    if (!Object.keys(attributes).length) return response.status(400).json({ error: 'No editable attributes were supplied' });

    // Find the resource href first. The browser calls this endpoint with POST; this server-side
    // request uses Maximo's supported POST + x-method-override PATCH pattern to update the asset.
    const asset = await findSingle(env, OBJECT_STRUCTURE, where, 'assetnum,siteid,href');
    if (!asset) return response.status(404).json({ error: `Asset ${assetId} was not found in site ${SITE_ID}` });
    if (!asset.href) return response.status(502).json({ error: 'Maximo did not return an asset resource URL (href)' });

    const updateUrl = new URL(asset.href);
    updateUrl.searchParams.set('lean', '1');
    const { data } = await maximoFetch(env, updateUrl, {
      method: 'POST',
      headers: { 'x-method-override': 'PATCH', patchtype: 'MERGE' },
      body: JSON.stringify(attributes)
    });
    return response.status(200).json({ message: `Asset ${assetId} updated successfully.`, updatedAttributes: Object.keys(attributes), maximoResponse: data });
  } catch (error) { return sendError(response, error, 'Unable to process asset request'); }
};
