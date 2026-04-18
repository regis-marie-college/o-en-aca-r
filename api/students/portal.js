const { okay, badRequest, notAllowed } = require("../../lib/response");
const db = require("../../services/supabase");
const config = require("../../lib/config");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { email } = req.query;

  if (!email) {
    return badRequest(res, "email is required");
  }

  try {
    const userResult = await db.query(`select * from users where email = $1`, [
      email,
    ]);
    const user = userResult.rows[0] || null;

    const enrollmentResult = await db.query(
      `
      select *
      from enrollments
      where email = $1
      order by created_at desc
      limit 1
      `,
      [email],
    );
    const enrollment = enrollmentResult.rows[0] || null;

    const takenCoursesResult = user
      ? await db.query(
          `
          select *
          from student_records
          where student_id = $1
          order by created_at desc
          `,
          [user.id],
        )
      : { rows: [] };

    const billingsResult = await db.query(
      `
      select *
      from billings
      where email = $1
      order by created_at desc
      `,
      [email],
    );

    const requestsResult = await db.query(
      `
      select *
      from document_requests
      where email = $1
      order by created_at desc
      `,
      [email],
    );

    const documentsResult = enrollment
      ? await db.query(
          `
          select *
          from documents
          where enrollment_id = $1
          order by created_at asc, id asc
          `,
          [enrollment.id],
        )
      : { rows: [] };

    const totalPaid = billingsResult.rows.reduce(
      (sum, item) => sum + Number(item.amount_paid || 0),
      0,
    );
    const totalBalance = billingsResult.rows.reduce(
      (sum, item) => sum + Number(item.balance || 0),
      0,
    );

    return okay(res, {
      user,
      enrollment,
      current_courses: Array.isArray(enrollment?.selected_courses)
        ? enrollment.selected_courses
        : [],
      taken_courses: takenCoursesResult.rows,
      billings: billingsResult.rows,
      total_paid: totalPaid,
      total_balance: totalBalance,
      document_requests: requestsResult.rows,
      submitted_documents: documentsResult.rows,
      id_picture:
        documentsResult.rows.find((document) => document.type === "idpic") ||
        null,
      payment_options: config.payment_accounts,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
