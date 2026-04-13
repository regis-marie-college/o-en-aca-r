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
      name,
      description,
      program_id,
      program_name,
      program_code,
      year_level,
      units,
      semester,
    } = body;

    const unitsValue = Number(units);

    // Basic validation
    if (
      !name ||
      !program_id ||
      !program_name ||
      !year_level ||
      !Number.isInteger(unitsValue) ||
      unitsValue < 1 ||
      !semester
    ) {
      return badRequest(res, "Missing required fields");
    }

    const result = await db.query(
      `insert into courses (name, description, program_id, program_name, program_code, year_level, units, semester, status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,'active')
      returning id, name, description, program_id, program_name, program_code, year_level, units, semester, status, created_at
      `,
      [
        name,
        description,
        program_id,
        program_name,
        program_code,
        year_level,
        unitsValue,
        semester,
      ],
    );

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
