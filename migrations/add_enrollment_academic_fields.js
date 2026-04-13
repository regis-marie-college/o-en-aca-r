const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists program_id text,
      add column if not exists program_name text,
      add column if not exists program_code text,
      add column if not exists year_level text,
      add column if not exists semester text,
      add column if not exists selected_courses jsonb default '[]'::jsonb,
      add column if not exists total_units integer default 0,
      add column if not exists total_amount numeric(12, 2) default 0;
  `);

  console.log("enrollment academic fields added");
}

async function down() {
  await db.query(`
    alter table enrollments
      drop column if exists total_amount,
      drop column if exists total_units,
      drop column if exists selected_courses,
      drop column if exists semester,
      drop column if exists year_level,
      drop column if exists program_code,
      drop column if exists program_name,
      drop column if exists program_id;
  `);

  console.log("enrollment academic fields removed");
}

module.exports = { up, down };
