const { okay, badRequest, notAllowed } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { readAuditLogs } = require("../../lib/audit-log");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury", "records"]);
  if (!auth) {
    return;
  }

  const { id } = req.query;

  if (!id) {
    return badRequest(res, "Document request ID is required");
  }

  try {
    const requestResult = await db.query(
      `
      select *
      from document_requests
      where id = $1
      limit 1
      `,
      [id],
    );

    if (!requestResult.rows.length) {
      return badRequest(res, "Document request not found");
    }

    const request = requestResult.rows[0];

    const userResult = await db.query(
      `
      select id, first_name, middle_name, last_name, email, mobile, type, created_at
      from users
      where email = $1
         or id::text = $2
      order by created_at desc
      limit 1
      `,
      [request.email, request.student_id || ""],
    );

    const enrollmentResult = await db.query(
      `
      select *
      from enrollments
      where email = $1
      order by created_at desc
      limit 1
      `,
      [request.email],
    );

    const studentId =
      request.student_id || userResult.rows[0]?.id || null;

    const recordsResult = studentId
      ? await db.query(
          `
          select *
          from student_records
          where student_id = $1
          order by school_year asc, created_at asc
          `,
          [studentId],
        )
      : { rows: [] };

    const auditLogsResult = await readAuditLogs(db, {
      entityType: "document_request",
      entityId: String(request.id),
    });

    return okay(res, {
      request,
      student: userResult.rows[0] || null,
      enrollment: enrollmentResult.rows[0] || null,
      student_records: recordsResult.rows,
      audit_logs: auditLogsResult,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
