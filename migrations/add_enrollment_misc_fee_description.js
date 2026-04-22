const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists misc_fee_description text;
  `);

  console.log("enrollment misc fee description added");
}

async function down() {
  await db.query(`
    alter table enrollments
      drop column if exists misc_fee_description;
  `);

  console.log("enrollment misc fee description removed");
}

module.exports = { up, down };
