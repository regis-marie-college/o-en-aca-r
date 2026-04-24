const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const {
  getCompletedCourseKeys,
  getCompletedSelectedCourses,
} = require("../../lib/course-completion");
const {
  assertNoActiveEnrollmentRequest,
  calculateCourseTotals,
  isAllowedRequestType,
  normalizeRequestType,
  validateFinancialTotals,
} = require("../../lib/enrollment-rules");

const MISC_FEE = 0;
const ID_FEE = 300;
const DOWNPAYMENT_AMOUNT = 2000;
const PAYMENT_SUBMITTED_STATUS = "Payment Submitted";
const PENDING_EVALUATION_STATUS = "Pending Evaluation";
let enrollmentColumnsPromise = null;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const defaultSchoolYear = await getDefaultSchoolYear();

    const {
      last_name,
      first_name,
      middle_name,
      email,
      mobile,
      birthday,
      program_id,
      program_name,
      program_code,
      major,
      school_year,
      year_level,
      semester,
      selected_courses,
      total_units,
      total_amount,
      student_id,
      request_type,
      downpayment_amount,
      payment_plan,
      payment_channel,
      reference_no,
      proof_of_payment,
      idpic_url,
      documents,
    } = body;

    if (documents) {
      console.log("Documents {");
      Object.entries(documents).forEach(([category, file]) => {
        console.log(`  ${category}: ${file}`);
      });
      console.log("}");
    }

    if (
      !hasText(last_name) ||
      !hasText(first_name) ||
      !hasText(middle_name) ||
      !hasText(email) ||
      !hasText(mobile) ||
      !hasText(birthday) ||
      !hasText(program_id) ||
      !hasText(program_name) ||
      !hasText(program_code) ||
      !hasText(year_level) ||
      !hasText(semester)
    ) {
      return badRequest(res, "Missing required fields");
    }

    if (String(program_code || "").trim().toUpperCase() === "BSED" && !major) {
      return badRequest(res, "Please select a major for BSED");
    }

    const normalizedRequestType = normalizeRequestType(request_type);
    const isReturningStudent = normalizedRequestType === "Returning Student";
    const normalizedSelectedCourses = Array.isArray(selected_courses)
      ? selected_courses
      : [];
    const computedTotals = calculateCourseTotals(normalizedSelectedCourses);

    if (!isAllowedRequestType(normalizedRequestType)) {
      return badRequest(res, "Invalid request type");
    }

    if (!isReturningStudent && normalizedSelectedCourses.length === 0) {
      return badRequest(res, "Please select at least one course");
    }

    if (normalizedSelectedCourses.length) {
      const completedCourseKeys = await getCompletedCourseKeys(db, {
        studentId: student_id || null,
        email,
      });
      const completedSelections = getCompletedSelectedCourses(
        normalizedSelectedCourses,
        completedCourseKeys,
      );

      if (completedSelections.length) {
        return badRequest(
          res,
          `Completed courses cannot be selected again: ${completedSelections
            .map((course) => course.name || course.course_name || course.code || course.id)
            .filter(Boolean)
            .join(", ")}`,
        );
      }
    }

    const courseAmount =
      normalizedSelectedCourses.length > 0
        ? computedTotals.totalAmount
        : Number(total_amount || 0);
    const totalAssessment = courseAmount + MISC_FEE + ID_FEE;
    const submittedDownpayment = Number(downpayment_amount || 0);
    const normalizedPaymentPlan = normalizePaymentPlan(payment_plan);
    const nextTotalUnits =
      normalizedSelectedCourses.length > 0
        ? computedTotals.totalUnits
        : Number(total_units || 0);

    validateFinancialTotals({
      miscFee: 0,
      totalUnits: nextTotalUnits,
      totalAmount: courseAmount,
    });

    if (!isReturningStudent) {
      const minimumDownpayment =
        normalizedPaymentPlan === "full" ? totalAssessment : DOWNPAYMENT_AMOUNT;

      if (submittedDownpayment < minimumDownpayment) {
        return badRequest(
          res,
          normalizedPaymentPlan === "full"
            ? `Full payment must be PHP ${minimumDownpayment.toFixed(2)}`
            : `Minimum downpayment is PHP ${minimumDownpayment.toFixed(2)}`,
        );
      }

      if (submittedDownpayment > totalAssessment) {
        return badRequest(res, "Payment cannot exceed the total assessment");
      }

      if (
        normalizedPaymentPlan === "full" &&
        !isSameCurrencyAmount(submittedDownpayment, totalAssessment)
      ) {
        return badRequest(res, "Full payment must equal the total assessment");
      }

      if (!hasText(payment_channel) || !hasText(reference_no) || !hasText(proof_of_payment)) {
        return badRequest(
          res,
          "Payment channel, reference number, and proof of payment are required",
        );
      }

      if (!hasText(idpic_url)) {
        return badRequest(res, "1x1 ID picture is required");
      }
    }

    await assertNoActiveEnrollmentRequest({
      executor: db,
      email,
      studentId: student_id || null,
      schoolYear: school_year || defaultSchoolYear,
    });

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const enrollmentColumns = await getEnrollmentColumns();

      const columns = [
        "last_name",
        "first_name",
        "middle_name",
        "email",
        "mobile",
        "birthday",
      ];
      const values = [
        last_name,
        first_name,
        middle_name,
        email,
        mobile,
        birthday,
      ];

      if (enrollmentColumns.mobile_number) {
        columns.push("mobile_number");
        values.push(mobile);
      }

      if (enrollmentColumns.student_id) {
        columns.push("student_id");
        values.push(student_id || null);
      }

      if (enrollmentColumns.request_type) {
        columns.push("request_type");
        values.push(normalizedRequestType);
      }

      columns.push(
        "program_id",
        "program_name",
        "program_code",
        "major",
        "school_year",
        "year_level",
        "semester",
        "selected_courses",
        "total_units",
        "total_amount",
        "status",
      );
      values.push(
        program_id,
        program_name || null,
        program_code || null,
        major || null,
        school_year || defaultSchoolYear,
        year_level,
        semester,
        JSON.stringify(normalizedSelectedCourses),
        nextTotalUnits,
        courseAmount.toFixed(2),
        isReturningStudent ? PENDING_EVALUATION_STATUS : PAYMENT_SUBMITTED_STATUS,
      );

      if (enrollmentColumns.idpic_url) {
        columns.push("idpic_url");
        values.push(idpic_url || null);
      }

      const placeholders = values.map((_, index) => {
        const value = values[index];
        return Array.isArray(value) || typeof value === "object"
          ? `$${index + 1}::jsonb`
          : `$${index + 1}`;
      });

      const selectedCourseIndex = columns.indexOf("selected_courses");
      if (selectedCourseIndex >= 0) {
        placeholders[selectedCourseIndex] = `$${selectedCourseIndex + 1}::jsonb`;
      }

      const returningColumns = [
        "id",
        "last_name",
        "first_name",
        "middle_name",
        "email",
        "mobile",
        "program_name",
        "program_code",
        "major",
        "school_year",
        "year_level",
        "semester",
        "selected_courses",
        "total_units",
        "total_amount",
        "status",
        "created_at",
      ];

      if (enrollmentColumns.student_id) {
        returningColumns.splice(returningColumns.length - 2, 0, "student_id");
      }

      if (enrollmentColumns.request_type) {
        returningColumns.splice(returningColumns.length - 2, 0, "request_type");
      }

      if (enrollmentColumns.idpic_url) {
        returningColumns.splice(returningColumns.length - 1, 0, "idpic_url");
      }

      const result = await client.query(
        `insert into enrollments
        (${columns.join(", ")})
        values (${placeholders.join(", ")})
        returning ${returningColumns.join(", ")}`,
        values,
      );

      const enrollment = {
        ...result.rows[0],
        idpic_url:
          enrollmentColumns.idpic_url ? result.rows[0]?.idpic_url || null : null,
      };

      if (!isReturningStudent) {
        await createInstallmentBillings({
          enrollment,
          first_name,
          last_name,
          email,
          courseAmount,
          downpaymentAmount: submittedDownpayment,
          paymentPlan: normalizedPaymentPlan,
          initialPayment: {
            paymentChannel: payment_channel,
            referenceNo: reference_no,
            proofOfPayment: proof_of_payment,
          },
          executor: client,
        });
      }

      if (documents && Object.keys(documents).length > 0) {
        for (const [type, documentValue] of Object.entries(documents)) {
          const fileName =
            typeof documentValue === "object" && documentValue !== null
              ? documentValue.name
              : documentValue;
          const fileUrl =
            typeof documentValue === "object" && documentValue !== null
              ? documentValue.url || null
              : null;

          await client.query(
            `insert into documents (enrollment_id, user_full_name, name, description, category, type)
             values ($1,$2,$3,$4,$5,$6)`,
            [
              enrollment.id,
              `${last_name} ${first_name}`,
              fileName,
              fileUrl,
              "Requirements",
              type,
            ],
          );
        }
      }

      await client.query("COMMIT");
      return okay(res, enrollment);
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

