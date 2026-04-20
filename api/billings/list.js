const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { search, status } = req.query;

  try {
    const result = await db.query(
      `
      select *
      from billings
      where
        ($1::text is null or
          student_name ilike '%' || $1 || '%' or
          email ilike '%' || $1 || '%' or
          reference_no ilike '%' || $1 || '%' or
          description ilike '%' || $1 || '%') and
        ($2::text is null or status ilike $2)
      order by created_at desc
      `,
      [search || null, status || null],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
