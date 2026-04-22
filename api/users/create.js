const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const bcrypt = require("bcrypt");
const { normalizeEmail } = require("../../lib/email");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) {
    return;
  }

  try {
    const body = await bodyParser(req);

    const user = await createUser(body);

    return okay(res, user);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function createUser(data, options = {}) {
  const {
    last_name,
    first_name,
    middle_name,
    username,
    email,
    mobile,
    password,
    type,
    student_number,
  } = data;
  const executor = options.executor || db;

  if (!last_name || !first_name || !email || !password) {
    throw new Error("Missing required fields");
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await executor.query(
    `
    select id
    from users
    where lower(email) = $1
      and deleted_at is null
    limit 1
    `,
    [normalizedEmail],
  );

  if (existingUser.rows.length) {
    throw new Error("Email is already registered");
  }

  const hash_pass = await bcrypt.hash(password, 10);

  const result = await executor.query(
    `insert into users
    (last_name, first_name, middle_name, username, email, mobile, password, type, student_number)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning id, student_number, last_name, first_name, middle_name, username, email, mobile, created_at`,
    [
      last_name,
      first_name,
      middle_name || null,
      username || null,
      normalizedEmail,
      mobile || null,
      hash_pass,
      type,
      student_number || null,
    ],
  );

  return result.rows[0];
}

// export reusable function
module.exports.createUser = createUser;