async function createInstallmentBillings({
  enrollment,
  first_name,
  last_name,
  email,
  courseAmount,
  downpaymentAmount,
  paymentPlan = "installment",
  initialPayment = null,
  executor = db,
}) {
  const studentName = `${first_name} ${last_name}`.trim();
  const totalAssessment = Number(courseAmount || 0) + MISC_FEE + ID_FEE;
  const downpayment = Number(downpaymentAmount || 0);
  const isFullPayment = paymentPlan === "full";
  const tuitionAmount = Number(courseAmount || 0) + ID_FEE;
  const feeItems = [
    { description: "Miscellaneous Fee", amount: MISC_FEE },
  ].filter((item) => Number(item.amount || 0) > 0);
  const tuitionDownpayment = isFullPayment
    ? tuitionAmount
    : Math.min(downpayment, tuitionAmount);
  const remainingTuitionBalance = Math.max(tuitionAmount - tuitionDownpayment, 0);
  const installments = isFullPayment ? [] : splitAmounts(remainingTuitionBalance, 4);
  const feePaymentAllocation = Math.max(downpayment - tuitionDownpayment, 0);
  let remainingFeePaymentAllocation = isFullPayment
    ? feeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    : feePaymentAllocation;

  const billingItems = [
    {
      description: `${isFullPayment ? "Full Payment / Downpayment" : "Downpayment"} - Tuition Fee`,
      amount: tuitionDownpayment,
      submittedAmount: tuitionDownpayment,
    },
    ...installments.map((amount, index) => ({
      description: `${ordinalLabel(index + 1)} Payment Installment - Tuition Fee`,
      amount,
    })),
    ...feeItems.map((item) => {
      const submittedAmount = Math.min(remainingFeePaymentAllocation, Number(item.amount || 0));
      remainingFeePaymentAllocation = Math.max(
        remainingFeePaymentAllocation - submittedAmount,
        0,
      );

      return {
        ...item,
        submittedAmount,
      };
    }),
  ].filter((item) => Number(item.amount || 0) > 0);

  for (const item of billingItems) {
    const submittedAmount = Number(item.submittedAmount || 0);
    const hasSubmittedPayment = Boolean(initialPayment) && submittedAmount > 0;
    const paymentColumns = hasSubmittedPayment
      ? ", payment_method, payment_channel, reference_no, proof_of_payment, payment_status, pending_payment_amount"
      : "";
    const paymentValues = hasSubmittedPayment
      ? ", 'Online', $7, $8, $9, 'Submitted', $10"
      : "";
    const params = [
      enrollment.id,
      studentName,
      email,
      item.description,
      Number(item.amount).toFixed(2),
      "System Enrollment",
    ];

    if (hasSubmittedPayment) {
      params.push(
        initialPayment?.paymentChannel || null,
        initialPayment?.referenceNo || null,
        initialPayment?.proofOfPayment || null,
        submittedAmount.toFixed(2),
      );
    }

    await executor.query(
      `
      insert into billings
      (enrollment_id, student_name, email, description, amount, amount_paid, balance, due_date, status, created_by, updated_by${paymentColumns})
      values ($1,$2,$3,$4,$5,0,$5,null,'Unpaid',$6,$6${paymentValues})
      `,
      params,
    );
  }
}

