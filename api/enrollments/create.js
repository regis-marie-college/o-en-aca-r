const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { last_name, first_name, middle_name, email, mobile, birthday } =
      body;

    // Basic validation
    if (!last_name || !first_name || !email) {
      return badRequest(res, "Missing required fields");
    }

    const result = await db.query(
      `insert into enrollments (last_name, first_name, middle_name, email, mobile_number, birthday)
      values ($1,$2,$3,$4,$5,$6)
      returning id, last_name, first_name, middle_name, email, mobile_number, created_at
      `,
      [last_name, first_name, middle_name, email, mobile, birthday],
    );

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
