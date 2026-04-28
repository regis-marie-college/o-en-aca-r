const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

const ALLOWED_STATUSES = ["active", "inactive"];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, "super_admin");
  if (!auth) {
    return;
  }

  try {
    const body = await bodyParser(req);
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim().toLowerCase();

    if (!id || !status) {
      return badRequest(res, "id and status are required");
    }

    if (!ALLOWED_STATUSES.includes(status)) {
      return badRequest(res, "Invalid account status");
    }

    if (id === auth.id && status === "inactive") {
      return badRequest(res, "You cannot inactivate your own super admin account");
    }

    const result = await db.query(
      `
      update users
      set status = $2,
          updated_at = now()
      where id = $1
        and deleted_at is null
      returning id, student_number, last_name, first_name, middle_name, username, email, mobile, type, status, created_at, updated_at
      `,
      [id, status],
    );

    if (!result.rows.length) {
      return badRequest(res, "User not found");
    }

    if (status === "inactive") {
      await db.query(`delete from sessions where user_id = $1`, [id]).catch(() => null);
    }

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
