const { okay, notAllowed, badRequest } = require("../../../lib/response");
const db = require("../../../services/supabase");
const { requireAuth } = require("../../../lib/auth");
const { parseLimit } = require("../../../lib/query-options");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury"]);
  if (!auth) {
    return;
  }

  const { search } = req.query;
  const limit = parseLimit(req.query.limit, 100, 300);

  try {
    const result = await db.query(
      `
      select
        id,
        billing_id,
        enrollment_id,
        student_name,
        email,
        reference_no,
        receipt_no,
        description,
        amount,
        payment_method,
        status,
        processed_by,
        created_at
      from treasury_transactions
      where
        $1::text is null or
        student_name ilike '%' || $1 || '%' or
        email ilike '%' || $1 || '%' or
        reference_no ilike '%' || $1 || '%' or
        description ilike '%' || $1 || '%'
      order by created_at desc
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
