const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
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
