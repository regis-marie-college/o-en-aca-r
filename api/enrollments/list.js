const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury"]);
  if (!auth) {
    return;
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
        mobile ILIKE '%' || $1 || '%' OR
        status ILIKE '%' || $1 || '%'
      ORDER BY
        case
          when lower(coalesce(status, 'pending')) in ('pending', 'payment submitted', 'pending evaluation') then 1
          when lower(coalesce(status, '')) = 'approved' then 2
          when lower(coalesce(status, '')) = 'declined' then 3
          else 4
        end asc,
        created_at desc,
        id desc
      `,
      [search || null],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
