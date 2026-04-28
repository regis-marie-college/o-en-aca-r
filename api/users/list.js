const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { parseLimit } = require("../../lib/query-options");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) {
    return;
  }

  const { type, school_year } = req.query;
  const limit = parseLimit(req.query.limit, 300, 800);
  let result = { rows: [] };

  try {
    if (type === "student") {
      result = await db.query(
        `
        select
          u.id,
          u.student_number,
          u.last_name,
          u.first_name,
          u.middle_name,
          u.email,
          u.mobile,
          u.type,
          coalesce(u.status, 'active') as status,
          u.created_at,
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
          and u.deleted_at is null
          and ($2::text is null or enrollment.school_year = $2)
        order by u.created_at desc
        limit $3
        `,
        [type, school_year || null, limit],
      );
    } else if (type) {
      result = await db.query(
        `
        SELECT id, student_number, last_name, first_name, middle_name, username, email, mobile, type, coalesce(status, 'active') as status, created_at, updated_at
        FROM users
        where type = $1
          and deleted_at is null
        ORDER BY created_at DESC
        limit $2
        `,
        [type, limit],
      );
    } else {
      result = await db.query(
        `
        SELECT id, student_number, last_name, first_name, middle_name, username, email, mobile, type, coalesce(status, 'active') as status, created_at, updated_at
        FROM users
        where deleted_at is null
        ORDER BY created_at DESC
        limit $1
        `,
        [limit],
      );
    }

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
