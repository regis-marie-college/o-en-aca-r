const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { name, description, code } = body;

    // Basic validation
    if (!name) {
      return badRequest(res, "Missing required fields");
    }

    const result = await db.query(
      `insert into programs (name, description, code, status)
      values ($1,$2,$3,'active')
      returning id, name, description, status, created_at
      `,
      [name, description, code],
    );

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
