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
    console.log("Documents {");

    Object.values(documents || {}).forEach(file => {
      console.log(" ", file);
    });
    
    console.log("}");

    // Insert enrollment
    const result = await db.query(
      `insert into enrollments 
      (last_name, first_name, middle_name, email, mobile_number, birthday, status)
      values ($1,$2,$3,$4,$5,$6, 'Pending')
      returning id, last_name, first_name, middle_name, email, mobile_number, created_at`,
      [last_name, first_name, middle_name, email, mobile, birthday],
    );

    const enrollment = result.rows[0];

    // Insert documents
    if (documents && Object.keys(documents).length > 0) {
      const files = Object.values(documents);
    
      for (const fileName of files) {
        await db.query(
          `insert into documents (enrollment_id, user_full_name, name, type)
           values ($1,$2,$3,$4)`,
          [
            enrollment.id,
            `${last_name} ${first_name}`,
            fileName,
            "Requirements",
          ],
        );
      }
    }

    return okay(res, enrollment);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
