const { okay, badRequest, notAllowed } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  try {
    const result = await db.query(`
      select *
      from school_years
      order by name desc
    `);

    return okay(res, result.rows);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
