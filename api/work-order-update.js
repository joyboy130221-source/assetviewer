<<<<<<< HEAD
const {escapeOslc,findSingle,maximoFetch,parseBody,sendError,getEnvironment}=require('../lib/maximo');const{createWorklog,updateWorklog}=require('./worklogs');const ALLOWED=new Set(['WAPPR','APPR','WSCH','WMATL','INPRG','COMP','CLOSE','CAN']);
async function updateStatus(env,wonum,siteid,status,memo){if(!ALLOWED.has(status))throw Object.assign(new Error('Invalid work order status.'),{status:400});const wo=await findSingle(env,'mxapiwo',`wonum="${escapeOslc(wonum)}" and siteid="${escapeOslc(siteid)}"`,'wonum,status,href');if(!wo?.href)throw Object.assign(new Error(`Work order ${wonum} was not found.`),{status:404});if(wo.status===status)return{skipped:true,status};const u=new URL(wo.href);u.searchParams.set('lean','1');return(await maximoFetch(env,u,{method:'POST',headers:{'x-method-override':'PATCH',patchtype:'MERGE'},body:JSON.stringify({status,...(memo?{memo}:{})})})).data}
module.exports=async(req,res)=>{if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});const b=parseBody(req.body),wonum=String(b.wonum||'').trim(),siteid=String(b.siteid||'BEDFORD').trim(),status=String(b.status||'').trim().toUpperCase(),memo=String(b.memo||'').trim(),logs=Array.isArray(b.worklogs)?b.worklogs:[];try{const env=await getEnvironment(b.env);const result={workOrder:null,worklogs:[]};if(status)result.workOrder=await updateStatus(env,wonum,siteid,status,memo);for(const item of logs)result.worklogs.push(item.worklogid?await updateWorklog(env,wonum,siteid,item.worklogid,item):await createWorklog(env,wonum,siteid,item));return res.json({message:'Work order changes submitted successfully.',data:result})}catch(e){sendError(res,e,'Unable to submit work order changes.')}};
=======
const {
  escapeOslc,
  findSingle,
  maximoFetch,
  parseBody,
  sendError,
  getEnvironment
} = require('../lib/maximo');
const { createWorklog, updateWorklog } = require('./worklogs');

const ALLOWED = new Set(['WAPPR','APPR','WSCH','WMATL','INPRG','COMP','CLOSE','CAN']);

async function updateStatus(env, wonum, siteid, status, memo) {
  if (!ALLOWED.has(status)) {
    throw Object.assign(new Error('Invalid work order status.'), { status: 400 });
  }

  const wo = await findSingle(
    env,
    'mxapiwo',
    `wonum="${escapeOslc(wonum)}" and siteid="${escapeOslc(siteid)}"`,
    'wonum,status,href'
  );

  if (!wo?.href) {
    throw Object.assign(new Error(`Work order ${wonum} was not found.`), { status: 404 });
  }
  if (wo.status === status) return { skipped: true, status };

  const url = new URL(wo.href);
  url.searchParams.set('lean', '1');
  return (await maximoFetch(env, url, {
    method: 'POST',
    headers: { 'x-method-override': 'PATCH', patchtype: 'MERGE' },
    body: JSON.stringify({ status, ...(memo ? { memo } : {}) })
  })).data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = parseBody(req.body);
  const wonum = String(b.wonum || '').trim();
  const siteid = String(b.siteid || 'BEDFORD').trim();
  const status = String(b.status || '').trim().toUpperCase();
  const memo = String(b.memo || '').trim();
  const logs = Array.isArray(b.worklogs) ? b.worklogs : [];

  if (!wonum) return res.status(400).json({ error: 'wonum is required' });

  try {
    const env = await getEnvironment(b.env);
    const result = { workOrder: null, worklogs: [] };

    if (status) result.workOrder = await updateStatus(env, wonum, siteid, status, memo);

    for (const item of logs) {
      // IMPORTANT: updateWorklog requires wonum + siteid before worklogid.
      // The previous code passed only (env, worklogid, item), which made
      // worklogid undefined and caused "A valid worklogid is required".
      if (item.worklogid !== undefined && item.worklogid !== null && String(item.worklogid).trim() !== '') {
        result.worklogs.push(await updateWorklog(env, wonum, siteid, item.worklogid, item));
      } else {
        result.worklogs.push(await createWorklog(env, wonum, siteid, item));
      }
    }

    return res.json({ message: 'Work order changes submitted successfully.', data: result });
  } catch (e) {
    return sendError(res, e, 'Unable to submit work order changes.');
  }
};
>>>>>>> 19da26b28ce3b7df3f1c7730bea34454dfc872d6
