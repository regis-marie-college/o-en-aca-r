const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) {
    return;
  }

  try {
    const body = await bodyParser(req);

    const {
      student_id,
      student_name,
      course_id,
      course_name,
      school_year,
      semester,
      units,
      grade,
      remarks,
      academic_status,
      program_name,
      year_level,
      academic_year,
      encoded_by,
    } = body;

    if (!student_id || !student_name || !course_id || !course_name || !school_year) {
      return badRequest(res, "Missing required fields");
    }

    const parsedUnits =
      units === "" || units === null || typeof units === "undefined"
        ? null
        : Number(units);
    const parsedGrade =
      grade === "" || grade === null || typeof grade === "undefined"
        ? null
        : Number(grade);

    if (parsedUnits !== null && (!Number.isFinite(parsedUnits) || parsedUnits < 0)) {
      return badRequest(res, "Units must be a valid number");
    }

    if (parsedGrade !== null && !Number.isFinite(parsedGrade)) {
      return badRequest(res, "Grade must be a valid number");
    }

    const duplicateResult = await db.query(
      `
      select id
      from student_records
      where student_id = $1
        and course_id = $2
        and lower(course_name) = lower($3)
        and coalesce(academic_year, school_year) = $4
        and coalesce(semester, '') = $5
        and coalesce(grade::text, '') = $6
      limit 1
      `,
      [
        student_id,
        course_id,
        course_name,
        academic_year || school_year,
        semester || "",
        parsedGrade === null ? "" : String(parsedGrade),
      ],
    );

    if (duplicateResult.rows.length) {
      return badRequest(res, "Duplicate student academic record already exists");
    }

    const result = await db.query(
      `
      INSERT INTO student_records 
      (
        student_id,
        student_name,
        course_id,
        course_name,
        school_year,
        semester,
        units,
        grade,
        remarks,
        academic_status,
        program_name,
        year_level,
        academic_year,
        encoded_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
      `,
      [
        student_id,
        student_name,
        course_id,
        course_name,
        school_year,
        semester || null,
        parsedUnits,
        parsedGrade,
        remarks || null,
        academic_status || null,
        program_name || null,
        year_level || null,
        academic_year || null,
        encoded_by || null,
      ]
    );

    const student = result.rows[0];

    return okay(res, student);

  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
