const db = require("../services/supabase");

async function up() {
  const table = "users";

  await db.query(`
    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      last_name text not null,
      first_name text not null,
      middle_name text,
      username text,
      email text not null,
      mobile text,
      password text not null,
      type text,
      status text not null default 'active',
      verified_at timestamp,
      created_at timestamp default now(),
      updated_at timestamp default now(),
      deleted_at timestamp
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "users";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
