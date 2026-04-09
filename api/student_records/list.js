const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { search } = req.query;

  try {
    const result = await db.query(
      `
      SELECT *
      FROM student_records
      WHERE 
        $1::text IS NULL OR
        id::text ILIKE '%' || $1 || '%' OR
        student_name ILIKE '%' || $1 || '%' OR
        course_id ILIKE '%' || $1 || '%' OR
        course_name ILIKE '%' || $1 || '%' OR
        school_year ILIKE '%' || $1 || '%'
      ORDER BY created_at DESC
      `,
      [search || null],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};