const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { createUser } = require("../users/create");
const sendEmail = require("../sendMail/sendMail");
const bcrypt = require("bcrypt");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const { id, status, reason } = body;

    console.log("Enrollment details:");
    console.log(body);

    if (!status || !id) {
      return badRequest(res, "Missing required fields");
    }

    const enrollmentResult = await db.query(
      `SELECT * FROM enrollments WHERE id = $1`,
      [id],
    );
    const enrollment = enrollmentResult.rows[0];

    if (!enrollment) {
      return badRequest(res, "Enrollment not found");
    }

    const normalizedStatus =
      String(status || "").toLowerCase() === "denied" ? "Declined" : status;

    if (normalizedStatus === "Approved") {
      const downpayment = await getApprovedDownpayment(id);

      if (!downpayment) {
        return badRequest(
          res,
          "Treasury must approve the enrollment downpayment before admin approval",
        );
      }
    }

    const result = await db.query(
      `UPDATE enrollments
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [normalizedStatus, id],
    );

    const {
      last_name,
      first_name,
      middle_name,
      birthday,
      email,
      program_name,
      year_level,
      semester,
    } = enrollment;

    if (normalizedStatus === "Approved") {
      const generatedPassword = buildStudentPassword(last_name, birthday);
      const approvedDownpayment = await getApprovedDownpayment(id);
      const existingUserResult = await db.query(
        `select * from users where email = $1`,
        [email],
      );

      let student;

      if (existingUserResult.rows.length) {
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);
        const updatedUser = await db.query(
          `
          update users
          set last_name = $2,
              first_name = $3,
              middle_name = $4,
              username = $5,
              password = $6,
              type = 'student',
              updated_at = now()
          where email = $1
          returning id, last_name, first_name, middle_name, username, email, mobile, type, created_at
          `,
          [
            email,
            last_name,
            first_name,
            middle_name || null,
            email,
            hashedPassword,
          ],
        );

        student = updatedUser.rows[0];
      } else {
        student = await createUser({
          last_name,
          first_name,
          middle_name,
          username: email,
          email,
          password: generatedPassword,
          type: "student",
        });
      }

      console.log("Student Details:");
      console.log(student);

      const message = buildApprovalEmail({
        enrollment,
        student,
        generatedPassword,
        approvedDownpayment,
      });
      const corDocument = buildCorDocument({
        enrollment,
        student,
        approvedDownpayment,
      });

      console.log(`Sending approval email to ${email}`);
      await sendEmail(
        email,
        "Enrollment Approved - Student Account Details",
        message,
        [
          {
            filename: `COR-${String(id).slice(0, 8)}.doc`,
            content: corDocument,
            contentType: "application/msword",
          },
        ],
      );
    } else if (normalizedStatus === "Declined") {
      const message = `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55;">
          <h2 style="margin:0 0 12px;color:#991b1b;">Admin Declined</h2>
          <p>Good day <strong>${first_name} ${last_name}</strong>,</p>
          <p>
            Your enrollment application has been declined by the admin.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
            <tr>
              <td style="padding:6px 0;"><strong>Enrollment ID:</strong></td>
              <td style="padding:6px 0;">${id}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;"><strong>Name:</strong></td>
              <td style="padding:6px 0;">${last_name}, ${first_name} ${middle_name || ""}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;"><strong>Birthday:</strong></td>
              <td style="padding:6px 0;">${birthday || "N/A"}</td>
            </tr>
          </table>
          <p>
            Please come to Regis Marie College and present your Enrollment ID to
            know the reason for the declined application.
          </p>
          <p>Thank you.</p>
          <p>Regis Marie College</p>
        </div>
      `;

      console.log(`Sending declined email to ${email}`);
      await sendEmail(email, "Admin Declined Enrollment", message);
    }

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

function buildStudentPassword(lastName, birthday) {
  const trimmedLastName = String(lastName || "")
    .trim()
    .replace(/\s+/g, "");
  const birthYear = new Date(birthday).getUTCFullYear();

  if (!trimmedLastName || Number.isNaN(birthYear)) {
    throw new Error("Unable to generate student password from enrollment data");
  }

  return `${trimmedLastName}${birthYear}`;
}

async function getApprovedDownpayment(enrollmentId) {
  const result = await db.query(
    `
    select *
    from billings
    where enrollment_id = $1
      and lower(description) like '%downpayment%'
      and lower(payment_status) = 'approved'
      and amount_paid > 0
    order by created_at desc
    limit 1
    `,
    [enrollmentId],
  );

  return result.rows[0] || null;
}

function parseSelectedCourses(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildApprovalEmail({ enrollment, student, generatedPassword, approvedDownpayment }) {
  const {
    last_name,
    first_name,
    middle_name,
    birthday,
    email,
    program_name,
    year_level,
    semester,
    selected_courses,
    total_units,
    total_amount,
  } = enrollment;
  const courses = parseSelectedCourses(selected_courses);
  const tuition = Number(total_amount || 0);
  const miscFee = 1500;
  const idFee = 300;
  const totalFees = tuition + miscFee + idFee;
  const paidAmount = Number(approvedDownpayment?.amount_paid || approvedDownpayment?.amount || 0);

  const courseRows = courses.length
    ? courses
        .map((course, index) => {
          return `
            <tr>
              <td style="border:1px solid #cbd5e1;padding:7px;">${index + 1}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;">${course.name || "-"}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:center;">${course.units || 0}</td>
              <td style="border:1px solid #cbd5e1;padding:7px;text-align:right;">${formatMoney(course.amount || 0)}</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="4" style="border:1px solid #cbd5e1;padding:7px;text-align:center;">No course details available.</td>
      </tr>
    `;

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45;">
      <h2 style="margin:0 0 12px;color:#14532d;">Enrollment Approved</h2>
      <p>Good day <strong>${first_name} ${last_name}</strong>,</p>
      <p>Your enrollment has been approved. Below is your registration and assessment summary.</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <tr>
          <td><strong>Name:</strong> ${last_name}, ${first_name} ${middle_name || ""}</td>
          <td><strong>Student ID:</strong> ${student.id}</td>
        </tr>
        <tr>
          <td><strong>Course/Plan:</strong> ${program_name || "N/A"}</td>
          <td><strong>Year Level:</strong> ${year_level || "N/A"}</td>
        </tr>
        <tr>
          <td><strong>Semester:</strong> ${semester || "N/A"}</td>
          <td><strong>Birthday:</strong> ${birthday || "N/A"}</td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <thead>
          <tr style="background:#eff6ff;">
            <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">#</th>
            <th style="border:1px solid #cbd5e1;padding:7px;text-align:left;">Description</th>
            <th style="border:1px solid #cbd5e1;padding:7px;text-align:center;">Units</th>
            <th style="border:1px solid #cbd5e1;padding:7px;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${courseRows}</tbody>
      </table>

      <table style="margin-left:auto;border-collapse:collapse;font-size:13px;min-width:280px;">
        <tr><td style="padding:4px 10px;"><strong>Total Units:</strong></td><td style="padding:4px 10px;text-align:right;">${total_units || 0}</td></tr>
        <tr><td style="padding:4px 10px;"><strong>Tuition Fee:</strong></td><td style="padding:4px 10px;text-align:right;">${formatMoney(tuition)}</td></tr>
        <tr><td style="padding:4px 10px;"><strong>Misc Fee:</strong></td><td style="padding:4px 10px;text-align:right;">${formatMoney(miscFee)}</td></tr>
        <tr><td style="padding:4px 10px;"><strong>ID Fee:</strong></td><td style="padding:4px 10px;text-align:right;">${formatMoney(idFee)}</td></tr>
        <tr><td style="padding:4px 10px;border-top:1px solid #cbd5e1;"><strong>Total Fees:</strong></td><td style="padding:4px 10px;border-top:1px solid #cbd5e1;text-align:right;"><strong>${formatMoney(totalFees)}</strong></td></tr>
        <tr><td style="padding:4px 10px;"><strong>Payment:</strong></td><td style="padding:4px 10px;text-align:right;">${formatMoney(paidAmount)}</td></tr>
      </table>

      <hr style="margin:20px 0;border:none;border-top:1px solid #d1d5db;" />
      <h3 style="margin-bottom:8px;">Student Portal Login</h3>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Password:</strong> ${generatedPassword}</p>
      <p>Please keep your login details secure.</p>
      <p>Thank you and congratulations.</p>
    </div>
  `;
}

