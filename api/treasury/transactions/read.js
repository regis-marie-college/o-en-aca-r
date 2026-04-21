const { okay, notAllowed, badRequest } = require("../../../lib/response");
const db = require("../../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { id } = req.query;

  if (!id) {
    return badRequest(res, "id is required");
  }

  try {
    const result = await db.query(
      `
      select *
      from treasury_transactions
      where id = $1
      limit 1
      `,
      [id],
    );

    return okay(res, result.rows[0] || null);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
