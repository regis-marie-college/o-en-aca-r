const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { id } = req.query;

  try {
    const result = await db.query(`SELECT * FROM enrollments WHERE id = $1`, [id]);
    const enrollment = result.rows[0];

    if (!enrollment) {
      return okay(res, null);
    }

    const downpaymentResult = await db.query(
      `
      select *
      from billings
      where enrollment_id = $1
        and lower(description) like '%downpayment%'
      order by created_at desc
      limit 1
      `,
      [id],
    );

    return okay(res, {
      ...enrollment,
      downpayment_billing: downpaymentResult.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
