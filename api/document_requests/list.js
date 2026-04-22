const { okay, badRequest, notAllowed } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury", "records"]);
  if (!auth) {
    return;
  }

  const { email, student_id, payment_status, request_status } = req.query;

  try {
    const result = await db.query(
      `
      select *
      from document_requests
      where
        ($1::text is null or email = $1) and
        ($2::text is null or student_id = $2) and
        ($3::text is null or payment_status = $3) and
        ($4::text is null or request_status = $4)
      order by created_at desc
      `,
      [
        email || null,
        student_id || null,
        payment_status || null,
        request_status || null,
      ],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