async function getEnrollmentColumns() {
  if (!enrollmentColumnsPromise) {
    enrollmentColumnsPromise = db
      .query(
        `
        select column_name
        from information_schema.columns
        where table_name = 'enrollments'
          and column_name = any($1::text[])
        `,
        [["mobile_number", "student_id", "request_type", "idpic_url"]],
      )
      .then((result) => {
        const columns = new Set(result.rows.map((row) => row.column_name));

        return {
          mobile_number: columns.has("mobile_number"),
          student_id: columns.has("student_id"),
          request_type: columns.has("request_type"),
          idpic_url: columns.has("idpic_url"),
        };
      })
      .catch((error) => {
        enrollmentColumnsPromise = null;
        throw error;
      });
  }

  return enrollmentColumnsPromise;
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

function splitAmounts(total, count) {
  const safeTotal = Number(total || 0);
  const safeCount = Number(count || 0);

  if (safeTotal <= 0 || safeCount <= 0) {
    return [];
  }

  const baseAmount = Number((safeTotal / safeCount).toFixed(2));
  const amounts = [];

  for (let index = 0; index < safeCount; index += 1) {
    if (index < safeCount - 1) {
      amounts.push(baseAmount);
      continue;
    }

    const allocated = amounts.reduce((sum, amount) => sum + amount, 0);
    amounts.push(Number((safeTotal - allocated).toFixed(2)));
  }

  return amounts;
}

function getCurrentSchoolYear(date = new Date()) {
  const year = date.getFullYear();
  return `${year}-${year + 1}`;
}

async function getDefaultSchoolYear() {
  const result = await db.query(`
    select name
    from school_years
    where is_active = true
    order by updated_at desc, created_at desc
    limit 1
  `);

  return result.rows[0]?.name || getCurrentSchoolYear();
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

function normalizePaymentPlan(value) {
  const normalized = String(value || "installment").trim().toLowerCase();

  if (["full", "full_payment", "full payment", "fully paid"].includes(normalized)) {
    return "full";
  }

  return "installment";
}

function isSameCurrencyAmount(left, right) {
  return Math.round(Number(left || 0) * 100) === Math.round(Number(right || 0) * 100);
}
