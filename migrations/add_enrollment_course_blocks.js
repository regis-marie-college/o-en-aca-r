const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists section_block integer not null default 1,
      add column if not exists course_block_signature text;

    create index if not exists idx_enrollments_course_block_signature
    on enrollments (program_id, course_block_signature)
    where deleted_at is null;
  `);

  console.log("enrollment course blocks added");
}

async function down() {
  await db.query(`
    drop index if exists idx_enrollments_course_block_signature;

    alter table enrollments
      drop column if exists course_block_signature,
      drop column if exists section_block;
  `);

  console.log("enrollment course blocks removed");
}

module.exports = { up, down };
