const db = require("../services/supabase");

async function up() {
  await db.query(`
    create index if not exists idx_billings_created_at
    on billings (created_at desc);
  `);

  await db.query(`
    create index if not exists idx_billings_payment_status_created_at
    on billings (lower(payment_status), created_at desc);
  `);

  await db.query(`
    create index if not exists idx_billings_email_created_at
    on billings (lower(email), created_at desc);
  `);

  await db.query(`
    create index if not exists idx_billings_enrollment_id_created_at
    on billings (enrollment_id, created_at desc);
  `);

  await db.query(`
    create index if not exists idx_enrollments_email_created_at
    on enrollments (lower(email), created_at desc);
  `);

  await db.query(`
    create index if not exists idx_enrollments_status_created_at
    on enrollments (lower(status), created_at desc);
  `);

  await db.query(`
    create index if not exists idx_users_type_created_at
    on users (type, created_at desc);
  `);

  await db.query(`
    create index if not exists idx_users_email_updated_at
    on users (lower(email), updated_at desc, created_at desc);
  `);

  await db.query(`
    create index if not exists idx_student_records_student_id_created_at
    on student_records (student_id, created_at desc);
  `);

  await db.query(`
    create index if not exists idx_document_requests_email_created_at
    on document_requests (lower(email), created_at desc);
  `);

  await db.query(`
    create index if not exists idx_treasury_transactions_email_created_at
    on treasury_transactions (lower(email), created_at desc);
  `);

  await db.query(`
    create index if not exists idx_documents_enrollment_id_created_at
    on documents (enrollment_id, created_at asc, id asc);
  `);

  console.log("performance indexes for list and portal pages added");
}

async function down() {
  await db.query(`
    drop index if exists idx_documents_enrollment_id_created_at;
    drop index if exists idx_treasury_transactions_email_created_at;
    drop index if exists idx_document_requests_email_created_at;
    drop index if exists idx_student_records_student_id_created_at;
    drop index if exists idx_users_email_updated_at;
    drop index if exists idx_users_type_created_at;
    drop index if exists idx_enrollments_status_created_at;
    drop index if exists idx_enrollments_email_created_at;
    drop index if exists idx_billings_enrollment_id_created_at;
    drop index if exists idx_billings_email_created_at;
    drop index if exists idx_billings_payment_status_created_at;
    drop index if exists idx_billings_created_at;
  `);

  console.log("performance indexes for list and portal pages removed");
}

module.exports = { up, down };
