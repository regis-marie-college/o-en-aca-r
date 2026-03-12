const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { createUser } = require("../users/create");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { id, status, last_name, first_name, email, password } = body;

    console.log(body);

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

    if (status === "Approved") {
      // Create student record
      const student = await createUser({
        last_name,
        first_name,
        email,
        password: "password",
        type: "student",
      });

      // Send email for confirmation
      // Codes here...
    }

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
