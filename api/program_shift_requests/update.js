const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const { requireAuth } = require("../../lib/auth");
const db = require("../../services/supabase");
const {
  ALLOWED_STATUSES,
  ensureProgramShiftRequestsTable,
  normalizeStatus,
} = require("./helpers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) return;

  try {
    await ensureProgramShiftRequestsTable();
    const body = await bodyParser(req);
    const id = String(body.id || "").trim();
    const status = normalizeStatus(body.status);
    const adminNotes = String(body.admin_notes || "").trim();

    if (!id) {
      return badRequest(res, "Shift request ID is required");
    }

    if (!ALLOWED_STATUSES.includes(status) || status === "Pending") {
      return badRequest(res, "Status must be Approved or Rejected");
    }

    if (status === "Rejected" && !adminNotes) {
      return badRequest(res, "Admin notes are required when rejecting a shift request");
    }

    const existingResult = await db.query(
      `
      select *
      from program_shift_requests
      where id = $1
      limit 1
      `,
      [id],
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      return badRequest(res, "Shift request not found");
    }

    if (String(existing.status || "") !== "Pending") {
      return badRequest(res, "This shift request was already reviewed");
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const updateResult = await client.query(
        `
        update program_shift_requests
        set status = $2,
            admin_notes = $3,
            reviewed_by = $4,
            reviewed_at = now(),
            updated_at = now()
        where id = $1
        returning *
        `,
        [
          id,
          status,
          adminNotes || null,
          auth.email || auth.first_name || "Admin",
        ],
      );
      const updated = updateResult.rows[0];

      if (status === "Approved") {
        await client.query(
          `
          update enrollments
          set program_id = $2,
              program_name = $3,
              program_code = $4,
              major = $5,
              updated_at = now()
          where lower(email) = lower($1)
            and lower(coalesce(status, '')) = 'approved'
          `,
          [
            updated.email,
            updated.target_program_id,
            updated.target_program_name,
            updated.target_program_code,
            updated.target_major || null,
          ],
        );
      }

      await client.query("COMMIT");
      return okay(res, updated);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
