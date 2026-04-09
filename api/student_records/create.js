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
    } = body;

    if (!student_id || !student_name || !course_id || !course_name || !school_year) {
      return badRequest(res, "Missing required fields");
    }

    const result = await db.query(
      `
      INSERT INTO student_records 
      (student_id, student_name, course_id, course_name, school_year)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, student_id, student_name, course_id, course_name, school_year, created_at
      `,
      [student_id, student_name, course_id, course_name, school_year]
    );

    const student = result.rows[0];

    return okay(res, student);

  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};