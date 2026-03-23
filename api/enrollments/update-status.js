const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { createUser } = require("../users/create");
const sendEmail = require("../sendMail/sendMail");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const {
      id,
      status,
      last_name,
      first_name,
      middle_name,
      birthday,
      email,
      password,
      reason // for declined
    } = body;

    console.log("Enrollment details:");
    console.log(body);

    // Validation
    if (!status || !id) {
      return badRequest(res, "Missing required fields");
    }

    // Update enrollment status
    const result = await db.query(
      `UPDATE enrollments
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (status === "Approved") {

      const student = await createUser({
        last_name,
        first_name,
        email,
        password: "password",
        type: "student",
      });

      console.log("Student Details:");
      console.log(student);

      const message = `
        <div style="font-family: Arial; color: #333;">
          <h2>Enrollment Approved ✅</h2>

          <p><strong>Last Name:</strong> ${last_name}</p>
          <p><strong>First Name:</strong> ${first_name}</p>
          <p><strong>Middle Name:</strong> ${middle_name || "N/A"}</p>
          <p><strong>Birthday:</strong> ${birthday || "N/A"}</p>

          <p><strong>Student ID:</strong> ${student.id}</p>

          <br>
          <p>Your enrollment has been successfully approved.</p>
          <p>Welcome to Regis Marie College!</p>
        </div>
      `;

      await sendEmail(email, "Enrollment Approved", message);

    }
    else if (status === "Declined") {

      const message = `
        <div style="font-family: Arial; color: #333;">
          <h2>Enrollment Declined ❌</h2>

          <p><strong>Last Name:</strong> ${last_name}</p>
          <p><strong>First Name:</strong> ${first_name}</p>
          <p><strong>Middle Name:</strong> ${middle_name || "N/A"}</p>
          <p><strong>Birthday:</strong> ${birthday || "N/A"}</p>

          <p><strong>Reason:</strong> ${reason || "Not specified"}</p>

          <br>
          <p>We regret to inform you that your application has been declined.</p>
        </div>
      `;

      await sendEmail(email, "Enrollment Declined", message);
    }

    return okay(res, result.rows[0]);

  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};