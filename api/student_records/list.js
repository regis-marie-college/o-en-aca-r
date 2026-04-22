const { okay, notAllowed, badRequest, forbidden } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  // Allow only GET requests
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res);
  if (!auth) {
    return;
  }

  // Get student_id from query params
  const { student_id } = req.query;

  // Validate input
  if (!student_id) {
    return badRequest(res, "student_id is required");
  }

  const normalizedRole = String(auth.type || "").toLowerCase();
  const isPrivileged = ["admin", "records"].includes(normalizedRole);
  const isSelf =
    String(auth.id || "") === String(student_id) ||
    String(auth.student_number || "") === String(student_id);

  if (!isPrivileged && !isSelf) {
    return forbidden(res, "You are not allowed to view these student records");
  }

  try {
    // Safe query using parameterized value
    const result = await db.query(
      `
      SELECT *
      FROM student_records
      WHERE student_id = $1
      ORDER BY
        coalesce(academic_year, school_year) desc,
        semester asc nulls last,
        created_at desc
      `,
      [student_id]
    );

    // Return response
    return okay(res, result.rows);
  } catch (err) {
    console.error("Database error:", err);
    return badRequest(res, err.message);
  }
};
