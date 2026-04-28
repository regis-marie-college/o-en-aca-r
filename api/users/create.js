const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const bcrypt = require("bcrypt");
const { normalizeEmail } = require("../../lib/email");
const { requireAuth } = require("../../lib/auth");
const { generateStudentNumber } = require("../../lib/student-number");
const sendEmail = require("../sendMail/sendMail");

const ALLOWED_USER_TYPES = ["super_admin", "admin", "treasury", "records", "student"];
const OPTIONAL_ENROLLMENT_COLUMNS = [
  "student_id",
  "request_type",
  "mobile_number",
  "misc_fee",
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
];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "records"]);
  if (!auth) {
    return;
  }

  try {
    const body = await bodyParser(req);
    const requestedType = String(body.type || "student").trim().toLowerCase();

    if (!ALLOWED_USER_TYPES.includes(requestedType)) {
      return badRequest(res, "Invalid user type");
    }

    if (requestedType === "super_admin") {
      return badRequest(res, "Creating another super admin is not allowed");
    }

    if (String(auth.type || "").toLowerCase() === "records" && requestedType !== "student") {
      return badRequest(res, "Records can only create student portal accounts");
    }

    const academicProfile = body.academic_profile || null;
    const shouldCreateAcademicProfile =
      requestedType === "student" && academicProfile;
    let user;

    if (shouldCreateAcademicProfile) {
      const client = await db.connect();
      let enrollment;

      try {
        await client.query("BEGIN");
        user = await createUser(
          {
            ...body,
            type: requestedType,
          },
          { executor: client },
        );
        enrollment = await createWalkInEnrollment(
          {
            user,
            body,
            academicProfile,
          },
          client,
        );

        await client.query("COMMIT");
        await notifyStudentPortalReady(user, body.password);

        return okay(res, {
          ...user,
          enrollment,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }

    user = await createUser({
      ...body,
      type: requestedType,
    });

    if (requestedType === "student") {
      await notifyStudentPortalReady(user, body.password);
    }

    return okay(res, user);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function createUser(data, options = {}) {
  const {
    last_name,
    first_name,
    middle_name,
    username,
    email,
    mobile,
    password,
    type,
    student_number,
  } = data;
  const executor = options.executor || db;
  const normalizedType = String(type || "student").trim().toLowerCase();

  if (!ALLOWED_USER_TYPES.includes(normalizedType)) {
    throw new Error("Invalid user type");
  }

  if (!last_name || !first_name || !email || !password) {
    throw new Error("Missing required fields");
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await executor.query(
    `
    select id
    from users
    where lower(email) = $1
      and deleted_at is null
    limit 1
    `,
    [normalizedEmail],
  );

  if (existingUser.rows.length) {
    throw new Error("Email is already registered");
  }

  const hash_pass = await bcrypt.hash(password, 10);
  const nextStudentNumber =
    normalizedType === "student" && !student_number
      ? await generateStudentNumber(executor)
      : student_number || null;

  const result = await executor.query(
    `insert into users
    (last_name, first_name, middle_name, username, email, mobile, password, type, student_number)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning id, student_number, last_name, first_name, middle_name, username, email, mobile, type, status, created_at, updated_at`,
    [
      last_name,
      first_name,
      middle_name || null,
      username || normalizedEmail,
      normalizedEmail,
      mobile || null,
      hash_pass,
      normalizedType,
      nextStudentNumber,
    ],
  );

  return result.rows[0];
}

async function createWalkInEnrollment({ user, body, academicProfile }, executor) {
  const selectedCourses = Array.isArray(academicProfile.selected_courses)
    ? academicProfile.selected_courses
    : [];
  const totalUnits = selectedCourses.reduce(
    (sum, course) => sum + Number(course.units || 0),
    0,
  );
  const totalAmount = selectedCourses.reduce(
    (sum, course) => sum + Number(course.amount || 0),
    0,
  );

  if (
    !academicProfile.birthday ||
    !academicProfile.program_id ||
    !academicProfile.year_level ||
    !academicProfile.semester ||
    !selectedCourses.length
  ) {
    throw new Error(
      "Birthday, program, year level, semester, and at least one course are required",
    );
  }

  const optionalColumns = await getEnrollmentOptionalColumns(executor);
  const candidateColumns = [
    "last_name",
    "first_name",
    "middle_name",
    "email",
    "mobile",
    "birthday",
    "status",
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
  ];
  const candidateValues = [
    body.last_name,
    body.first_name,
    body.middle_name || null,
    user.email,
    body.mobile || "",
    academicProfile.birthday,
    "Approved",
    academicProfile.program_id,
    academicProfile.program_name || null,
    academicProfile.program_code || null,
    academicProfile.major || null,
    academicProfile.school_year || getCurrentSchoolYear(),
    academicProfile.year_level,
    academicProfile.semester,
    JSON.stringify(selectedCourses),
    totalUnits,
    totalAmount.toFixed(2),
  ];
  const requiredBaseColumns = new Set([
    "last_name",
    "first_name",
    "middle_name",
    "email",
    "mobile",
    "birthday",
    "status",
  ]);
  const columns = [];
  const values = [];

  candidateColumns.forEach((column, index) => {
    if (requiredBaseColumns.has(column) || optionalColumns.has(column)) {
      columns.push(column);
      values.push(candidateValues[index]);
    }
  });

  if (!optionalColumns.has("selected_courses")) {
    throw new Error("Enrollment academic columns are not ready. Please run migrations first.");
  }

  if (optionalColumns.has("student_id")) {
    columns.push("student_id");
    values.push(user.student_number || user.id);
  }

  if (optionalColumns.has("request_type")) {
    columns.push("request_type");
    values.push("Walk-in Student");
  }

  if (optionalColumns.has("mobile_number")) {
    columns.push("mobile_number");
    values.push(body.mobile || "");
  }

  if (optionalColumns.has("misc_fee")) {
    columns.push("misc_fee");
    values.push("0.00");
  }

  const placeholders = values.map((_, index) => `$${index + 1}`);
  const selectedCourseIndex = columns.indexOf("selected_courses");

  if (selectedCourseIndex >= 0) {
    placeholders[selectedCourseIndex] = `$${selectedCourseIndex + 1}::jsonb`;
  }

  const result = await executor.query(
    `
    insert into enrollments
    (${columns.join(", ")})
    values (${placeholders.join(", ")})
    returning *
    `,
    values,
  );

  return result.rows[0];
}

async function getEnrollmentOptionalColumns(executor) {
  const result = await executor.query(
    `
    select column_name
    from information_schema.columns
    where table_name = 'enrollments'
      and column_name = any($1::text[])
    `,
    [OPTIONAL_ENROLLMENT_COLUMNS],
  );

  return new Set(result.rows.map((row) => row.column_name));
}

function getCurrentSchoolYear(date = new Date()) {
  const year = date.getFullYear();
  return `${year}-${year + 1}`;
}

async function notifyStudentPortalReady(user, password) {
  if (!user?.email || String(user.type || "").toLowerCase() !== "student") {
    return;
  }

  const studentName = [user.first_name, user.middle_name, user.last_name]
    .filter(Boolean)
    .join(" ");
  const subject = "Student Portal Account Ready - Login Details";
  const message = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;color:#14532d;">Student Portal Login</h2>
      <p>Good day <strong>${escapeHtml(studentName || "Student")}</strong>,</p>
      <p>Your account on the student portal is ready to use. You may now log in using the credentials below.</p>
      <p><strong>Student Number:</strong> ${escapeHtml(user.student_number || user.id || "-")}</p>
      <p><strong>Username:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>Password:</strong> ${escapeHtml(password || "Use the password provided by the Records Office")}</p>
      <p>Please keep your login details secure.</p>
      <p>Regis Marie College</p>
    </div>
  `;

  try {
    await sendEmail(user.email, subject, message);
  } catch (error) {
    console.error("[StudentPortalReadyEmail]", error.message);
  }
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

// export reusable function
module.exports.createUser = createUser;
