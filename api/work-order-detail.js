const { escapeOslc, findSingle, sendError } = require('../lib/maximo');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const wonum = typeof request.query.wonum === 'string' ? request.query.wonum.trim() : '';
  const siteid = typeof request.query.siteid === 'string' ? request.query.siteid.trim() : 'BEDFORD';
  if (!wonum) return response.status(400).json({ error: 'wonum is required' });
  if (wonum.length > 50) return response.status(400).json({ error: 'wonum is too long' });

  const where = `wonum="${escapeOslc(wonum)}" and siteid="${escapeOslc(siteid)}"`;
  const select = 'wonum,siteid,orgid,assetnum,location,description,wopriority,worktype,failurecode,reportedby,status,status_description,href,worklog_collectionref';
  try {
    const workOrder = await findSingle('mxapiwo', where, select);
    response.setHeader('Cache-Control', 'no-store');
    if (!workOrder) return response.status(404).json({ error: `Work order ${wonum} was not found in site ${siteid}.` });
    return response.status(200).json({ data: workOrder });
  } catch (error) {
    return sendError(response, error, 'Unable to retrieve the work order.');
  }
};
