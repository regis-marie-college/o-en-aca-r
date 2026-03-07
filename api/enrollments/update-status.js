const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { id, status } = body;

    // Basic validation
    if (!status) {
      return badRequest(res, "Missing required fields");
    }

    const result = await db.query(
      `UPDATE enrollments
      SET status = $1
      WHERE id = $2
      `,
      [status, id],
    );

    console.log(result);

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
