const db = require("../services/supabase");

async function up() {
  await db.query(`
    create unique index if not exists uq_student_records_dedup
    on student_records (
      student_id,
      course_id,
      lower(course_name),
      coalesce(academic_year, school_year),
      coalesce(semester, ''),
      coalesce(grade::text, '')
    );
  `);

  console.log("student_records deduplication guard added");
}

async function down() {
  await db.query(`
    drop index if exists uq_student_records_dedup;
  `);

  console.log("student_records deduplication guard removed");
}

module.exports = { up, down };
