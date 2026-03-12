const db = require("../services/supabase");

async function up() {
  const table = "enrollments";

  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),

      last_name varchar(100) not null,
      first_name varchar(100) not null,
      middle_name varchar(100),

      email varchar(150) not null,
      mobile_number varchar(15) not null,
      birthday date not null,

      status TEXT,

      created_at timestamp default now(),
      updated_at timestamp default now(),
      deleted_at timestamp
    );
  `);

  console.log("${table} table created");
}

async function down() {
  const table = "enrollments";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log("${table} table dropped");
}

module.exports = { up, down };