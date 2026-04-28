const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

const ALLOWED_USER_TYPES = ["super_admin", "admin", "treasury", "records", "student"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, "admin");
  if (!auth) {
    return;
  }

  try {
    const body = await bodyParser(req);
    const id = String(body.id || "").trim();
    const type = String(body.type || "")
      .trim()
      .toLowerCase();

    if (!id || !type) {
      return badRequest(res, "id and type are required");
    }

    if (!ALLOWED_USER_TYPES.includes(type)) {
      return badRequest(res, "Invalid user role");
    }

    const targetResult = await db.query(
      `
      select id, type
      from users
      where id = $1
        and deleted_at is null
      limit 1
      `,
      [id],
    );

    if (!targetResult.rows.length) {
      return badRequest(res, "User not found");
    }

    const authRole = String(auth.type || "").toLowerCase();
    const currentTargetRole = String(targetResult.rows[0].type || "").toLowerCase();

    if (type === "super_admin") {
      return badRequest(res, "Setting another account as super admin is not allowed");
    }

    if (currentTargetRole === "super_admin") {
      return badRequest(res, "The super admin role cannot be changed");
    }

    const result = await db.query(
      `
      update users
      set type = $2,
          updated_at = now()
      where id = $1
        and deleted_at is null
      returning id, student_number, last_name, first_name, middle_name, username, email, mobile, type, status, created_at, updated_at
      `,
      [id, type],
    );

    if (!result.rows.length) {
      return badRequest(res, "User not found");
    }

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
