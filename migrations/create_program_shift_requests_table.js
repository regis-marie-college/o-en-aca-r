const db = require("../services/supabase");

async function up() {
  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists program_shift_requests (
      id uuid primary key default gen_random_uuid(),
      student_id text,
      student_name text not null,
      email text not null,
      current_program_id uuid,
      current_program_name text,
      current_program_code text,
      current_major text,
      target_program_id uuid not null references programs(id) on delete restrict,
      target_program_name text not null,
      target_program_code text,
      target_major text,
      reason text not null,
      status text not null default 'Pending',
      admin_notes text,
      reviewed_by text,
      reviewed_at timestamp,
      created_at timestamp default now(),
      updated_at timestamp default now()
    );

    create index if not exists idx_program_shift_requests_email
      on program_shift_requests (lower(email));

    create index if not exists idx_program_shift_requests_status
      on program_shift_requests (lower(status));
  `);

  console.log("program_shift_requests table created");
}

async function down() {
  await db.query(`
    drop table if exists program_shift_requests;
  `);

  console.log("program_shift_requests table dropped");
}

module.exports = { up, down };
