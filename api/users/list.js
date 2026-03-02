const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { type } = req.query;
  let result = { rows: [] };

  try {
    if (type) {
      result = await db.query(`select * from users where type=$1`, [type]);
    } else {
      result = await db.query(`select * from users`);
    }

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
