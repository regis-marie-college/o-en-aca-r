"use strict";

const BLOCK_SIZE = 25;

async function ensureEnrollmentBlockColumns(executor) {
  await executor.query(`
    alter table enrollments
      add column if not exists section_block integer not null default 1,
      add column if not exists course_block_signature text;
  `);
}

async function assignCourseBlock({
  executor,
  enrollmentId = null,
  programId,
  major = null,
  schoolYear = null,
  yearLevel = null,
  semester = null,
  selectedCourses = [],
}) {
  const signature = buildCourseBlockSignature({
    programId,
    major,
    schoolYear,
    yearLevel,
    semester,
    selectedCourses,
  });

  if (!signature) {
    return {
      sectionBlock: 1,
      courseBlockSignature: null,
    };
  }

  await executor.query("select pg_advisory_xact_lock(hashtext($1))", [signature]);

  const result = await executor.query(
    `
    select id
    from enrollments
    where deleted_at is null
      and coalesce(status, 'Pending') <> 'Declined'
      and program_id = $1
      and course_block_signature = $2
      and ($3::uuid is null or id <> $3)
    for update
    `,
    [programId, signature, enrollmentId],
  );

  return {
    sectionBlock: Math.floor(result.rows.length / BLOCK_SIZE) + 1,
    courseBlockSignature: signature,
  };
}

function buildCourseBlockSignature({
  programId,
  major = null,
  schoolYear = null,
  yearLevel = null,
  semester = null,
  selectedCourses = [],
}) {
  const courseKeys = (Array.isArray(selectedCourses) ? selectedCourses : [])
    .map(getCourseKey)
    .filter(Boolean)
    .sort();

  if (!programId || !courseKeys.length) {
    return null;
  }

  return [
    normalizeSignaturePart(schoolYear),
    normalizeSignaturePart(programId),
    normalizeSignaturePart(major),
    normalizeSignaturePart(yearLevel),
    normalizeSignaturePart(semester),
    courseKeys.join(","),
  ].join("|");
}

function getCourseKey(course) {
  if (!course || typeof course !== "object") {
    return "";
  }

  return normalizeSignaturePart(
    course.id || course.course_id || course.code || course.name || course.course_name,
  );
}

function normalizeSignaturePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

module.exports = {
  BLOCK_SIZE,
  assignCourseBlock,
  buildCourseBlockSignature,
  ensureEnrollmentBlockColumns,
};
