const {
  okay,
  badRequest,
  notAllowed,
  notFound,
} = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const bcrypt = require("bcrypt");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);

    const { id } = body;

    const result = await db.query(`delete from sessions where user_id = $1`, [
      id,
    ]);

    return okay(res, { deleted: true });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
