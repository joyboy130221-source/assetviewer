const { Pool } = require('pg');
const crypto = require('crypto');

let pool;
let initialized;
function getPool() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_URL is not configured. Connect a PostgreSQL database to this Vercel project.'), { status: 500 });
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined, max: 5 });
  return pool;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':'); if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64); const expectedBuffer = Buffer.from(expected, 'hex');
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function credentialKey() { const raw=process.env.CREDENTIAL_ENCRYPTION_KEY; if(!raw) throw Object.assign(new Error('CREDENTIAL_ENCRYPTION_KEY is not configured.'),{status:500}); return crypto.createHash('sha256').update(raw).digest(); }
function encryptSecret(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',credentialKey(),iv);const encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;}
function decryptSecret(value){const text=String(value||'');if(!text.startsWith('enc:v1:'))return text;const[, ,iv,tag,data]=text.split(':');const decipher=crypto.createDecipheriv('aes-256-gcm',credentialKey(),Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}

async function ensureSchema() {
  if (initialized) return initialized;
  initialized = (async () => {
    const db = getPool();
    await db.query(`CREATE TABLE IF NOT EXISTS app_roles (
      id BIGSERIAL PRIMARY KEY, name VARCHAR(80) UNIQUE NOT NULL, description TEXT, active BOOLEAN NOT NULL DEFAULT TRUE,
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS app_users (
      id BIGSERIAL PRIMARY KEY, username VARCHAR(80) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL, email VARCHAR(255) UNIQUE,
      password_hash TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, role_id BIGINT NOT NULL REFERENCES app_roles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS maximo_environments (
      id BIGSERIAL PRIMARY KEY, env_name VARCHAR(80) UNIQUE NOT NULL, description TEXT, endpoint TEXT NOT NULL, api_key TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS api_request_logs (
      id BIGSERIAL PRIMARY KEY, environment_id BIGINT REFERENCES maximo_environments(id) ON DELETE SET NULL,
      environment_name VARCHAR(80), request_method VARCHAR(12) NOT NULL, request_url TEXT NOT NULL,
      request_headers JSONB NOT NULL DEFAULT '{}'::jsonb, request_params JSONB NOT NULL DEFAULT '{}'::jsonb,
      request_body JSONB, response_status INTEGER, response_headers JSONB NOT NULL DEFAULT '{}'::jsonb, response_body JSONB,
      success BOOLEAN NOT NULL DEFAULT FALSE, duration_ms INTEGER, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_api_request_logs_environment ON api_request_logs(environment_name, created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_api_request_logs_status ON api_request_logs(response_status, created_at DESC)`);
    await db.query(`INSERT INTO app_roles(name,description,permissions) VALUES($1,$2,$3::jsonb) ON CONFLICT(name) DO NOTHING`, ['administrator','Default administrator role', JSON.stringify({ roles: true, users: true, maximoEnvironments: true, apiLogs: true })]);
    const userCount = Number((await db.query('SELECT COUNT(*) AS count FROM app_users')).rows[0].count);
    if (userCount === 0) {
      const role = (await db.query(`SELECT id FROM app_roles WHERE name='administrator' LIMIT 1`)).rows[0];
      await db.query(`INSERT INTO app_users(username,name,email,password_hash,active,role_id) VALUES($1,$2,$3,$4,TRUE,$5) ON CONFLICT(username) DO NOTHING`, ['admin','Administrator','admin@local.invalid',hashPassword('Gomake1t!@#123'),role.id]);
    }
  })().catch(err => { initialized = null; throw err; });
  return initialized;
}
async function query(text, params=[]) { await ensureSchema(); return getPool().query(text, params); }
module.exports = { getPool, ensureSchema, query, hashPassword, verifyPassword, encryptSecret, decryptSecret };
