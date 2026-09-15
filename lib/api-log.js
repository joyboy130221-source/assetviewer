const crypto = require('crypto');
const { query } = require('./db');

const SENSITIVE = /^(authorization|proxy-authorization|cookie|set-cookie|apikey|api-key|x-api-key|password|token|access_token|refresh_token|client_secret)$/i;
const MAX_TEXT = 50000;

function maskSecret(value) {
  const text = String(value || '');
  if (!text) return '';
  const suffix = text.length > 4 ? text.slice(-4) : '****';
  const fingerprint = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  return `••••••••${suffix} [sha256:${fingerprint}]`;
}
function sanitize(value, key = '') {
  if (SENSITIVE.test(key)) return maskSecret(value);
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => sanitize(v));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, sanitize(v, k)]));
  if (typeof value === 'string' && value.length > MAX_TEXT) return `${value.slice(0, MAX_TEXT)}… [truncated]`;
  return value;
}
function headersObject(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === 'function') headers.forEach((v,k) => { out[k] = sanitize(v, k); });
  else Object.entries(headers).forEach(([k,v]) => { out[k] = sanitize(v, k); });
  return out;
}
function bodyValue(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'object' && !(raw instanceof Buffer)) return sanitize(raw);
  const text = String(raw);
  try { return sanitize(JSON.parse(text)); } catch { return sanitize({ raw: text }); }
}
async function recordApiLog(entry) {
  try {
    await query(`INSERT INTO api_request_logs(
      environment_id,environment_name,request_method,request_url,request_headers,request_params,request_body,
      response_status,response_headers,response_body,success,duration_ms,error_message
    ) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9::jsonb,$10::jsonb,$11,$12,$13)`, [
      entry.environmentId || null, entry.environmentName || null, entry.method, entry.url,
      JSON.stringify(entry.requestHeaders || {}), JSON.stringify(entry.requestParams || {}), JSON.stringify(entry.requestBody),
      entry.responseStatus || null, JSON.stringify(entry.responseHeaders || {}), JSON.stringify(entry.responseBody),
      Boolean(entry.success), entry.durationMs ?? null, entry.errorMessage || null
    ]);
  } catch (e) { console.error('Unable to persist API request log:', e.message); }
}
module.exports = { recordApiLog, sanitize, headersObject, bodyValue, maskSecret };
