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
      select id, student_number, first_name, middle_name, last_name, email, mobile, type, created_at
      from users
      where lower(email) = lower($1)
         or id::text = $2
         or student_number = $2
      order by created_at desc
      limit 1
      `,
      [request.email, request.student_id || ""],
    );

    const studentLookupIds = Array.from(
      new Set(
        [request.student_id, userResult.rows[0]?.id, userResult.rows[0]?.student_number]
          .filter(Boolean)
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );

    const enrollmentResult = await db.query(
      `
      select *
      from enrollments
      where lower(email) = lower($1)
         or regexp_replace(lower(concat_ws(' ', first_name, middle_name, last_name)), '\\s+', ' ', 'g') =
            regexp_replace(lower($2), '\\s+', ' ', 'g')
         or regexp_replace(lower(concat_ws(' ', first_name, last_name)), '\\s+', ' ', 'g') =
            regexp_replace(lower($2), '\\s+', ' ', 'g')
         or regexp_replace(lower(concat_ws(' ', last_name, first_name)), '\\s+', ' ', 'g') =
            regexp_replace(lower($2), '\\s+', ' ', 'g')
      order by
        case when lower(coalesce(status, '')) = 'approved' then 0 else 1 end,
        updated_at desc nulls last,
        created_at desc
      limit 1
      `,
      [request.email, request.student_name || ""],
    );

    const recordsResult = studentLookupIds.length
      ? await db.query(
          `
          select *
          from student_records
          where student_id = any($1::text[])
          order by coalesce(academic_year, school_year) desc, semester asc nulls last, created_at desc
          `,
          [studentLookupIds],
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
