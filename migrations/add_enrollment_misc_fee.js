const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists misc_fee numeric(12, 2) default 0;
  `);

  console.log("enrollment misc fee field added");
}

async function down() {
  await db.query(`
    alter table enrollments
      drop column if exists misc_fee;
  `);

  console.log("enrollment misc fee field removed");
}

module.exports = { up, down };
