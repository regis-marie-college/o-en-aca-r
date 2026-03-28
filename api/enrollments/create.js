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

    // ✅ Debug log (formatted)
    if (documents) {
      console.log("Documents {");
      Object.entries(documents).forEach(([category, file]) => {
        console.log(`  ${category}: ${file}`);
      });
      console.log("}");
    }

    // ✅ Validation
    if (!last_name || !first_name || !email) {
      return badRequest(res, "Missing required fields");
    }

    // ✅ Insert enrollment
    const result = await db.query(
      `insert into enrollments 
      (last_name, first_name, middle_name, email, mobile_number, birthday, status)
      values ($1,$2,$3,$4,$5,$6,'Pending')
      returning id, last_name, first_name, middle_name, email, mobile_number, created_at`,
      [last_name, first_name, middle_name, email, mobile, birthday]
    );

    const enrollment = result.rows[0];

    // ✅ Insert documents (category + type)
    if (documents && Object.keys(documents).length > 0) {
      for (const [type, fileName] of Object.entries(documents)) {
        await db.query(
          `insert into documents (enrollment_id, user_full_name, name, category, type)
           values ($1,$2,$3,$4,$5)`,
          [
            enrollment.id,
            `${last_name} ${first_name}`,
            fileName,
            "Requirements",  // default type
            type,        // form137, idpic, psa, etc.
          ]
        );
      }
    }

    return okay(res, enrollment);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};