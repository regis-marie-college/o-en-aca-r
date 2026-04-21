const db = require("../services/supabase");

async function up() {
  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists audit_logs (
      id uuid primary key default gen_random_uuid(),
      entity_type text not null,
      entity_id text not null,
      action text not null,
      actor text,
      actor_type text,
      details jsonb not null default '{}'::jsonb,
      created_at timestamp default now()
    );
  `);

  await db.query(`
    alter table treasury_transactions
      add column if not exists receipt_no text;
  `);

  await db.query(`
    alter table document_requests
      add column if not exists claimed_by text,
      add column if not exists released_by text,
      add column if not exists released_at timestamp;
  `);

  const transactions = await db.query(`
    select id
    from treasury_transactions
    where coalesce(receipt_no, '') = ''
    order by created_at asc, id asc
  `);

  let sequence = 1;
  for (const row of transactions.rows) {
    const receiptNo = `OR-2026-${String(sequence).padStart(6, "0")}`;
    await db.query(
      `
      update treasury_transactions
      set receipt_no = $2
      where id = $1
      `,
      [row.id, receiptNo],
    );
    sequence += 1;
  }

  await db.query(`
    create unique index if not exists idx_treasury_transactions_receipt_no
    on treasury_transactions (receipt_no)
    where receipt_no is not null;
  `);

  console.log("audit logs, official receipts, and document release tracking added");
}

async function down() {
  await db.query(`
    drop index if exists idx_treasury_transactions_receipt_no;
  `);

  await db.query(`
    alter table document_requests
      drop column if exists released_at,
      drop column if exists released_by,
      drop column if exists claimed_by;
  `);

  await db.query(`
    alter table treasury_transactions
      drop column if exists receipt_no;
  `);

  await db.query(`
    drop table if exists audit_logs;
  `);

  console.log("audit logs, official receipts, and document release tracking removed");
}

module.exports = { up, down };
