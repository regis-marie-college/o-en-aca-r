const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { parseLimit } = require("../../lib/query-options");

let hasRequestTypeColumnPromise = null;

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury"]);
  if (!auth) {
    return;
  }

  const { search } = req.query;
  const limit = parseLimit(req.query.limit, 200, 500);

  try {
    const hasRequestTypeColumn = await getHasRequestTypeColumn();
    const requestTypeSelect = hasRequestTypeColumn
      ? "e.request_type"
      : "null::text as request_type";

    const result = await db.query(
      `
      SELECT
        e.id,
        e.last_name,
        e.first_name,
        e.middle_name,
        e.email,
        e.mobile,
        e.birthday,
        e.program_name,
        e.program_code,
        ${requestTypeSelect},
        e.status,
        e.created_at,
        downpayment.payment_status as downpayment_payment_status
      FROM enrollments e
      LEFT JOIN LATERAL (
        select payment_status
        from billings
        where enrollment_id = e.id
          and lower(description) like '%downpayment%'
        order by created_at desc
        limit 1
      ) downpayment ON true
      WHERE
        lower(coalesce(e.status, 'pending')) in ('pending', 'payment submitted', 'pending evaluation', 'approved')
        and lower(coalesce(downpayment.payment_status, '')) <> 'denied'
        and (
          $1::text IS NULL OR
          e.id::text ILIKE '%' || $1 || '%' OR
          e.last_name ILIKE '%' || $1 || '%' OR
          e.first_name ILIKE '%' || $1 || '%' OR
          e.middle_name ILIKE '%' || $1 || '%' OR
          e.email ILIKE '%' || $1 || '%' OR
          e.mobile ILIKE '%' || $1 || '%' OR
          e.status ILIKE '%' || $1 || '%'
        )
      ORDER BY
        case
          when lower(coalesce(e.status, 'pending')) in ('pending', 'payment submitted', 'pending evaluation') then 1
          when lower(coalesce(e.status, '')) = 'approved' then 2
          else 4
        end asc,
        e.created_at desc,
        e.id desc
      limit $2
      `,
      [search || null, limit],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function getHasRequestTypeColumn() {
  if (!hasRequestTypeColumnPromise) {
    hasRequestTypeColumnPromise = db
      .query(
        `
        select 1
        from information_schema.columns
        where table_name = 'enrollments'
          and column_name = 'request_type'
        limit 1
        `,
      )
      .then((result) => result.rows.length > 0)
      .catch((error) => {
        hasRequestTypeColumnPromise = null;
        throw error;
      });
  }

  return hasRequestTypeColumnPromise;
}
