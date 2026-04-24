function normalizeCourseKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCourseKeys(course) {
  return [
    course?.id,
    course?.code,
    course?.course_id,
    course?.name,
    course?.course_name,
  ]
    .map(normalizeCourseKey)
    .filter(Boolean);
}

function isCourseCompleted(course, completedCourseKeys) {
  return getCourseKeys(course).some((key) => completedCourseKeys.has(key));
}

async function getStudentRecordIds(executor, { studentId, email }) {
  const ids = new Set(
    [studentId]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean),
  );

  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (normalizedEmail) {
    const userResult = await executor.query(
      `
      select id, student_number
      from users
      where lower(email) = $1
        and deleted_at is null
      order by updated_at desc, created_at desc
      limit 1
      `,
      [normalizedEmail],
    );

    const user = userResult.rows[0] || null;
    [user?.id, user?.student_number].forEach((value) => {
      if (value) {
        ids.add(String(value).trim());
      }
    });
  }

  return Array.from(ids).filter(Boolean);
}

async function getCompletedCourseKeys(executor, { studentId, email }) {
  const studentRecordIds = await getStudentRecordIds(executor, {
    studentId,
    email,
  });

  if (!studentRecordIds.length) {
    return new Set();
  }

  const result = await executor.query(
    `
    select course_id, course_name
    from student_records
    where student_id = any($1::text[])
    `,
    [studentRecordIds],
  );

  const keys = new Set();
  result.rows.forEach((record) => {
    getCourseKeys(record).forEach((key) => keys.add(key));
  });

  return keys;
}

function getCompletedSelectedCourses(courses, completedCourseKeys) {
  return (Array.isArray(courses) ? courses : []).filter((course) =>
    isCourseCompleted(course, completedCourseKeys),
  );
}

module.exports = {
  getCompletedCourseKeys,
  getCompletedSelectedCourses,
  getCourseKeys,
  getStudentRecordIds,
  isCourseCompleted,
  normalizeCourseKey,
};
