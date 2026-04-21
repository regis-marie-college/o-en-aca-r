const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  try {
    const { program_id, year_level, semester, major } = req.query;
    const result = await db.query(
      `
      SELECT *
      FROM courses
      WHERE
        ($1::text is null or program_id = $1) and
        ($2::text is null or year_level = $2) and
        ($3::text is null or semester = $3) and
        (
          $4::text is null or
          coalesce(major, '') = '' or
          major = $4
        )
      ORDER BY program_code asc, year_level asc, semester asc, major asc nulls first, name asc
      `,
      [program_id || null, year_level || null, semester || null, major || null],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
