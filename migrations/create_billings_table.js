const db = require("../services/supabase");

async function up() {
  const table = "billings";

  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists ${table} (
      id uuid primary key default gen_random_uuid(),
      enrollment_id uuid references enrollments(id) on delete set null,
      student_name text not null,
      email text not null,
      description text not null,
      amount numeric(12, 2) not null default 0,
      amount_paid numeric(12, 2) not null default 0,
      balance numeric(12, 2) not null default 0,
      due_date date,
      status text not null default 'Unpaid',
      created_by text,
      updated_by text,
      created_at timestamp default now(),
      updated_at timestamp default now()
    );
  `);

  console.log(`${table} table created`);
}

async function down() {
  const table = "billings";

  await db.query(`
    drop table if exists ${table};
  `);

  console.log(`${table} table dropped`);
}

module.exports = { up, down };
