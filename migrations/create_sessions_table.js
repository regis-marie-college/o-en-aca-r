const db = require("../services/supabase");

async function up() {
  const table = "sessions";

  await db.query(`
    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      user_id text not null,
      name text not null
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "sessions";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
