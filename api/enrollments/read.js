const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
//edit ko muna to
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { id } = req.query;

  try {
    const result = await db.query(`SELECT * FROM enrollments WHERE id = $1`, [id]);

    return okay(res, result.rows[0]);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
