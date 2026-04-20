const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { createUser } = require("../users/create");
const sendEmail = require("../sendMail/sendMail");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit");
const ID_FEE = 300;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const { id, status, reason, misc_fee } = body;

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
    const hasMiscFeeValue =
      misc_fee !== undefined && misc_fee !== null && String(misc_fee).trim() !== "";
    const parsedMiscFee = hasMiscFeeValue ? Number(misc_fee) : Number(enrollment.misc_fee || 0);

    if (Number.isNaN(parsedMiscFee) || parsedMiscFee < 0) {
      return badRequest(res, "Misc fee must be a valid non-negative amount");
    }

    if (normalizedStatus === "Approved") {
      if (!hasMiscFeeValue && Number(enrollment.misc_fee || 0) <= 0) {
        return badRequest(
          res,
          "Treasury must set the misc fee before enrollment approval",
        );
      }

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
       SET status = $1,
           misc_fee = $3,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [normalizedStatus, id, parsedMiscFee.toFixed(2)],
    );
    const updatedEnrollment = result.rows[0];

    await syncEnrollmentBillings(updatedEnrollment);

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
      const corDocument = await buildCorPdfBuffer({
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
            filename: `COR-${String(id).slice(0, 8)}.pdf`,
            content: corDocument,
            contentType: "application/pdf",
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

    return okay(res, updatedEnrollment);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function syncEnrollmentBillings(enrollment) {
  if (!enrollment?.id) {
    return;
  }

  const result = await db.query(
    `
    select *
    from billings
    where enrollment_id = $1
    order by created_at asc
    `,
    [enrollment.id],
  );

  if (!result.rows.length) {
    return;
  }

  const billings = result.rows;
  const downpaymentBilling = billings.find((billing) =>
    String(billing.description || "").toLowerCase().includes("downpayment"),
  );

  if (!downpaymentBilling) {
    return;
  }

  const miscFee = Number(enrollment.misc_fee || 0);
  const courseAmount = Number(enrollment.total_amount || 0);
  const totalAssessment = courseAmount + miscFee + ID_FEE;
  const downpaymentAmount = Number(downpaymentBilling.amount || 0);
  const installmentBillings = billings.filter((billing) => billing.id !== downpaymentBilling.id);
  const remainingBalance = Math.max(totalAssessment - downpaymentAmount, 0);
  const installmentAmounts = splitAmounts(remainingBalance, installmentBillings.length);

  await db.query(
    `
    update billings
    set description = $2,
        balance = greatest(amount - amount_paid, 0),
        status = case
          when greatest(amount - amount_paid, 0) <= 0 and amount > 0 then 'Paid'
          when amount_paid > 0 then 'Partial'
          else 'Unpaid'
        end,
        updated_at = now()
    where id = $1
    `,
    [
      downpaymentBilling.id,
      `Downpayment - Tuition and Fees (Course Fee: PHP ${courseAmount.toFixed(
        2,
      )}, Misc Fee: PHP ${miscFee.toFixed(2)}, ID Fee: PHP ${ID_FEE.toFixed(2)})`,
    ],
  );

  for (const [index, billing] of installmentBillings.entries()) {
    const nextAmount = Number(installmentAmounts[index] || 0);

    await db.query(
      `
      update billings
      set amount = $2,
          balance = greatest($2 - amount_paid, 0),
          status = case
            when greatest($2 - amount_paid, 0) <= 0 and $2 > 0 then 'Paid'
            when amount_paid > 0 then 'Partial'
            else 'Unpaid'
          end,
          updated_at = now()
      where id = $1
      `,
      [billing.id, nextAmount.toFixed(2)],
    );
  }
}

function splitAmounts(total, count) {
  const safeCount = Number(count || 0);

  if (safeCount <= 0) {
    return [];
  }

  const amounts = [];
  const baseAmount = Number((Number(total || 0) / safeCount).toFixed(2));

  for (let index = 0; index < safeCount; index += 1) {
    if (index < safeCount - 1) {
      amounts.push(baseAmount);
      continue;
    }

    const allocated = amounts.reduce((sum, value) => sum + value, 0);
    amounts.push(Number((Number(total || 0) - allocated).toFixed(2)));
  }

  return amounts;
}

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
  const miscFee = Number(enrollment.misc_fee || 0);
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

function buildCorPdfBuffer({ enrollment, student, approvedDownpayment }) {
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
  const miscFee = Number(enrollment.misc_fee || 0);
  const idFee = 300;
  const totalFees = tuition + miscFee + idFee;
  const payment = Number(approvedDownpayment?.amount_paid || approvedDownpayment?.amount || 0);
  const balance = Math.max(totalFees - payment, 0);
  const studentName = `${last_name || ""}, ${first_name || ""} ${middle_name || ""}`.trim();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 34,
      info: {
        Title: `COR ${student.id || ""}`.trim(),
        Author: "Regis Marie College",
      },
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(18).text("REGIS MARIE COLLEGE", {
      align: "center",
    });
    doc.moveDown(0.1);
    doc.font("Helvetica").fontSize(11).text("Certificate of Registration", {
      align: "center",
    });
    doc.moveDown(0.6);

    const infoLeftX = doc.page.margins.left;
    const infoRightX = 315;
    let infoY = doc.y;

    infoY = drawPdfField(doc, infoLeftX, infoY, 250, "Name", studentName || "-");
    drawPdfField(
      doc,
      infoRightX,
      doc.y - 14.5,
      220,
      "Student ID",
      String(student.id || "-"),
    );

    infoY = drawPdfField(
      doc,
      infoLeftX,
      infoY,
      250,
      "Course/Plan",
      String(program_name || program_code || "-"),
    );
    drawPdfField(doc, infoRightX, doc.y - 14.5, 220, "Year Level", String(year_level || "-"));

    infoY = drawPdfField(
      doc,
      infoLeftX,
      infoY,
      250,
      "Semester",
      String(semester || "-"),
    );
    drawPdfField(
      doc,
      infoRightX,
      doc.y - 14.5,
      220,
      "Birthdate",
      formatCorDate(birthday),
    );

    infoY = drawPdfField(
      doc,
      infoLeftX,
      infoY,
      250,
      "Payment",
      formatMoney(payment),
    );
    doc.y = infoY + 8;

    const startX = doc.x;
    const tableTop = doc.y;
    const columns = [84, 250, 46, 90];
    const rowHeight = 18;

    drawPdfRow(doc, startX, tableTop, columns, rowHeight, [
      "Subject",
      "Description",
      "Units",
      "Amount",
    ], true);

    let currentY = tableTop + rowHeight;
    const courseItems = courses.length
      ? courses.map((course, index) => [
          String(course.code || `SUBJ ${index + 1}`),
          String(course.name || "-"),
          String(course.units || 0),
          formatMoney(course.amount || 0),
        ])
      : [["-", "No course details available.", "-", "-"]];

    courseItems.forEach((row) => {
      drawPdfRow(doc, startX, currentY, columns, rowHeight, row, false);
      currentY += rowHeight;
    });

    drawPdfRow(doc, startX, currentY, columns, rowHeight, [
      "",
      "Nothing follows",
      "",
      "",
    ], false);
    currentY += rowHeight + 14;

    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gap = 14;
    const noteWidth = 338;
    const assessmentWidth = pageWidth - noteWidth - gap;
    const noteX = doc.page.margins.left;
    const assessmentX = noteX + noteWidth + gap;
    const panelY = currentY;
    const panelHeight = 150;

    drawPdfPanel(doc, noteX, panelY, noteWidth, panelHeight, "Note");
    drawPdfPanel(doc, assessmentX, panelY, assessmentWidth, panelHeight, "Assessment Summary");

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#111111")
      .text(
        "1. Withdrawal of enrollment is allowed only within the first two weeks of classes.\n" +
          "2. Registration, other fees, miscellaneous fees, and ID fees are non-refundable.\n" +
          "3. Tuition refund is subject to school review and applicable enrollment policies.\n" +
          "4. All discrepancies in fees and subjects/courses are subject to review and adjustment before or until classes start.",
        noteX + 10,
        panelY + 24,
        {
          width: noteWidth - 20,
          align: "left",
          lineGap: 2,
        },
      );

    const signatureY = panelY + panelHeight - 34;
    doc
      .moveTo(noteX + noteWidth - 150, signatureY)
      .lineTo(noteX + noteWidth - 20, signatureY)
      .strokeColor("#333333")
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        "Registrar / Authorized Representative",
        noteX + noteWidth - 170,
        signatureY + 5,
        {
          width: 160,
          align: "center",
        },
      );

    const assessmentItems = [
      ["Total Units", total_units || 0],
      ["Tuition Fee", formatMoney(tuition)],
      ["Misc Fee", formatMoney(miscFee)],
      ["ID Fee", formatMoney(idFee)],
      ["Discount", formatMoney(0)],
      ["Total Fees", formatMoney(totalFees)],
      ["Payment", formatMoney(payment)],
      ["Balance", formatMoney(balance)],
    ];
    let summaryY = panelY + 26;

    assessmentItems.forEach(([label, value], index) => {
      const isTotal = index === 5 || index === assessmentItems.length - 1;
      doc
        .font(isTotal ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor("#111111")
        .text(`${label}:`, assessmentX + 10, summaryY, {
          width: 78,
        })
        .text(String(value), assessmentX + 92, summaryY, {
          width: assessmentWidth - 102,
          align: "right",
        });
      summaryY += 14;
    });

    doc.end();
  });
}

