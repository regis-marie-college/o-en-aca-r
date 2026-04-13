const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table courses
      add column if not exists year_level text,
      add column if not exists units integer,
      add column if not exists semester text;
  `);

  console.log("course academic fields added");
}

async function down() {
  await db.query(`
    alter table courses
      drop column if exists semester,
      drop column if exists units,
      drop column if exists year_level;
  `);

  console.log("course academic fields removed");
}

module.exports = { up, down };
