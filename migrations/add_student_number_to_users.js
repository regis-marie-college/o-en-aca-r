const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table users
      add column if not exists student_number text;
  `);

  await db.query(`
    create unique index if not exists idx_users_student_number
    on users (student_number)
    where student_number is not null;
  `);

  const approvedStudents = await db.query(`
    select
      u.id as user_id,
      u.student_number,
      coalesce(e.created_at, u.created_at) as basis_date
    from users u
    left join lateral (
      select created_at
      from enrollments
      where email = u.email
        and lower(coalesce(status, '')) = 'approved'
      order by created_at asc
      limit 1
    ) e on true
    where u.type = 'student'
      and coalesce(u.student_number, '') = ''
    order by coalesce(e.created_at, u.created_at) asc, u.created_at asc
  `);

  const sequenceByYear = new Map();

  for (const row of approvedStudents.rows) {
    const basisDate = row.basis_date ? new Date(row.basis_date) : new Date();
    const year = Number.isNaN(basisDate.getTime())
      ? new Date().getFullYear()
      : basisDate.getFullYear();

    let nextSequence = sequenceByYear.get(year);

    if (!nextSequence) {
      const existing = await db.query(
        `
        select student_number
        from users
        where student_number like $1
        order by student_number desc
        limit 1
        `,
        [`STU-${year}-%`],
      );

      nextSequence = Number(
        String(existing.rows[0]?.student_number || "")
          .split("-")
          .pop() || 0,
      ) + 1;
    }

    const studentNumber = `STU-${year}-${String(nextSequence).padStart(5, "0")}`;

    await db.query(
      `
      update users
      set student_number = $2,
          updated_at = now()
      where id = $1
      `,
      [row.user_id, studentNumber],
    );

    sequenceByYear.set(year, nextSequence + 1);
  }

  console.log("student_number added to users and existing student accounts backfilled");
}

async function down() {
  await db.query(`
    drop index if exists idx_users_student_number;
  `);

  await db.query(`
    alter table users
      drop column if exists student_number;
  `);

  console.log("student_number removed from users");
}

module.exports = { up, down };
