const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add constraint enrollments_request_type_check
      check (coalesce(request_type, 'New Student') in ('New Student', 'Returning Student'));
  `).catch(ignoreDuplicateConstraint);

  await db.query(`
    alter table enrollments
      add constraint enrollments_status_check
      check (coalesce(status, 'Pending') in ('Pending', 'Pending Evaluation', 'Payment Submitted', 'Approved', 'Declined'));
  `).catch(ignoreDuplicateConstraint);

  await db.query(`
    alter table enrollments
      add constraint enrollments_misc_fee_non_negative_check
      check (coalesce(misc_fee, 0) >= 0);
  `).catch(ignoreDuplicateConstraint);

  await db.query(`
    alter table enrollments
      add constraint enrollments_total_units_non_negative_check
      check (coalesce(total_units, 0) >= 0);
  `).catch(ignoreDuplicateConstraint);

  await db.query(`
    alter table enrollments
      add constraint enrollments_total_amount_non_negative_check
      check (coalesce(total_amount, 0) >= 0);
  `).catch(ignoreDuplicateConstraint);

  await db.query(`
    create index if not exists idx_enrollments_email
    on enrollments (lower(email));
  `);

  await db.query(`
    create index if not exists idx_enrollments_student_id
    on enrollments (student_id);
  `);

  await db.query(`
    create index if not exists idx_enrollments_school_year
    on enrollments (school_year);
  `);

  await db.query(`
    create index if not exists idx_enrollments_status
    on enrollments (status);
  `);

  await db.query(`
    create index if not exists idx_enrollments_school_year_status
    on enrollments (school_year, status);
  `);

  await db.query(`
    create unique index if not exists uq_enrollments_active_student_school_year
    on enrollments (student_id, school_year)
    where student_id is not null
      and deleted_at is null
      and coalesce(status, 'Pending') <> 'Declined';
  `);

  await db.query(`
    create unique index if not exists uq_enrollments_active_email_school_year
    on enrollments (lower(email), school_year)
    where student_id is null
      and deleted_at is null
      and coalesce(status, 'Pending') <> 'Declined';
  `);

  console.log("enrollment constraints and indexes added");
}

async function down() {
  await db.query(`
    drop index if exists uq_enrollments_active_email_school_year;
    drop index if exists uq_enrollments_active_student_school_year;
    drop index if exists idx_enrollments_school_year_status;
    drop index if exists idx_enrollments_status;
    drop index if exists idx_enrollments_school_year;
    drop index if exists idx_enrollments_student_id;
    drop index if exists idx_enrollments_email;
  `);

  await db.query(`
    alter table enrollments
      drop constraint if exists enrollments_total_amount_non_negative_check,
      drop constraint if exists enrollments_total_units_non_negative_check,
      drop constraint if exists enrollments_misc_fee_non_negative_check,
      drop constraint if exists enrollments_status_check,
      drop constraint if exists enrollments_request_type_check;
  `);

  console.log("enrollment constraints and indexes removed");
}

function ignoreDuplicateConstraint(error) {
  if (
    error?.code === "42710" ||
    String(error?.message || "").toLowerCase().includes("already exists")
  ) {
    return;
  }

  throw error;
}

module.exports = { up, down };
