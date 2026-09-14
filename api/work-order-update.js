const { escapeOslc, findSingle, maximoFetch, parseBody, sendError } = require('../lib/maximo');
const { createWorklog, updateWorklog } = require('./worklogs');

const ALLOWED_STATUSES = new Set(['WAPPR', 'APPR', 'WSCH', 'WMATL', 'INPRG', 'COMP', 'CLOSE', 'CAN']);

async function updateStatus(wonum, siteid, status, memo) {
  if (!ALLOWED_STATUSES.has(status)) throw Object.assign(new Error('Invalid work order status.'), { status: 400 });
  const where = `wonum="${escapeOslc(wonum)}" and siteid="${escapeOslc(siteid)}"`;
  const workOrder = await findSingle('mxapiwo', where, 'wonum,status,href');
  if (!workOrder?.href) throw Object.assign(new Error(`Work order ${wonum} was not found.`), { status: 404 });
  if (workOrder.status === status) return { skipped: true, status };
  const target = new URL(workOrder.href);
  target.searchParams.set('lean', '1');
  const payload = { status };
  if (memo) payload.memo = memo;
  const { data } = await maximoFetch(target, {
    method: 'POST',
    headers: { 'x-method-override': 'PATCH', patchtype: 'MERGE' },
    body: JSON.stringify(payload)
  });
  return data;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });
  const body = parseBody(request.body);
  const wonum = String(body.wonum || '').trim();
  const siteid = String(body.siteid || 'BEDFORD').trim();
  const status = String(body.status || '').trim().toUpperCase();
  const memo = String(body.memo || '').trim();
  const worklogs = Array.isArray(body.worklogs) ? body.worklogs : [];
  if (!wonum) return response.status(400).json({ error: 'Work order number is required.' });
  if (!status && worklogs.length === 0) return response.status(400).json({ error: 'There are no changes to submit.' });

  const result = { workOrder: null, worklogs: [] };
  try {
    if (status) result.workOrder = await updateStatus(wonum, siteid, status, memo);
    for (let index = 0; index < worklogs.length; index += 1) {
      const item = worklogs[index] || {};
      const mode = item.worklogid ? 'update' : 'create';
      try {
        const data = mode === 'update'
          ? await updateWorklog(item.worklogid, item)
          : await createWorklog(wonum, siteid, item);
        result.worklogs.push({ index, mode, success: true, worklogid: item.worklogid || null, data });
      } catch (error) {
        result.worklogs.push({ index, mode, success: false, worklogid: item.worklogid || null, error: error.message });
        const partial = new Error(`Work order submission was only partially completed. Worklog row ${index + 1} failed: ${error.message}`);
        partial.status = error.status || 502;
        partial.data = { partialResult: result, maximoResponse: error.data };
        throw partial;
      }
    }
    return response.status(200).json({ message: 'Work order changes submitted successfully.', data: result });
  } catch (error) {
    return sendError(response, error, 'Unable to submit work order changes.');
  }
};
