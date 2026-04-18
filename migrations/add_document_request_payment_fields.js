const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table document_requests
    add column if not exists payment_method text not null default 'Online',
    add column if not exists reference_no text;

    update document_requests
    set payment_method = coalesce(nullif(payment_method, ''), 'Online');
  `);

  console.log("document_requests payment fields added");
}

async function down() {
  await db.query(`
    alter table document_requests
    drop column if exists reference_no,
    drop column if exists payment_method;
  `);

  console.log("document_requests payment fields removed");
}

module.exports = { up, down };
