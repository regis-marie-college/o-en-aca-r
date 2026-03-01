const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { id } = req.query;

  try {
    const result = await db.query(`select * from users where id = $1`, [id]);

    let auth = result.rows.length > 0;

    return okay(res, { auth });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
