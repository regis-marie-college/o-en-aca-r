const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { createUser } = require("../users/create");
const sendEmail = require("../sendMail/sendMail");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit");
const { generateStudentNumber } = require("../../lib/student-number");
const { writeAuditLog } = require("../../lib/audit-log");
const { normalizeEmail } = require("../../lib/email");
const { requireAuth } = require("../../lib/auth");
const {
  getCompletedCourseKeys,
  getCompletedSelectedCourses,
} = require("../../lib/course-completion");
const {
  assertValidStatusTransition,
  calculateCourseTotals,
  ensureEnrollmentEvaluationColumns,
  normalizeEnrollmentStatus,
  normalizeRequestType,
  validateFinancialTotals,
} = require("../../lib/enrollment-rules");

const ID_FEE = 300;
const DEFAULT_DOWNPAYMENT_AMOUNT = 2000;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, "admin");
  if (!auth) {
    return;
  }

  let emailJob = null;

  try {
    const body = await bodyParser(req);
    const {
      id,
      status,
      misc_fee,
      admin_notes,
      decline_reason,
      processed_by,
      selected_courses,
      total_units,
      total_amount,
      program_id,
      program_name,
      program_code,
      major,
      year_level,
      semester,
      school_year,
    } = body;

    console.log("Enrollment details:");
    console.log(body);

    if (!status || !id) {
      return badRequest(res, "Missing required fields");
    }

    const client = await db.connect();

    try {
      await ensureEnrollmentEvaluationColumns(client);
      await client.query("BEGIN");

      const enrollmentResult = await client.query(
        `
        select *
        from enrollments
        where id = $1
        for update
        `,
        [id],
      );
      const enrollment = enrollmentResult.rows[0];

      if (!enrollment) {
        throw new Error("Enrollment not found");
      }

      const normalizedStatus = normalizeEnrollmentStatus(status);
      const normalizedRequestType = normalizeRequestType(enrollment.request_type);
      const isReturningStudent = normalizedRequestType === "Returning Student";
      const actorName = String(processed_by || "Admin").trim() || "Admin";
      const hasMiscFeeValue =
        misc_fee !== undefined && misc_fee !== null && String(misc_fee).trim() !== "";
      const parsedMiscFee = hasMiscFeeValue
        ? Number(misc_fee)
        : Number(enrollment.misc_fee || 0);
      const nextAdminNotes =
        admin_notes !== undefined ? String(admin_notes || "").trim() : enrollment.admin_notes || null;
      const nextDeclineReason =
        decline_reason !== undefined
          ? String(decline_reason || "").trim()
          : enrollment.decline_reason || null;

      if (Number.isNaN(parsedMiscFee) || parsedMiscFee < 0) {
        throw new Error("Misc fee must be a valid non-negative amount");
      }

      const nextCourses =
        selected_courses !== undefined
          ? parseSelectedCourses(selected_courses)
          : parseSelectedCourses(enrollment.selected_courses);
      const completedCourseKeys = await getCompletedCourseKeys(client, {
        studentId: enrollment.student_id || null,
        email: enrollment.email,
      });
      const completedSelections = getCompletedSelectedCourses(
        nextCourses,
        completedCourseKeys,
      );

      if (completedSelections.length) {
        throw new Error(
          `Completed courses cannot be selected again: ${completedSelections
            .map((course) => course.name || course.course_name || course.code || course.id)
            .filter(Boolean)
            .join(", ")}`,
        );
      }
      const computedTotals = calculateCourseTotals(nextCourses);
      const nextTotalUnits =
        selected_courses !== undefined
          ? computedTotals.totalUnits
          : Number(total_units ?? enrollment.total_units ?? 0);
      const nextTotalAmount =
        selected_courses !== undefined
          ? computedTotals.totalAmount
          : Number(total_amount ?? enrollment.total_amount ?? 0);

      validateFinancialTotals({
        miscFee: parsedMiscFee,
        totalUnits: nextTotalUnits,
        totalAmount: nextTotalAmount,
      });

      assertValidStatusTransition(
        enrollment.status || (isReturningStudent ? "Pending Evaluation" : "Pending"),
        normalizedStatus,
        normalizedRequestType,
      );

      if (normalizedStatus === "Approved") {
        if (!hasMiscFeeValue && Number(enrollment.misc_fee || 0) <= 0) {
          throw new Error("Treasury must set the misc fee before enrollment approval");
        }

        if (!nextCourses.length) {
          throw new Error("Admin must assign at least one course before approval");
        }

        if (!isReturningStudent) {
          const downpayment = await getApprovedDownpayment(id, client);

          if (!downpayment) {
            throw new Error(
              "Treasury must approve the enrollment downpayment before admin approval",
            );
          }
        }
      }

      if (normalizedStatus === "Declined" && !nextDeclineReason) {
        throw new Error("Decline reason is required when declining an enrollment");
      }

      const result = await client.query(
        `
        update enrollments
        set status = $1,
            misc_fee = $3,
            admin_notes = $4,
            decline_reason = $5,
            evaluated_by = $6,
            evaluated_at = now(),
            selected_courses = $7::jsonb,
            total_units = $8,
            total_amount = $9,
            program_id = $10,
            program_name = $11,
            program_code = $12,
            major = $13,
            year_level = $14,
            semester = $15,
            school_year = $16,
            updated_at = now()
        where id = $2
        returning *
        `,
        [
          normalizedStatus,
          id,
          parsedMiscFee.toFixed(2),
          nextAdminNotes,
          normalizedStatus === "Declined" ? nextDeclineReason : null,
          actorName,
          JSON.stringify(nextCourses),
          nextTotalUnits,
          nextTotalAmount.toFixed(2),
          program_id || enrollment.program_id || null,
          program_name || enrollment.program_name || null,
          program_code || enrollment.program_code || null,
          major !== undefined ? major || null : enrollment.major || null,
          year_level || enrollment.year_level || null,
          semester || enrollment.semester || null,
          school_year || enrollment.school_year || null,
        ],
      );
      const updatedEnrollment = result.rows[0];

      await logEnrollmentFieldChanges({
        client,
        enrollmentBefore: enrollment,
        enrollmentAfter: updatedEnrollment,
        actorName,
        nextCourses,
        nextTotalUnits,
        nextTotalAmount,
        parsedMiscFee,
        nextAdminNotes,
        nextDeclineReason:
          normalizedStatus === "Declined" ? nextDeclineReason : null,
      });

      await ensureEnrollmentBillings(updatedEnrollment, client);
      await syncEnrollmentBillings(updatedEnrollment, client);

      const {
        last_name,
        first_name,
        middle_name,
        birthday,
        email,
      } = updatedEnrollment;

      if (normalizedStatus === "Approved") {
        const generatedPassword = isReturningStudent
          ? null
          : buildStudentPassword(last_name, birthday);
        const approvedDownpayment = await getApprovedDownpayment(id, client);
        const normalizedEmail = normalizeEmail(email);
        const existingUserResult = await client.query(
          `
          select *
          from users
          where lower(email) = $1
            and deleted_at is null
          order by updated_at desc, created_at desc
          limit 1
          for update
          `,
          [normalizedEmail],
        );

        let student;
        let studentNumber =
          existingUserResult.rows[0]?.student_number || updatedEnrollment.student_id || null;

        if (!studentNumber) {
          studentNumber = await generateStudentNumber(
            client,
            new Date(updatedEnrollment.created_at || Date.now()),
          );
        }

        if (existingUserResult.rows.length) {
          if (isReturningStudent) {
            const updatedUser = await client.query(
              `
              update users
              set last_name = $2,
                  first_name = $3,
                  middle_name = $4,
                  username = $5,
                  type = 'student',
                  student_number = $6,
                  updated_at = now()
              where id = $1
              returning id, student_number, last_name, first_name, middle_name, username, email, mobile, type, created_at
              `,
              [
                existingUserResult.rows[0].id,
                last_name,
                first_name,
                middle_name || null,
                normalizedEmail,
                studentNumber,
              ],
            );

            student = updatedUser.rows[0];
          } else {
            const hashedPassword = await bcrypt.hash(generatedPassword, 10);
            const updatedUser = await client.query(
              `
              update users
              set last_name = $2,
                  first_name = $3,
                  middle_name = $4,
                  username = $5,
                  password = $6,
                  type = 'student',
                  student_number = $7,
                  updated_at = now()
              where id = $1
              returning id, student_number, last_name, first_name, middle_name, username, email, mobile, type, created_at
              `,
              [
                existingUserResult.rows[0].id,
                last_name,
                first_name,
                middle_name || null,
                normalizedEmail,
                hashedPassword,
                studentNumber,
              ],
            );

            student = updatedUser.rows[0];
          }
        } else {
          student = await createUser(
            {
              last_name,
              first_name,
              middle_name,
              username: normalizedEmail,
              email: normalizedEmail,
              password: generatedPassword || buildStudentPassword(last_name, birthday),
              type: "student",
              student_number: studentNumber,
            },
            { executor: client },
          );
        }

        await writeAuditLog(client, {
          entity_type: "enrollment",
          entity_id: updatedEnrollment.id,
          action: "student_number_assigned",
          actor: actorName,
          actor_type: "admin",
          details: {
            email: normalizedEmail,
            student_number: student.student_number || studentNumber,
            user_id: student.id,
            request_type: normalizedRequestType,
          },
        });

        const message = buildApprovalEmail({
          enrollment: updatedEnrollment,
          student,
          generatedPassword,
          approvedDownpayment,
          isReturningStudent,
        });
        const corDocument = await buildCorPdfBuffer({
          enrollment: updatedEnrollment,
          student,
          approvedDownpayment,
        });

        emailJob = {
          email: normalizedEmail,
          subject: isReturningStudent
            ? "Enrollment Approved - Returning Student"
            : "Enrollment Approved - Student Account Details",
          message,
          attachments: [
            {
              filename: `COR-${String(id).slice(0, 8)}.pdf`,
              content: corDocument,
              contentType: "application/pdf",
            },
          ],
        };
      } else if (normalizedStatus === "Declined") {
        emailJob = {
          email,
          subject: "Admin Declined Enrollment",
          message: `
            <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.55;">
              <h2 style="margin:0 0 12px;color:#991b1b;">Admin Declined</h2>
              <p>Good day <strong>${first_name} ${last_name}</strong>,</p>
              <p>Your enrollment application has been declined by the admin.</p>
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
              ${
                nextDeclineReason
                  ? `<p><strong>Reason:</strong> ${escapeHtml(nextDeclineReason)}</p>`
                  : ""
              }
              <p>Please come to Regis Marie College and present your Enrollment ID to know the reason for the declined application.</p>
              <p>Thank you.</p>
              <p>Regis Marie College</p>
            </div>
          `,
        };
      }

      await client.query("COMMIT");

      if (emailJob) {
        try {
          console.log(`Sending enrollment email to ${emailJob.email}`);
          await sendEmail(
            emailJob.email,
            emailJob.subject,
            emailJob.message,
            emailJob.attachments || [],
          );
        } catch (emailError) {
          console.error("[EnrollmentEmail]", emailError.message);
        }
      }

      return okay(res, updatedEnrollment);
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function ensureEnrollmentBillings(enrollment, executor = db) {
  if (!enrollment?.id || String(enrollment.status || "") !== "Approved") {
    return;
  }

  const billingsResult = await executor.query(
    `
    select id
    from billings
    where enrollment_id = $1
    limit 1
    `,
    [enrollment.id],
  );

  if (billingsResult.rows.length) {
    return;
  }

  const courseAmount = Number(enrollment.total_amount || 0);
  const totalAssessment = courseAmount + Number(enrollment.misc_fee || 0) + ID_FEE;
  const downpaymentAmount = Math.min(DEFAULT_DOWNPAYMENT_AMOUNT, totalAssessment);

  await createInstallmentBillings({
    enrollment,
    first_name: enrollment.first_name,
    last_name: enrollment.last_name,
    email: enrollment.email,
    courseAmount,
    downpaymentAmount,
    executor,
  });
}

async function createInstallmentBillings({
  enrollment,
  first_name,
  last_name,
  email,
  courseAmount,
  downpaymentAmount,
  executor = db,
}) {
  const studentName = `${first_name} ${last_name}`.trim();
  const miscFee = Number(enrollment.misc_fee || 0);
  const downpayment = Number(downpaymentAmount || 0);
  const tuitionAmount = Number(courseAmount || 0) + ID_FEE;
  const tuitionDownpayment = Math.min(downpayment, tuitionAmount);
  const remainingBalance = Math.max(tuitionAmount - tuitionDownpayment, 0);
  const installments = splitAmounts(remainingBalance, 4);

  const billingItems = [
    {
      description: "Downpayment - Tuition Fee",
      amount: tuitionDownpayment,
    },
    ...installments.map((amount, index) => ({
      description: `${ordinalLabel(index + 1)} Payment Installment - Tuition Fee`,
      amount,
    })),
    { description: "Miscellaneous Fee", amount: miscFee },
  ].filter((item) => Number(item.amount || 0) > 0);

  for (const item of billingItems) {
    await executor.query(
      `
      insert into billings
      (enrollment_id, student_name, email, description, amount, amount_paid, balance, due_date, status, created_by, updated_by)
      values ($1,$2,$3,$4,$5,0,$5,null,'Unpaid',$6,$6)
      `,
      [
        enrollment.id,
        studentName,
        email,
        item.description,
        Number(item.amount).toFixed(2),
        "System Enrollment",
      ],
    );
  }
}

async function syncEnrollmentBillings(enrollment, executor = db) {
  if (!enrollment?.id) {
    return;
  }

  const result = await executor.query(
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
  const courseAmount = Number(enrollment.total_amount || 0) + ID_FEE;
  const downpaymentAmount = Number(downpaymentBilling.amount || 0);
  const installmentBillings = billings.filter((billing) => {
    const description = String(billing.description || "").toLowerCase();
    return billing.id !== downpaymentBilling.id && description.includes("installment");
  });
  const remainingBalance = Math.max(courseAmount - downpaymentAmount, 0);
  const installmentAmounts = splitAmounts(remainingBalance, installmentBillings.length);

  await executor.query(
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
      "Downpayment - Tuition Fee",
    ],
  );

  for (const [index, billing] of installmentBillings.entries()) {
    const nextAmount = Number(installmentAmounts[index] || 0);

    await executor.query(
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

async function getApprovedDownpayment(enrollmentId, executor = db) {
  const result = await executor.query(
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

async function logEnrollmentFieldChanges({
  client,
  enrollmentBefore,
  enrollmentAfter,
  actorName,
  nextCourses,
  nextTotalUnits,
  nextTotalAmount,
  parsedMiscFee,
  nextAdminNotes,
  nextDeclineReason,
}) {
  const beforeCourses = JSON.stringify(parseSelectedCourses(enrollmentBefore.selected_courses));
  const afterCourses = JSON.stringify(nextCourses);

  if (beforeCourses !== afterCourses) {
    await writeAuditLog(client, {
      entity_type: "enrollment",
      entity_id: enrollmentAfter.id,
      action: "enrollment_courses_updated",
      actor: actorName,
      actor_type: "admin",
      details: {
        previous_selected_courses: parseSelectedCourses(enrollmentBefore.selected_courses),
        selected_courses: nextCourses,
        total_units: nextTotalUnits,
        total_amount: Number(nextTotalAmount || 0),
      },
    });
  }

  if (Number(enrollmentBefore.misc_fee || 0) !== Number(parsedMiscFee || 0)) {
    await writeAuditLog(client, {
      entity_type: "enrollment",
      entity_id: enrollmentAfter.id,
      action: "enrollment_misc_fee_updated",
      actor: actorName,
      actor_type: "admin",
      details: {
        previous_misc_fee: Number(enrollmentBefore.misc_fee || 0),
        misc_fee: Number(parsedMiscFee || 0),
      },
    });
  }

  if (String(enrollmentBefore.status || "") !== String(enrollmentAfter.status || "")) {
    await writeAuditLog(client, {
      entity_type: "enrollment",
      entity_id: enrollmentAfter.id,
      action: "enrollment_status_updated",
      actor: actorName,
      actor_type: "admin",
      details: {
        previous_status: enrollmentBefore.status || null,
        status: enrollmentAfter.status || null,
      },
    });
  }

  if (String(enrollmentBefore.admin_notes || "") !== String(nextAdminNotes || "")) {
    await writeAuditLog(client, {
      entity_type: "enrollment",
      entity_id: enrollmentAfter.id,
      action: "enrollment_admin_notes_updated",
      actor: actorName,
      actor_type: "admin",
      details: {
        previous_admin_notes: enrollmentBefore.admin_notes || null,
        admin_notes: nextAdminNotes || null,
      },
    });
  }

  if (String(enrollmentBefore.decline_reason || "") !== String(nextDeclineReason || "")) {
    await writeAuditLog(client, {
      entity_type: "enrollment",
      entity_id: enrollmentAfter.id,
      action: "enrollment_decline_reason_updated",
      actor: actorName,
      actor_type: "admin",
      details: {
        previous_decline_reason: enrollmentBefore.decline_reason || null,
        decline_reason: nextDeclineReason || null,
      },
    });
  }
}

function ordinalLabel(value) {
  switch (value) {
    case 1:
      return "1st";
    case 2:
      return "2nd";
    case 3:
      return "3rd";
    case 4:
      return "4th";
    default:
      return `${value}th`;
  }
}

function formatMoney(value) {
  return `PHP ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildApprovalEmail({
  enrollment,
  student,
  generatedPassword,
  approvedDownpayment,
  isReturningStudent,
}) {
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
  const tuition = Number(total_amount || 0) + 300;
  const miscFee = Number(enrollment.misc_fee || 0);
  const totalFees = tuition + miscFee;
  const paidAmount = Number(
    approvedDownpayment?.amount_paid || approvedDownpayment?.amount || 0,
  );

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

  const loginBlock = isReturningStudent
    ? `
      <hr style="margin:20px 0;border:none;border-top:1px solid #d1d5db;" />
      <h3 style="margin-bottom:8px;">Student Portal</h3>
      <p><strong>Official Student Number:</strong> ${student.student_number || student.id}</p>
      <p><strong>Username:</strong> ${email}</p>
      <p>Your existing student portal password is still active.</p>
    `
    : `
      <hr style="margin:20px 0;border:none;border-top:1px solid #d1d5db;" />
      <h3 style="margin-bottom:8px;">Student Portal Login</h3>
      <p><strong>Official Student Number:</strong> ${student.student_number || student.id}</p>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Password:</strong> ${generatedPassword}</p>
      <p>Please keep your login details secure.</p>
    `;

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.45;">
      <h2 style="margin:0 0 12px;color:#14532d;">Enrollment Approved</h2>
      <p>Good day <strong>${first_name} ${last_name}</strong>,</p>
      <p>Your enrollment has been approved. Below is your registration and assessment summary.</p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
        <tr>
          <td><strong>Name:</strong> ${last_name}, ${first_name} ${middle_name || ""}</td>
          <td><strong>Student Number:</strong> ${student.student_number || student.id}</td>
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
        <tr><td style="padding:4px 10px;border-top:1px solid #cbd5e1;"><strong>Total Fees:</strong></td><td style="padding:4px 10px;border-top:1px solid #cbd5e1;text-align:right;"><strong>${formatMoney(totalFees)}</strong></td></tr>
        <tr><td style="padding:4px 10px;"><strong>Payment:</strong></td><td style="padding:4px 10px;text-align:right;">${formatMoney(paidAmount)}</td></tr>
      </table>

      ${loginBlock}
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
  const tuition = Number(total_amount || 0) + 300;
  const miscFee = Number(enrollment.misc_fee || 0);
  const totalFees = tuition + miscFee;
  const payment = Number(approvedDownpayment?.amount_paid || approvedDownpayment?.amount || 0);
  const balance = Math.max(totalFees - payment, 0);
  const studentName = `${last_name || ""}, ${first_name || ""} ${middle_name || ""}`.trim();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 34,
      info: {
        Title: `COR ${student.student_number || student.id || ""}`.trim(),
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
      "Student Number",
      String(student.student_number || student.id || "-"),
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
          "2. Registration, other fees, and miscellaneous fees are non-refundable.\n" +
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
    width,
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
