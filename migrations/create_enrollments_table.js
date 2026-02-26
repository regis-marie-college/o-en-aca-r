const db = require("../services/supabase");

async function up() {
  const table = "enrollments";

  await db.query(`
    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      user_id text not null,
      created_at timestamp default now(),
      updated_at timestamp default now(),
      deleted_at timestamp
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "enrollments";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
