<<<<<<< HEAD
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
=======
const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const {
      last_name,
      first_name,
      middle_name,
      email,
      mobile_number,
      birthday,
    } = body;

    // Basic validation
    if (!last_name || !first_name || !email) {
      return badRequest(res, "Missing required fields");
    }

    const result = await db.query(
      `insert into enrollments (last_name, first_name, middle_name, email, mobile_number, birthday)
      values ($1,$2,$3,$4,$5,$6)
      returning id, last_name, first_name, middle_name, email, mobile_number, created_at
      `,
      [last_name, first_name, middle_name, email, mobile_number, birthday],
    );

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
>>>>>>> 8856700c6a4b567523758edd083b947b2ce678d7
