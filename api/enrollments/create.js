const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const MISC_FEE = 1500;
const ID_FEE = 300;
const DOWNPAYMENT_AMOUNT = 2000;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

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
      year_level,
      semester,
      selected_courses,
      total_units,
      total_amount,
      idpic_url,
      documents,
    } = body;

    // ✅ Debug log (formatted)
    if (documents) {
      console.log("Documents {");
      Object.entries(documents).forEach(([category, file]) => {
        console.log(`  ${category}: ${file}`);
      });
      console.log("}");
    }

    // ✅ Validation
    if (
      !last_name ||
      !first_name ||
      !email ||
      !program_id ||
      !year_level ||
      !semester
    ) {
      return badRequest(res, "Missing required fields");
    }

    if (!Array.isArray(selected_courses) || selected_courses.length === 0) {
      return badRequest(res, "Please select at least one course");
    }

    const mobileNumberColumn = await db.query(
      `
      select 1
      from information_schema.columns
      where table_name = 'enrollments'
        and column_name = 'mobile_number'
      limit 1
      `,
    );

    const hasMobileNumberColumn = mobileNumberColumn.rows.length > 0;

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

    if (hasMobileNumberColumn) {
      columns.push("mobile_number");
      values.push(mobile);
    }

    columns.push(
      "program_id",
      "program_name",
      "program_code",
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
      year_level,
      semester,
      JSON.stringify(selected_courses),
      Number(total_units || 0),
      Number(total_amount || 0).toFixed(2),
      "Pending",
    );

    const idPictureColumn = await db.query(
      `
      select 1
      from information_schema.columns
      where table_name = 'enrollments'
        and column_name = 'idpic_url'
      limit 1
      `,
    );

    if (idPictureColumn.rows.length > 0) {
      columns.push("idpic_url");
      values.push(idpic_url || null);
    }

    const placeholders = values.map((_, index) => {
      const value = values[index];
      return Array.isArray(value) || typeof value === "object"
        ? `$${index + 1}::jsonb`
        : `$${index + 1}`;
    });

    if (columns.includes("selected_courses")) {
      const selectedCourseIndex = columns.indexOf("selected_courses");
      placeholders[selectedCourseIndex] = `$${selectedCourseIndex + 1}::jsonb`;
    }

    // ✅ Insert enrollment
    const returningColumns = [
      "id",
      "last_name",
      "first_name",
      "middle_name",
      "email",
      "mobile",
      "program_name",
      "program_code",
      "year_level",
      "semester",
      "selected_courses",
      "total_units",
      "total_amount",
      "created_at",
    ];

    if (idPictureColumn.rows.length > 0) {
      returningColumns.splice(returningColumns.length - 1, 0, "idpic_url");
    }

    const result = await db.query(
      `insert into enrollments 
      (${columns.join(", ")})
      values (${placeholders.join(", ")})
      returning ${returningColumns.join(", ")}`,
      values,
    );

    const enrollment = {
      ...result.rows[0],
      idpic_url:
        idPictureColumn.rows.length > 0 ? result.rows[0]?.idpic_url || null : null,
    };

    await createInstallmentBillings({
      enrollment,
      first_name,
      last_name,
      email,
      courseAmount: Number(total_amount || 0),
    });

    // ✅ Insert documents (category + type)
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

        await db.query(
          `insert into documents (enrollment_id, user_full_name, name, description, category, type)
           values ($1,$2,$3,$4,$5,$6)`,
          [
            enrollment.id,
            `${last_name} ${first_name}`,
            fileName,
            fileUrl,
            "Requirements",  // default type
            type,        // form137, idpic, psa, etc.
          ]
        );
      }
    }

    return okay(res, enrollment);
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
}) {
  const studentName = `${first_name} ${last_name}`.trim();
  const totalAssessment = Number(courseAmount || 0) + MISC_FEE + ID_FEE;
  const downpayment = Math.min(DOWNPAYMENT_AMOUNT, totalAssessment);
  const remainingBalance = Math.max(totalAssessment - downpayment, 0);
  const baseInstallment = Number((remainingBalance / 4).toFixed(2));
  const installments = [];

  for (let index = 0; index < 4; index += 1) {
    if (index < 3) {
      installments.push(baseInstallment);
      continue;
    }

    const allocated = installments.reduce((sum, amount) => sum + amount, 0);
    installments.push(Number((remainingBalance - allocated).toFixed(2)));
  }

  const billingItems = [
    {
      description: `Downpayment - Tuition and Fees (Course Fee: PHP ${courseAmount.toFixed(
        2,
      )}, Misc Fee: PHP ${MISC_FEE.toFixed(2)}, ID Fee: PHP ${ID_FEE.toFixed(2)})`,
      amount: downpayment,
    },
    ...installments.map((amount, index) => ({
      description: `${ordinalLabel(index + 1)} Payment Installment`,
      amount,
    })),
  ].filter((item) => Number(item.amount || 0) > 0);

  for (const item of billingItems) {
    await db.query(
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
