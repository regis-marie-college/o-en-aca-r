const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
//edit ko muna to
module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  try {
    const result = await db.query(`SELECT * FROM enrollments`);

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
