const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
//edit ko muna to
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { enrollment_id } = req.query;

  try {
    const result = await db.query(
      `SELECT * FROM documents WHERE enrollment_id = $1`,
      [enrollment_id],
    );

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
