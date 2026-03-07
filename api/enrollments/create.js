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
      mobile,
      birthday,
      documents,
    } = body;

    if (!last_name || !first_name || !email) {
      return badRequest(res, "Missing required fields");
    }

    // Insert enrollment
    const result = await db.query(
      `insert into enrollments 
      (last_name, first_name, middle_name, email, mobile_number, birthday)
      values ($1,$2,$3,$4,$5,$6)
      returning id, last_name, first_name, middle_name, email, mobile_number, created_at`,
      [last_name, first_name, middle_name, email, mobile, birthday],
    );

    const enrollment = result.rows[0];

    // Insert documents
    if (documents && documents.length > 0) {
      for (const fileName of documents) {
        await db.query(
          `insert into documents (enrollment_id, user_full_name, name, type)
           values ($1,$2,$3,$4)`,
          [enrollment.id, `${last_name} ${first_name}`, fileName, "Requirements"],
        );
      }
    }

    return okay(res, enrollment);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
