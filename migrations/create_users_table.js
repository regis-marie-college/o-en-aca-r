const db = require("../services/supabase");

async function up() {
  await db.query(`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      last_name text not null,
      first_name text not null,
      middle_name text,
      username text,
      email text not null,
      mobile text,
      password text not null,
      verified_at timestamp,
      created_at timestamp default now(),
      updated_at timestamp default now(),
      deleted_at timestamp
    );
  `);

  console.log("users table created");
}

async function down() {
  await db.query(`
    drop table if exists users;
  `);

  console.log("users table dropped");
}

module.exports = { up, down };
