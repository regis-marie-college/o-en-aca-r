const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists student_id text,
      add column if not exists request_type text default 'New Student';
  `);

  await db.query(`
    update enrollments
    set request_type = case
      when coalesce(request_type, '') = '' then 'New Student'
      else request_type
    end
  `);

  console.log("returning student enrollment fields added");
}

async function down() {
  await db.query(`
    alter table enrollments
      drop column if exists request_type,
      drop column if exists student_id;
  `);

  console.log("returning student enrollment fields removed");
}

module.exports = { up, down };
