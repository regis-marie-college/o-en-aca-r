const db = require("../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ message: "Method Not Allowed" }));
  }

  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const {
        last_name,
        first_name,
        middle_name,
        email,
        mobile_number,
        birthday
      } = JSON.parse(body);

      if (!last_name || !first_name || !email || !mobile_number || !birthday) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          message: "All required fields must be filled"
        }));
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

      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        message: "Enrollment submitted successfully",
        data: result.rows[0]
      }));

    } catch (error) {
      console.error(error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server error" }));
    }
  });
};