const {
  okay,
  badRequest,
  notAllowed,
  notFound,
} = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const bcrypt = require("bcrypt");
const { normalizeEmail } = require("../../lib/email");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { email, password } = body;

    if (!email || !password) {
      return badRequest(res, "Email and password are required");
    }

    const normalizedEmail = normalizeEmail(email);
    const result = await db.query(
      `
      select *
      from users
      where lower(email) = $1
        and deleted_at is null
      order by updated_at desc, created_at desc
      limit 1
      `,
      [normalizedEmail],
    );

    if (Array.isArray(result.rows) && !result.rows.length) {
      return notFound(res, "User not found");
    }

    const user = result.rows[0];

    if (String(user.status || "active").toLowerCase() !== "active") {
      return badRequest(res, "This account is inactive. Please contact the super admin.");
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return badRequest(res, "Invalid email or password");
    }

    const sessionResult = await db.query(
      `insert into sessions (user_id, name)
      values ($1,$2)
      returning id, user_id, name
      `,
      [
        user.id,
        `${user.last_name} ${user.first_name}`,
      ],
    );

    delete user.password;

    return okay(res, {
      ...user,
      session_id: sessionResult.rows[0]?.id || null,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
