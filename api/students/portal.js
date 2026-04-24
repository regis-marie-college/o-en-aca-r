const { okay, badRequest, notAllowed, forbidden } = require("../../lib/response");
const db = require("../../services/supabase");
const config = require("../../lib/config");
const { normalizeEmail } = require("../../lib/email");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res);
  if (!auth) {
    return;
  }

  const { email } = req.query;

  if (!email) {
    return badRequest(res, "email is required");
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    const normalizedAuthEmail = normalizeEmail(auth.email || "");
    const normalizedRole = String(auth.type || "").toLowerCase();
    const isPrivileged = ["admin", "records", "treasury"].includes(normalizedRole);

    if (!isPrivileged && normalizedEmail !== normalizedAuthEmail) {
      return forbidden(res, "You are not allowed to view this portal");
    }

    const [userResult, latestRequestResult, approvedEnrollmentResult] =
      await Promise.all([
        db.query(
          `
          select *
          from users
          where lower(email) = $1
            and deleted_at is null
          order by updated_at desc, created_at desc
          limit 1
          `,
          [normalizedEmail],
        ),
        db.query(
          `
          select *
          from enrollments
          where lower(email) = $1
          order by created_at desc
          limit 1
          `,
          [normalizedEmail],
        ),
        db.query(
          `
          select *
          from enrollments
          where lower(email) = $1
            and lower(coalesce(status, '')) = 'approved'
          order by created_at desc
          limit 1
          `,
          [normalizedEmail],
        ),
      ]);

    const user = userResult.rows[0] || null;
    const latestRequest = latestRequestResult.rows[0] || null;
    const approvedEnrollment = approvedEnrollmentResult.rows[0] || null;
    const enrollment = approvedEnrollment || latestRequest || null;

    const [
      takenCoursesResult,
      billingsResult,
      requestsResult,
      transactionsResult,
      documentsResult,
    ] = await Promise.all([
      user
        ? db.query(
          `
          select *
          from student_records
          where student_id = $1
          order by created_at desc
          `,
            [user.id],
          )
        : Promise.resolve({ rows: [] }),
      db.query(
        `
        select *
        from billings
        where lower(email) = $1
        order by created_at desc
        `,
        [normalizedEmail],
      ),
      db.query(
        `
        select *
        from document_requests
        where lower(email) = $1
        order by created_at desc
        `,
        [normalizedEmail],
      ),
      db.query(
        `
        select *
        from treasury_transactions
        where lower(email) = $1
        order by created_at desc
        `,
        [normalizedEmail],
      ),
      latestRequest
        ? db.query(
          `
          select *
          from documents
          where enrollment_id = $1
          order by created_at asc, id asc
          `,
            [latestRequest.id],
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const totalPaid = billingsResult.rows.reduce(
      (sum, item) => sum + Number(item.amount_paid || 0),
      0,
    );
    const totalBalance = billingsResult.rows.reduce(
      (sum, item) => sum + Number(item.balance || 0),
      0,
    );
    const totalTransactionAmount = transactionsResult.rows.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );

    return okay(res, {
      user,
      enrollment,
      latest_request: latestRequest,
      current_courses: Array.isArray(approvedEnrollment?.selected_courses)
        ? approvedEnrollment.selected_courses
        : Array.isArray(enrollment?.selected_courses)
          ? enrollment.selected_courses
        : [],
      taken_courses: takenCoursesResult.rows,
      billings: billingsResult.rows,
      total_paid: totalPaid,
      total_balance: totalBalance,
      transaction_total: totalTransactionAmount,
      document_requests: requestsResult.rows,
      transactions: transactionsResult.rows,
      submitted_documents: documentsResult.rows,
      id_picture:
        (enrollment?.idpic_url
          ? {
              name:
                documentsResult.rows.find((document) => document.type === "idpic")
                  ?.name || "1x1 ID Picture",
              url: enrollment.idpic_url,
            }
          : null) ||
        documentsResult.rows.find((document) => document.type === "idpic") ||
        null,
      payment_options: config.payment_accounts,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