function drawPdfRow(doc, startX, startY, widths, height, values, isHeader) {
  let currentX = startX;

  values.forEach((value, index) => {
    const width = widths[index];

    doc
      .rect(currentX, startY, width, height)
      .strokeColor("#333333")
      .lineWidth(1)
      .stroke();

    doc
      .font(isHeader ? "Helvetica-Bold" : "Helvetica")
      .fontSize(8.5)
      .fillColor("#111111")
      .text(String(value || ""), currentX + 4, startY + 5, {
        width: width - 8,
        align: index >= values.length - 2 ? "center" : "left",
        ellipsis: true,
      });

    currentX += width;
  });
}

function drawPdfField(doc, x, y, width, label, value) {
  doc
    .font("Helvetica-Bold")
    .fontSize(9.2)
    .fillColor("#111111")
    .text(`${label}:`, x, y, { continued: true });
  doc.font("Helvetica").text(` ${String(value || "-")}`, {
    width: width,
  });

  return doc.y + 2;
}

function drawPdfPanel(doc, x, y, width, height, title) {
  doc
    .roundedRect(x, y, width, height, 4)
    .strokeColor("#333333")
    .lineWidth(1)
    .stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111111")
    .text(title, x + 10, y + 8, {
      width: width - 20,
    });
}

function formatCorDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
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
