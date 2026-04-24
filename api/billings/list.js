const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { parseLimit } = require("../../lib/query-options");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury"]);
  if (!auth) {
    return;
  }

  const { search, status, payment_filter } = req.query;
  const limit = parseLimit(req.query.limit, 250, 500);

  try {
    const result = await db.query(
      `
      select
        id,
        enrollment_id,
        student_name,
        email,
        reference_no,
        description,
        amount,
        amount_paid,
        balance,
        due_date,
        status,
        payment_method,
        payment_channel,
        payment_status,
        proof_of_payment,
        notes,
        created_at
      from billings
      where
        ($1::text is null or
          student_name ilike '%' || $1 || '%' or
          email ilike '%' || $1 || '%' or
          reference_no ilike '%' || $1 || '%' or
          description ilike '%' || $1 || '%') and
        ($2::text is null or status ilike $2) and
        (
          $3::text is null or
          ($3 = 'waiting' and lower(coalesce(payment_status, '')) = 'submitted') or
          ($3 = 'paid' and (lower(coalesce(payment_status, '')) = 'approved' or coalesce(amount_paid, 0) > 0)) or
          ($3 = 'all' and (
            lower(coalesce(payment_status, '')) in ('submitted', 'approved') or
            coalesce(amount_paid, 0) > 0
          ))
        )
      order by created_at desc
      limit $4
      `,
      [search || null, status || null, normalizePaymentFilter(payment_filter), limit],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

function normalizePaymentFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return ["paid", "waiting", "all"].includes(normalized) ? normalized : null;
}
