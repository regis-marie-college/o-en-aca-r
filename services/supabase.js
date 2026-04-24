const { Pool } = require("pg");
const config = require("../lib/config");

function getPoolMax() {
  const configured = Number(process.env.SUPABASE_DB_POOL_MAX);

  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return process.env.VERCEL ? 1 : 10;
}

function isPoolSaturationError(error) {
  const message = String(error?.message || "").toLowerCase();

  return (
    message.includes("maxclientsinsessionmode") ||
    message.includes("max clients reached") ||
    message.includes("remaining connection slots are reserved") ||
    message.includes("too many clients")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withPoolRetry(operation, attempts = 5) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isPoolSaturationError(error) || attempt === attempts) {
        throw error;
      }

      await sleep(Math.min(250 * 2 ** (attempt - 1), 2000));
    }
  }

  throw lastError;
}

if (!global._supabasePool) {
  const pool = new Pool({
    connectionString: config.supabase.db_url,
    ssl: {
      rejectUnauthorized: false,
    },
    max: getPoolMax(),
    idleTimeoutMillis: process.env.VERCEL ? 3000 : 10000,
    connectionTimeoutMillis: 3000,
    allowExitOnIdle: true,
  });

  const query = pool.query.bind(pool);
  const connect = pool.connect.bind(pool);

  pool.query = (...args) => withPoolRetry(() => query(...args));
  pool.connect = (...args) => withPoolRetry(() => connect(...args));

  global._supabasePool = pool;
}

module.exports = global._supabasePool;
