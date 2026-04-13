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

    const result = await db.query(
      `UPDATE enrollments
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id],
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

    if (status === "Approved") {
      const generatedPassword = buildStudentPassword(last_name, birthday);
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

      const message = `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
          <h2 style="color:#14532d;">Enrollment Approved</h2>
          <p>Good day <strong>${first_name} ${last_name}</strong>,</p>
          <p>Your enrollment has been approved successfully. Welcome to Regis Marie College.</p>
          <p><strong>Student ID:</strong> ${student.id}</p>
          <p><strong>Registered Email:</strong> ${email}</p>
          <p><strong>Program:</strong> ${program_name || "N/A"}</p>
          <p><strong>Year Level:</strong> ${year_level || "N/A"}</p>
          <p><strong>Semester:</strong> ${semester || "N/A"}</p>
          <p><strong>Birthday:</strong> ${birthday || "N/A"}</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #d1d5db;" />
          <h3 style="margin-bottom: 8px;">Student Portal Login</h3>
          <p><strong>Username:</strong> ${email}</p>
          <p><strong>Password:</strong> ${generatedPassword}</p>
          <p>Please keep your login details secure.</p>
          <p>Thank you and congratulations.</p>
        </div>
      `;

      console.log(`Sending approval email to ${email}`);
      await sendEmail(
        email,
        "Enrollment Approved - Student Account Details",
        message,
      );
    } else if (status === "Declined") {
      const message = `
        <div style="font-family: Arial; color: #333;">
          <h2>Enrollment Declined</h2>
          <p><strong>Last Name:</strong> ${last_name}</p>
          <p><strong>First Name:</strong> ${first_name}</p>
          <p><strong>Middle Name:</strong> ${middle_name || "N/A"}</p>
          <p><strong>Birthday:</strong> ${birthday || "N/A"}</p>
          <p><strong>Reason:</strong> ${reason || "Not specified"}</p>
          <br>
          <p>We regret to inform you that your application has been declined.</p>
        </div>
      `;

      console.log(`Sending declined email to ${email}`);
      await sendEmail(email, "Enrollment Declined", message);
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
