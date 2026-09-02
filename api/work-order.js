const MAXIMO_WORK_ORDER_URL = 'https://masdemo.manage.maslab.apps.apacdm.am.co-demo.com/maximo/api/os/mxapiwo';
const REQUIRED_FIELDS = ['siteid', 'orgid', 'assetnum', 'location', 'description', 'wopriority', 'worktype', 'failurecode', 'reportedby'];
const ALLOWED_LOCATIONS = new Set(['UPS', 'DHL', 'WILSON', 'PEDRICK', 'KELLER']);
const ALLOWED_WORK_TYPES = new Set(['ACTY', 'CAL', 'CM', 'EM', 'EV']);
const ALLOWED_FAILURE_CODES = new Set(['PUMPS', 'HARDWARE', 'MECH']);

function readMaximoError(value, fallback) {
  return value?.['oslc:Error']?.['oslc:message']
    || value?.error?.['oslc:message']
    || value?.message
    || fallback;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  if (!process.env.MAXIMO_API_KEY) return response.status(500).json({ error: 'MAXIMO_API_KEY is not configured' });
  const input = request.body && typeof request.body === 'object' ? request.body : {};
  const payload = {};

  for (const field of REQUIRED_FIELDS) {
    const value = input[field] === undefined || input[field] === null ? '' : String(input[field]).trim();
    if (!value) return response.status(400).json({ error: `${field} is required` });
    payload[field] = value;
  }
  if (!ALLOWED_LOCATIONS.has(payload.location)) return response.status(400).json({ error: 'Invalid location' });
  if (!ALLOWED_WORK_TYPES.has(payload.worktype)) return response.status(400).json({ error: 'Invalid work type' });
  if (!ALLOWED_FAILURE_CODES.has(payload.failurecode)) return response.status(400).json({ error: 'Invalid failure code' });
  if (!/^\d+$/.test(payload.wopriority)) return response.status(400).json({ error: 'WO priority must be a whole number' });
  payload.wopriority = Number(payload.wopriority);

  const url = new URL(MAXIMO_WORK_ORDER_URL);
  url.searchParams.set('lean', '1');
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: process.env.MAXIMO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const raw = await upstream.text();
    let result = {};
    try { result = raw ? JSON.parse(raw) : {}; } catch { result = { raw }; }
    if (!upstream.ok) {
      return response.status(upstream.status).json({
        error: readMaximoError(result, `Maximo API returned ${upstream.status}`),
        maximoResponse: result
      });
    }
    response.setHeader('Cache-Control', 'no-store');
    return response.status(upstream.status).json({
      message: 'Work order created successfully.',
      wonum: result.wonum || result.WONUM || null,
      data: result
    });
  } catch (error) {
    return response.status(502).json({ error: 'Could not connect to the Maximo API', detail: error.message });
  }
};