function buildCorDocument({ enrollment, student, approvedDownpayment }) {
  const {
    last_name,
    first_name,
    middle_name,
    birthday,
    program_name,
    program_code,
    year_level,
    semester,
    selected_courses,
    total_units,
    total_amount,
  } = enrollment;
  const courses = parseSelectedCourses(selected_courses);
  const tuition = Number(total_amount || 0);
  const miscFee = 1500;
  const idFee = 300;
  const totalFees = tuition + miscFee + idFee;
  const payment = Number(approvedDownpayment?.amount_paid || approvedDownpayment?.amount || 0);
  const balance = Math.max(totalFees - payment, 0);
  const studentName = `${last_name || ""}, ${first_name || ""} ${middle_name || ""}`.trim();

  const courseRows = courses.length
    ? courses
        .map((course, index) => {
          return `
            <tr>
              <td>${escapeHtml(course.code || course.id || `C${index + 1}`)}</td>
              <td>${escapeHtml(course.section || "-")}</td>
              <td>${escapeHtml(course.name || "-")}</td>
              <td class="center">${escapeHtml(course.units || 0)}</td>
              <td class="center">TBA</td>
              <td class="center">TBA</td>
              <td class="center">TBA</td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="7" class="center">No course details available.</td>
      </tr>
    `;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { margin: 0.55in; }
          body {
            font-family: Arial, sans-serif;
            color: #111;
            font-size: 11px;
          }
          .header {
            text-align: center;
            margin-bottom: 14px;
          }
          .header h1 {
            margin: 0;
            font-size: 18px;
            letter-spacing: 0.04em;
          }
          .header p {
            margin: 3px 0;
          }
          .info-grid {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          .info-grid td {
            padding: 3px 6px;
            vertical-align: top;
          }
          table.schedule {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
          }
          .schedule th,
          .schedule td {
            border: 1px solid #333;
            padding: 5px;
          }
          .schedule th {
            background: #f3f4f6;
            font-weight: bold;
            text-align: center;
          }
          .center {
            text-align: center;
          }
          .footer-layout {
            width: 100%;
            margin-top: 28px;
          }
          .note {
            width: 62%;
            vertical-align: top;
            padding-right: 24px;
          }
          .fees {
            width: 38%;
            vertical-align: top;
          }
          .fees table {
            width: 100%;
            border-collapse: collapse;
          }
          .fees td {
            padding: 3px 6px;
          }
          .fees td:last-child {
            text-align: right;
          }
          .total-row td {
            border-top: 1px solid #333;
            font-weight: bold;
          }
          .signature {
            margin-top: 42px;
            width: 210px;
            border-top: 1px solid #333;
            text-align: center;
            padding-top: 6px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>REGIS MARIE COLLEGE</h1>
          <p>Certificate of Registration</p>
        </div>

        <table class="info-grid">
          <tr>
            <td><strong>Name:</strong> ${escapeHtml(studentName)}</td>
            <td><strong>Student ID:</strong> ${escapeHtml(student.id || "-")}</td>
            <td><strong>Year Level:</strong> ${escapeHtml(year_level || "-")}</td>
          </tr>
          <tr>
            <td><strong>Nationality:</strong> Filipino</td>
            <td><strong>Course/Plan:</strong> ${escapeHtml(program_name || program_code || "-")}</td>
            <td><strong>Sy/Term:</strong> ${escapeHtml(semester || "-")}</td>
          </tr>
          <tr>
            <td><strong>Birthdate:</strong> ${escapeHtml(birthday || "-")}</td>
            <td><strong>Campus:</strong> Regis Marie College</td>
            <td><strong>Payment:</strong> ${escapeHtml(formatMoney(payment))}</td>
          </tr>
        </table>

        <table class="schedule">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Section</th>
              <th>Description</th>
              <th>Units</th>
              <th>Days</th>
              <th>Time</th>
              <th>Room</th>
            </tr>
          </thead>
          <tbody>
            ${courseRows}
            <tr>
              <td colspan="7" class="center">**Nothing follows**</td>
            </tr>
          </tbody>
        </table>

        <table class="footer-layout">
          <tr>
            <td class="note">
              <h3>NOTE:</h3>
              <p><strong>WITHDRAWAL OF ENROLLMENT AND REFUND OF FEES</strong></p>
              <p>1. Withdrawal of enrollment is allowed only within the first two weeks of classes.</p>
              <p>2. Registration, Other Fees, Miscellaneous Fees, and ID Fees are non-refundable.</p>
              <p>3. Tuition refund is subject to school review and applicable enrollment policies.</p>
              <p><strong>Reminder:</strong> All discrepancies in fees and subjects/courses are subject to review and adjustment before or until classes start.</p>
              <div class="signature">Registrar / Authorized Representative</div>
            </td>
            <td class="fees">
              <table>
                <tr><td><strong>Total Units:</strong></td><td>${escapeHtml(total_units || 0)}</td></tr>
                <tr><td><strong>Tuition Fee:</strong></td><td>${escapeHtml(formatMoney(tuition))}</td></tr>
                <tr><td><strong>Misc Fee:</strong></td><td>${escapeHtml(formatMoney(miscFee))}</td></tr>
                <tr><td><strong>ID Fee:</strong></td><td>${escapeHtml(formatMoney(idFee))}</td></tr>
                <tr><td><strong>Discount:</strong></td><td>${escapeHtml(formatMoney(0))}</td></tr>
                <tr class="total-row"><td><strong>Total Fees:</strong></td><td>${escapeHtml(formatMoney(totalFees))}</td></tr>
                <tr><td><strong>Payment:</strong></td><td>${escapeHtml(formatMoney(payment))}</td></tr>
                <tr><td><strong>Balance:</strong></td><td>${escapeHtml(formatMoney(balance))}</td></tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return map[char] || char;
  });
}
