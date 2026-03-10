const sendEmail = require("./sendMail");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("Method Not Allowed");
  }

  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const { email, subject, message } = JSON.parse(body);

      await sendEmail(email, subject, message);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));

    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
};