const { escapeOslc, findSingle, maximoFetch, objectStructureUrl, parseBody, sendError } = require('../lib/maximo');

const ALLOWED_LOG_TYPES = new Set(['APPTNOTE', 'CLIENTNOTE', 'UPDATE', 'WORK']);

function normalizeWorklog(input) {
  const description = String(input.description || '').trim();
  const longDescription = String(input.description_longdescription || '').trim();
  const logtype = String(input.logtype || '').trim().toUpperCase();
  if (!description) throw Object.assign(new Error('Worklog description is required.'), { status: 400 });
  if (!longDescription) throw Object.assign(new Error('Worklog long description is required.'), { status: 400 });
  if (!ALLOWED_LOG_TYPES.has(logtype)) throw Object.assign(new Error('Invalid worklog log type.'), { status: 400 });
  return { description, description_longdescription: longDescription, logtype };
}

async function listWorklogs(wonum, siteid) {
  const url = new URL(objectStructureUrl('mxapiworklog'));
  url.searchParams.set('lean', '1');
  url.searchParams.set('oslc.select', 'worklogid,recordkey,class,siteid,description,description_longdescription,logtype,createby,createdate,modifyby,modifydate,href');
  url.searchParams.set('oslc.where', `recordkey="${escapeOslc(wonum)}" and class="WORKORDER" and siteid="${escapeOslc(siteid)}"`);
  url.searchParams.set('oslc.orderBy', '-createdate');
  const { data } = await maximoFetch(url);
  return Array.isArray(data.member) ? data.member : [];
}

async function createWorklog(wonum, siteid, input) {
  const values = normalizeWorklog(input);
  const url = new URL(objectStructureUrl('mxapiworklog'));
  url.searchParams.set('lean', '1');
  const payload = { recordkey: wonum, class: 'WORKORDER', siteid, ...values };
  const { data } = await maximoFetch(url, { method: 'POST', body: JSON.stringify(payload) });
  return data;
}

async function updateWorklog(worklogid, input) {
  const values = normalizeWorklog(input);
  const numericId = Number(worklogid);
  if (!Number.isFinite(numericId)) throw Object.assign(new Error('A valid worklogid is required to update a worklog.'), { status: 400 });
  const item = await findSingle('mxapiworklog', `worklogid=${numericId}`, 'worklogid,href');
  if (!item?.href) throw Object.assign(new Error(`Worklog ${worklogid} was not found.`), { status: 404 });
  const target = new URL(item.href);
  target.searchParams.set('lean', '1');
  const { data } = await maximoFetch(target, {
    method: 'POST',
    headers: { 'x-method-override': 'PATCH', patchtype: 'MERGE' },
    body: JSON.stringify(values)
  });
  return data;
}

module.exports = async function handler(request, response) {
  const wonum = String(request.query.wonum || '').trim();
  const siteid = String(request.query.siteid || 'BEDFORD').trim();
  if (request.method === 'GET') {
    if (!wonum) return response.status(400).json({ error: 'wonum is required' });
    try {
      const items = await listWorklogs(wonum, siteid);
      response.setHeader('Cache-Control', 'no-store');
      return response.status(200).json({ data: items });
    } catch (error) { return sendError(response, error, 'Unable to retrieve worklogs.'); }
  }

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(request.body);
  const operation = String(body.operation || 'create').toLowerCase();
  try {
    if (operation === 'create') {
      if (!body.wonum) return response.status(400).json({ error: 'wonum is required' });
      const data = await createWorklog(String(body.wonum).trim(), String(body.siteid || 'BEDFORD').trim(), body);
      return response.status(201).json({ message: 'Worklog created successfully.', data });
    }
    if (operation === 'update') {
      const data = await updateWorklog(body.worklogid, body);
      return response.status(200).json({ message: 'Worklog updated successfully.', data });
    }
    return response.status(400).json({ error: 'Unsupported operation.' });
  } catch (error) { return sendError(response, error, 'Unable to save the worklog.'); }
};

module.exports.listWorklogs = listWorklogs;
module.exports.createWorklog = createWorklog;
module.exports.updateWorklog = updateWorklog;
