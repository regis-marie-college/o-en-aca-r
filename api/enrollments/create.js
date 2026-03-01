const db = require("../services/supabase");

exports.createEnrollment = async (req, res) => {
  try {
    const {
      last_name,
      first_name,
      middle_name,
      email,
      mobile_number,
      birthday
    } = req.body;

    // Basic Validation
    if (!last_name || !first_name || !email || !mobile_number || !birthday) {
      return res.status(400).json({
        message: "All required fields must be filled"
      });
    }

    // Optional: Philippine mobile validation (server-side)
    const mobileRegex = /^09\d{9}$/;
    if (!mobileRegex.test(mobile_number)) {
      return res.status(400).json({
        message: "Invalid mobile number format"
      });
    }

    const result = await db.query(
      `
      INSERT INTO enrollments
      (last_name, first_name, middle_name, email, mobile_number, birthday)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
      `,
      [
        last_name,
        first_name,
        middle_name || null,
        email,
        mobile_number,
        birthday
      ]
    );

    res.status(201).json({
      message: "Enrollment submitted successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server error"
    });
  }
};