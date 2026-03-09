const express = require("express");
const sendEmail = require("./sendMail");

const router = express.Router();

router.post("/send-email", async (req, res) => {

  const { email, subject, message } = req.body;

  try {

    await sendEmail(email, subject, message);

    res.json({
      success: true,
      message: "Email sent successfully"
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      error: error.message
    });

  }

});

module.exports = router;