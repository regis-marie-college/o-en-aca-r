const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table billings
    add column if not exists payment_method text not null default 'Cash',
    add column if not exists payment_channel text,
    add column if not exists reference_no text,
    add column if not exists proof_of_payment text,
    add column if not exists payment_status text not null default 'Unpaid',
    add column if not exists pending_payment_amount numeric(12, 2) not null default 0,
    add column if not exists treasury_reviewed_by text;

    update billings
    set
      payment_method = coalesce(nullif(payment_method, ''), 'Cash'),
      payment_status = coalesce(nullif(payment_status, ''), 'Unpaid'),
      pending_payment_amount = coalesce(pending_payment_amount, 0);
  `);

  console.log("billings payment fields added");
}

async function down() {
  await db.query(`
    alter table billings
    drop column if exists treasury_reviewed_by,
    drop column if exists pending_payment_amount,
    drop column if exists payment_status,
    drop column if exists proof_of_payment,
    drop column if exists reference_no,
    drop column if exists payment_channel,
    drop column if exists payment_method;
  `);

  console.log("billings payment fields removed");
}

module.exports = { up, down };
