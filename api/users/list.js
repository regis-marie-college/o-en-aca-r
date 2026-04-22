const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) {
    return;
  }

  const { type, school_year } = req.query;
  let result = { rows: [] };

  try {
    if (type === "student") {
      result = await db.query(
        `
        select
          u.*,
          enrollment.school_year,
          enrollment.program_name,
          enrollment.program_code,
          enrollment.year_level,
          enrollment.semester,
          enrollment.status as enrollment_status
        from users u
        left join lateral (
          select
            e.school_year,
            e.program_name,
            e.program_code,
            e.year_level,
            e.semester,
            e.status
          from enrollments e
          where e.email = u.email
            and ($2::text is null or e.school_year = $2)
          order by e.created_at desc
          limit 1
        ) as enrollment on true
        where u.type = $1
          and ($2::text is null or enrollment.school_year = $2)
        order by u.created_at desc
        `,
        [type, school_year || null],
      );
    } else if (type) {
      result = await db.query(
        `SELECT * FROM users where type = $1 ORDER BY created_at DESC`,
        [type],
      );
    } else {
      result = await db.query(`SELECT * FROM users ORDER BY created_at DESC`);
    }

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
