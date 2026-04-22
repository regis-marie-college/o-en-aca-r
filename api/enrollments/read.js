const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { readAuditLogs } = require("../../lib/audit-log");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury"]);
  if (!auth) {
    return;
  }

  const { id } = req.query;

  try {
    if (!id) {
      return badRequest(res, "Enrollment ID is required");
    }

    const result = await db.query(`SELECT * FROM enrollments WHERE id = $1`, [id]);
    const enrollment = result.rows[0];

    if (!enrollment) {
      return okay(res, null);
    }

    const downpaymentResult = await db.query(
      `
      select *
      from billings
      where enrollment_id = $1
        and lower(description) like '%downpayment%'
      order by created_at desc
      limit 1
      `,
      [id],
    );

    const auditLogsResult = await readAuditLogs(db, {
      entityType: "enrollment",
      entityId: String(id),
    });

    const normalizedEmail = String(enrollment.email || "").trim().toLowerCase();
    const userResult = normalizedEmail
      ? await db.query(
          `
          select id, student_number, email
          from users
          where lower(email) = $1
            and deleted_at is null
          order by updated_at desc, created_at desc
          limit 1
          `,
          [normalizedEmail],
        )
      : { rows: [] };
    const matchedUser = userResult.rows[0] || null;
    const studentRecordIds = Array.from(
      new Set(
        [enrollment.student_id, matchedUser?.id, matchedUser?.student_number]
          .filter(Boolean)
          .map((value) => String(value).trim())
          .filter(Boolean),
      ),
    );

    const takenCoursesResult = studentRecordIds.length
      ? await db.query(
          `
          select *
          from student_records
          where student_id = any($1::text[])
          order by
            coalesce(academic_year, school_year) desc,
            semester asc nulls last,
            created_at desc
          `,
          [studentRecordIds],
        )
      : { rows: [] };

    return okay(res, {
      ...enrollment,
      downpayment_billing: downpaymentResult.rows[0] || null,
      audit_logs: auditLogsResult,
      taken_courses: takenCoursesResult.rows,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
