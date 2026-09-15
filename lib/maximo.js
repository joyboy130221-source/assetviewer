const { query, decryptSecret } = require('./db');
const { recordApiLog, headersObject, bodyValue } = require('./api-log');
function escapeOslc(value){return String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"');}
function parseBody(raw){if(raw&&typeof raw==='object')return raw;if(!raw)return{};try{return JSON.parse(raw)}catch{return{}}}
function readMaximoError(value,fallback){return value?.['oslc:Error']?.['oslc:message']||value?.error?.['oslc:message']||value?.error||value?.message||fallback;}
async function getEnvironment(envName){
  const name=String(envName||'').trim(); if(!name) throw Object.assign(new Error('env is required. Example: ?env=demo-coh'),{status:400});
  const result=await query(`SELECT id,env_name,description,endpoint,api_key FROM maximo_environments WHERE env_name=$1 AND active=TRUE`,[name]);
  if(!result.rows[0]) throw Object.assign(new Error(`Maximo environment '${name}' was not found or is inactive.`),{status:404});
  const row=result.rows[0]; row.api_key=decryptSecret(row.api_key); return row;
}
async function maximoFetch(env,url,options={}){
  const headers={apikey:env.api_key,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})};
  const requestUrl = url instanceof URL ? url : new URL(String(url));
  const method = String(options.method || 'GET').toUpperCase();
  const started = Date.now();
  let upstream, raw='', data={};
  try {
    upstream=await fetch(requestUrl,{...options,headers});
    raw=await upstream.text();
    try{data=raw?JSON.parse(raw):{}}catch{data={raw}}
    await recordApiLog({
      environmentId:env.id, environmentName:env.env_name, method, url:requestUrl.toString(),
      requestHeaders:headersObject(headers), requestParams:Object.fromEntries(requestUrl.searchParams.entries()), requestBody:bodyValue(options.body),
      responseStatus:upstream.status, responseHeaders:headersObject(upstream.headers), responseBody:data,
      success:upstream.ok, durationMs:Date.now()-started, errorMessage:upstream.ok?null:readMaximoError(data,`Maximo API returned ${upstream.status}`)
    });
    if(!upstream.ok){const e=new Error(readMaximoError(data,`Maximo API returned ${upstream.status}`));e.status=upstream.status;e.data=data;throw e}
    return{status:upstream.status,data};
  } catch(e) {
    if (!upstream) await recordApiLog({
      environmentId:env.id, environmentName:env.env_name, method, url:requestUrl.toString(),
      requestHeaders:headersObject(headers), requestParams:Object.fromEntries(requestUrl.searchParams.entries()), requestBody:bodyValue(options.body),
      responseStatus:null, responseHeaders:{}, responseBody:null, success:false, durationMs:Date.now()-started, errorMessage:e.message
    });
    throw e;
  }
}
function objectStructureUrl(env,name){return `${env.endpoint.replace(/\/$/,'')}/os/${name}`;}
async function findSingle(env,objectStructure,where,select='*'){const url=new URL(objectStructureUrl(env,objectStructure));url.searchParams.set('lean','1');url.searchParams.set('oslc.select',select);url.searchParams.set('oslc.where',where);const{data}=await maximoFetch(env,url);return Array.isArray(data.member)?data.member[0]||null:null;}
function sendError(response,error,fallback='Maximo request failed'){const status=Number.isInteger(error?.status)?error.status:502;return response.status(status).json({error:error?.message||fallback,maximoResponse:error?.data||undefined});}
module.exports={escapeOslc,parseBody,readMaximoError,getEnvironment,maximoFetch,objectStructureUrl,findSingle,sendError};
