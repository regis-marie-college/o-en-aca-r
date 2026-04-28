const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table users
      add column if not exists status text not null default 'active';

    update users
    set status = 'active'
    where status is null
      or trim(status) = '';
  `);

  console.log("user status support added");
}

async function down() {
  await db.query(`
    alter table users
      drop column if exists status;
  `);

  console.log("user status support removed");
}

module.exports = {
  up,
  down,
};
