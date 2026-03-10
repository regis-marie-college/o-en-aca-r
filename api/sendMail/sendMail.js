require("dotenv").config();
const nodemailer = require("nodemailer");

async function sendEmail(to, subject, message) {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });

  const info = await transporter.sendMail({
    from: `"Regis Marie College" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    html: message
  });

  console.log("Email sent:", info.messageId);
}

module.exports = sendEmail;