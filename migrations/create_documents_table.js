const db = require("../services/supabase");

async function up() {
  const table = "documents";

  await db.query(`
    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      enrollment_id TEXT,
      user_id TEXT,
      user_full_name TEXT,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT,
      status TEXT,
      created_at TIMESTAMP default now(),
      updated_at TIMESTAMP default now(),
      deleted_at TIMESTAMP
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "documents";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };