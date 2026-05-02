const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const { normalizeEmail } = require("../../lib/email");
const { requireAuth } = require("../../lib/auth");
const db = require("../../services/supabase");
const { ensureProgramShiftRequestsTable } = require("./helpers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    await ensureProgramShiftRequestsTable();
    const body = await bodyParser(req);
    const {
      student_id,
      student_name,
      email,
      current_program_id,
      current_program_name,
      current_program_code,
      current_major,
      target_program_id,
      target_major,
      reason,
    } = body;
    const normalizedEmail = normalizeEmail(email || auth.email || "");
    const authEmail = normalizeEmail(auth.email || "");
    const authRole = String(auth.type || "").toLowerCase();
    const isPrivileged = ["admin", "super_admin", "records"].includes(authRole);

    if (!isPrivileged && normalizedEmail !== authEmail) {
      return badRequest(res, "You can only submit your own shift request");
    }

    if (!target_program_id || !String(reason || "").trim()) {
      return badRequest(res, "Target program and reason are required");
    }

    const pendingResult = await db.query(
      `
      select id
      from program_shift_requests
      where lower(email) = $1
        and lower(status) = 'pending'
      limit 1
      `,
      [normalizedEmail],
    );

    if (pendingResult.rows.length) {
      return badRequest(res, "You already have a pending shift request");
    }

    const programResult = await db.query(
      `
      select id, name, code
      from programs
      where id = $1
      limit 1
      `,
      [target_program_id],
    );
    const targetProgram = programResult.rows[0];

    if (!targetProgram) {
      return badRequest(res, "Target program not found");
    }

    const sameProgram =
      String(current_program_id || "") === String(targetProgram.id || "") &&
      String(current_major || "") === String(target_major || "");

    if (sameProgram) {
      return badRequest(res, "Please choose a different program or major");
    }

    const result = await db.query(
      `
      insert into program_shift_requests (
        student_id,
        student_name,
        email,
        current_program_id,
        current_program_name,
        current_program_code,
        current_major,
        target_program_id,
        target_program_name,
        target_program_code,
        target_major,
        reason
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      returning *
      `,
      [
        student_id || auth.student_number || auth.id || null,
        student_name || `${auth.first_name || ""} ${auth.last_name || ""}`.trim() || normalizedEmail,
        normalizedEmail,
        current_program_id || null,
        current_program_name || null,
        current_program_code || null,
        current_major || null,
        targetProgram.id,
        targetProgram.name,
        targetProgram.code || null,
        target_major || null,
        String(reason || "").trim(),
      ],
    );

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
