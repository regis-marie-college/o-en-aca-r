const {
  okay,
  badRequest,
  notAllowed,
  notFound,
} = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const bcrypt = require("bcrypt");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { email } = body;

    const result = await db.query(`select * from users where email = $1`, [
      email,
    ]);

    if (Array.isArray(result.rows) && !result.rows.length) {
      return notFound(res, "User not found");
    }

    // Create session for the current user
    const session = await db.query(
      `insert into sessions (user_id, name)
      values ($1,$2)
      returning id, user_id, name
      `,
      [
        result.rows[0].id,
        `${result.rows[0].last_name} ${result.rows[0].first_name}`,
      ],
    );

    let user = result.rows[0];
    delete user.password;

    return okay(res, user);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
