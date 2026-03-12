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
      FROM enrollments
      WHERE 
        $1::text IS NULL OR
        id::text ILIKE '%' || $1 || '%' OR
        last_name ILIKE '%' || $1 || '%' OR
        first_name ILIKE '%' || $1 || '%' OR
        middle_name ILIKE '%' || $1 || '%' OR
        email ILIKE '%' || $1 || '%' OR
        mobile_number ILIKE '%' || $1 || '%' OR
        status ILIKE '%' || $1 || '%'
      ORDER BY id DESC
      `,
      [search || null],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
