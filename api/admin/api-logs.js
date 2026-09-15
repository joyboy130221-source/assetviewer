const { query } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
module.exports = async (req,res) => {
  const user=await requireAuth(req,res,'apiLogs'); if(!user)return;
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try {
    const q=req.query||{}, values=[], where=[];
    const add=(sql,v)=>{values.push(v);where.push(sql.replace('?',`$${values.length}`));};
    if(q.env) add('environment_name=?',String(q.env));
    if(q.method) add('request_method=?',String(q.method).toUpperCase());
    if(q.status) { const n=Number(q.status); if(Number.isFinite(n)) add('response_status=?',n); }
    if(q.result==='success') where.push('success=TRUE');
    if(q.result==='error') where.push('success=FALSE');
    if(q.from) add('created_at>=?',q.from);
    if(q.to) add('created_at<=?',q.to);
    if(q.search){values.push(`%${String(q.search).trim()}%`);where.push(`(request_url ILIKE $${values.length} OR COALESCE(error_message,'') ILIKE $${values.length})`);}
    const limit=Math.min(Math.max(Number(q.limit)||100,1),200);
    values.push(limit);
    const sql=`SELECT id,environment_name,request_method,request_url,request_headers,request_params,request_body,response_status,response_headers,response_body,success,duration_ms,error_message,created_at FROM api_request_logs ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT $${values.length}`;
    const [logs,envs]=await Promise.all([query(sql,values),query(`SELECT DISTINCT environment_name FROM api_request_logs WHERE environment_name IS NOT NULL ORDER BY environment_name`)]);
    return res.json({data:logs.rows,environments:envs.rows.map(x=>x.environment_name)});
  } catch(e){return res.status(500).json({error:e.message});}
};
