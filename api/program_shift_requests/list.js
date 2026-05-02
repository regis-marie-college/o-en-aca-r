const { okay, badRequest, notAllowed, forbidden } = require("../../lib/response");
const { normalizeEmail } = require("../../lib/email");
const { requireAuth } = require("../../lib/auth");
const { parseLimit } = require("../../lib/query-options");
const db = require("../../services/supabase");
const { ensureProgramShiftRequestsTable, normalizeStatus } = require("./helpers");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    await ensureProgramShiftRequestsTable();
    const role = String(auth.type || "").toLowerCase();
    const isPrivileged = ["admin", "super_admin", "records"].includes(role);
    const { email, status, search } = req.query;
    const limit = parseLimit(req.query.limit, 100, 500);
    const conditions = [];
    const params = [];

    if (email) {
      const normalizedEmail = normalizeEmail(email);
      if (!isPrivileged && normalizedEmail !== normalizeEmail(auth.email || "")) {
        return forbidden(res, "You are not allowed to view these shift requests");
      }
      params.push(normalizedEmail);
      conditions.push(`lower(email) = $${params.length}`);
    } else if (!isPrivileged) {
      params.push(normalizeEmail(auth.email || ""));
      conditions.push(`lower(email) = $${params.length}`);
    }

    if (status) {
      params.push(normalizeStatus(status));
      conditions.push(`status = $${params.length}`);
    }

    if (search) {
      params.push(`%${String(search).trim()}%`);
      conditions.push(`(
        student_name ilike $${params.length} or
        email ilike $${params.length} or
        current_program_name ilike $${params.length} or
        target_program_name ilike $${params.length}
      )`);
    }

    params.push(limit);
    const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const result = await db.query(
      `
      select *
      from program_shift_requests
      ${whereClause}
      order by created_at desc
      limit $${params.length}
      `,
      params,
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
