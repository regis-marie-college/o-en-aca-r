const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const bcrypt = require("bcrypt");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    // type is always student
    body.type = "student";

    const {
      last_name,
      first_name,
      middle_name,
      username,
      email,
      mobile,
      password,
      type,
    } = body;

    // Basic validation
    if (!last_name || !first_name || !email || !password) {
      return badRequest(res, "Missing required fields");
    }

    // Hash password
    const hash_pass = await bcrypt.hash(password, 10);

    const result = await db.query(
      `insert into users (last_name, first_name, middle_name, username, email, mobile, password, type)
      values ($1,$2,$3,$4,$5,$6,$7,$8)
      returning id, last_name, first_name, middle_name, username, email, mobile, type, created_at
      `,
      [
        last_name,
        first_name,
        middle_name || null,
        username || null,
        email,
        mobile || null,
        hash_pass,
        type,
      ],
    );

    // Create session for auto login after register
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

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
