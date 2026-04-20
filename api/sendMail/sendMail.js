require("dotenv").config();
const nodemailer = require("nodemailer");

async function sendEmail(to, subject, message, attachments = []) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
    throw new Error("Missing Gmail SMTP credentials in environment variables");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"Regis Marie College" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: subject,
    text: stripHtml(message),
    html: message,
    attachments,
  });

  console.log("Email sent:", info.messageId);
  return info;
}

module.exports = sendEmail;

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
