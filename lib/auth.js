const crypto = require('crypto');
const { query } = require('./db');
const COOKIE = 'assetviewer_session';
function secret() { if(!process.env.SESSION_SECRET) throw Object.assign(new Error('SESSION_SECRET is not configured.'),{status:500}); return process.env.SESSION_SECRET; }
function b64(value) { return Buffer.from(value).toString('base64url'); }
function sign(value) { return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }
function createToken(user) { const payload=b64(JSON.stringify({ uid:user.id, exp:Date.now()+8*60*60*1000 })); return `${payload}.${sign(payload)}`; }
function readCookies(req) { return Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>v.trim().split('=').map(decodeURIComponent)).filter(v=>v.length===2)); }
function tokenUserId(req) { const token=readCookies(req)[COOKIE]; if(!token) return null; const [payload,sig]=token.split('.'); if(!payload||!sig||sign(payload)!==sig) return null; try { const data=JSON.parse(Buffer.from(payload,'base64url')); return data.exp>Date.now()?data.uid:null; } catch { return null; } }
async function currentUser(req) { const id=tokenUserId(req); if(!id) return null; const r=await query(`SELECT u.id,u.username,u.name,u.email,u.active,r.id role_id,r.name role_name,r.permissions FROM app_users u JOIN app_roles r ON r.id=u.role_id WHERE u.id=$1 AND u.active=TRUE AND r.active=TRUE`,[id]); return r.rows[0]||null; }
async function requireAuth(req,res,permission) { const user=await currentUser(req); if(!user){res.status(401).json({error:'Authentication required.'}); return null;} if(permission && !user.permissions?.[permission]){res.status(403).json({error:'You do not have permission to access this feature.'}); return null;} return user; }
function setSession(res,user){res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(createToken(user))}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=28800`);}
function clearSession(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);}
module.exports={currentUser,requireAuth,setSession,clearSession};
