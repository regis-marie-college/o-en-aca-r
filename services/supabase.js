const { Pool } = require("pg");
const config = require("../lib/config");

if (!global._supabasePool) {
  global._supabasePool = new Pool({
    connectionString: config.supabase.db_url,
    ssl: {
      rejectUnauthorized: false,
    },
    max: Number(process.env.SUPABASE_DB_POOL_MAX) || 1,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

module.exports = global._supabasePool;
