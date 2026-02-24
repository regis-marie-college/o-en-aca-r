const { Pool } = require("pg");
const config = require("../lib/config");

const db = new Pool({
  connectionString: config.supabase.db_url,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = db;
