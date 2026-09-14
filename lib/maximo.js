const MAXIMO_ROOT = (process.env.MAXIMO_ROOT || 'https://masdemo.manage.maslab.apps.apacdm.am.co-demo.com/maximo/api').replace(/\/$/, '');

function requireApiKey() {
  if (!process.env.MAXIMO_API_KEY) {
    const error = new Error('MAXIMO_API_KEY is not configured');
    error.status = 500;
    throw error;
  }
  return process.env.MAXIMO_API_KEY;
}

function escapeOslc(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseBody(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function readMaximoError(value, fallback) {
  return value?.['oslc:Error']?.['oslc:message']
    || value?.error?.['oslc:message']
    || value?.error
    || value?.message
    || fallback;
}

async function maximoFetch(url, options = {}) {
  const apiKey = requireApiKey();
  const headers = {
    apikey: apiKey,
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const upstream = await fetch(url, { ...options, headers });
  const raw = await upstream.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  if (!upstream.ok) {
    const error = new Error(readMaximoError(data, `Maximo API returned ${upstream.status}`));
    error.status = upstream.status;
    error.data = data;
    throw error;
  }
  return { status: upstream.status, data };
}

function objectStructureUrl(name) {
  return `${MAXIMO_ROOT}/os/${name}`;
}

async function findSingle(objectStructure, where, select = '*') {
  const url = new URL(objectStructureUrl(objectStructure));
  url.searchParams.set('lean', '1');
  url.searchParams.set('oslc.select', select);
  url.searchParams.set('oslc.where', where);
  const { data } = await maximoFetch(url);
  return Array.isArray(data.member) ? data.member[0] || null : null;
}

function sendError(response, error, fallback = 'Maximo request failed') {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  return response.status(status).json({
    error: error?.message || fallback,
    maximoResponse: error?.data || undefined
  });
}

module.exports = {
  MAXIMO_ROOT,
  escapeOslc,
  parseBody,
  readMaximoError,
  maximoFetch,
  objectStructureUrl,
  findSingle,
  sendError
};
