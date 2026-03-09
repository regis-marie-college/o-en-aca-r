const nodemailer = require("nodemailer");

async function sendEmail(to, subject, message) {

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "jymnadan0809@gmail.com",
      pass: "higt tbka xcbn efsz"
    }
  });

  let info = await transporter.sendMail({
    from: '"Regis Marie College" <jymnadan0809@gmail.com>',
    to: to,
    subject: subject,
    html: message
  });

  console.log("Email sent:", info.messageId);
}

module.exports = sendEmail;