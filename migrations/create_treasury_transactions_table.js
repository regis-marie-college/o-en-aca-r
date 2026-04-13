const db = require("../services/supabase");

async function up() {
  const table = "treasury_transactions";

  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      billing_id uuid references billings(id) on delete set null,
      enrollment_id uuid references enrollments(id) on delete set null,
      student_name text not null,
      email text not null,
      reference_no text not null,
      description text not null,
      amount numeric(12, 2) not null default 0,
      payment_method text not null default 'Cash',
      status text not null default 'Paid',
      processed_by text,
      created_at timestamp default now()
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "treasury_transactions";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
