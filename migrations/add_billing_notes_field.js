const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table billings
    add column if not exists notes text;
  `);

  console.log("billings notes field added");
}

async function down() {
  await db.query(`
    alter table billings
    drop column if exists notes;
  `);

  console.log("billings notes field removed");
}

module.exports = { up, down };
