const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table student_records
    add column if not exists semester text,
    add column if not exists units integer,
    add column if not exists grade numeric(5, 2),
    add column if not exists remarks text,
    add column if not exists academic_status text,
    add column if not exists program_name text,
    add column if not exists year_level text,
    add column if not exists academic_year text,
    add column if not exists encoded_by text;
  `);

  console.log("student_records academic fields added");
}

async function down() {
  await db.query(`
    alter table student_records
    drop column if exists encoded_by,
    drop column if exists academic_year,
    drop column if exists year_level,
    drop column if exists program_name,
    drop column if exists academic_status,
    drop column if exists remarks,
    drop column if exists grade,
    drop column if exists units,
    drop column if exists semester;
  `);

  console.log("student_records academic fields removed");
}

module.exports = { up, down };
