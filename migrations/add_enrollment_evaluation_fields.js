const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists admin_notes text,
      add column if not exists decline_reason text,
      add column if not exists evaluated_by text,
      add column if not exists evaluated_at timestamp;
  `);

  console.log("enrollment evaluation fields added");
}

async function down() {
  await db.query(`
    alter table enrollments
      drop column if exists evaluated_at,
      drop column if exists evaluated_by,
      drop column if exists decline_reason,
      drop column if exists admin_notes;
  `);

  console.log("enrollment evaluation fields removed");
}

module.exports = { up, down };
