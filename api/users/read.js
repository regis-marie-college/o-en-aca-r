const { okay, notAllowed, badRequest, forbidden } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res);
  if (!auth) {
    return;
  }

  const { id } = req.query;

  if (!id) {
    return badRequest(res, "id is required");
  }

  const isPrivileged = ["admin", "records"].includes(String(auth.type || "").toLowerCase());
  const isSelf = String(auth.id || "") === String(id);

  if (!isPrivileged && !isSelf) {
    return forbidden(res, "You are not allowed to view this user");
  }

  try {
    const result = await db.query(
      `
      select id, student_number, last_name, first_name, middle_name, username, email, mobile, type, verified_at, created_at, updated_at
      from users
      where id = $1
      limit 1
      `,
      [id],
    );

    return okay(res, result.rows[0] || null);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
