const db = require("../services/supabase");

async function up() {
  const table = "courses";

  await db.query(`
    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      program_id TEXT,
      program_name TEXT,
      program_code TEXT,
      name text not null,
      description text,
      year_level text,
      units integer,
      semester text,
      status text,
      created_at timestamp default now(),
      updated_at timestamp default now(),
      deleted_at timestamp
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "courses";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
