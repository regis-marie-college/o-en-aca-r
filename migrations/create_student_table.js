const db = require("../services/supabase");

async function up() {
  const table = "student_records";

  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),

      student_name varchar(150) not null,
      course_id varchar(50) not null,
      course_name varchar(150) not null,
      school_year varchar(20) not null,

      created_at timestamp default now(),
      updated_at timestamp default now(),
      deleted_at timestamp
    );
  `);

  console.log("${table} table created");
}

async function down() {
  const table = "student_records";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log("${table} table dropped");
}

module.exports = { up, down };