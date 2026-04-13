const db = require("../services/supabase");

async function up() {
  const table = "document_requests";

  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      student_id text,
      student_name text not null,
      email text not null,
      document_type text not null,
      purpose text,
      amount numeric(12, 2) not null default 0,
      request_status text not null default 'Pending Payment',
      payment_status text not null default 'Unpaid',
      proof_of_payment text,
      notes text,
      reviewed_by text,
      treasury_reviewed_by text,
      created_at timestamp default now(),
      updated_at timestamp default now()
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "document_requests";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
