const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

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
    const result = await db.query(
      `insert into enrollments 
      (${columns.join(", ")})
      values (${placeholders.join(", ")})
      returning id, last_name, first_name, middle_name, email, mobile, program_name, program_code, year_level, semester, selected_courses, total_units, total_amount, created_at`,
      values,
    );

    const enrollment = result.rows[0];

    // ✅ Insert documents (category + type)
    if (documents && Object.keys(documents).length > 0) {
      for (const [type, fileName] of Object.entries(documents)) {
        await db.query(
          `insert into documents (enrollment_id, user_full_name, name, category, type)
           values ($1,$2,$3,$4,$5)`,
          [
            enrollment.id,
            `${last_name} ${first_name}`,
            fileName,
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
