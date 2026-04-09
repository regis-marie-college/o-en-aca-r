const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { student_id } = req.query;

  if (!student_id) {
    return badRequest(res, "student_id is required");
  }

  try {
    const result = await db.query(
      `
      SELECT course_id, course_name, school_year
      FROM student_records
      WHERE student_id = $1
      ORDER BY created_at DESC
      `,
      [student_id]
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};