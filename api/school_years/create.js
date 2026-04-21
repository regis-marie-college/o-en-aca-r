const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

function normalizeSchoolYear(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})\s*-\s*(\d{4})$/);

  if (!match) {
    throw new Error("School year must use the format YYYY-YYYY");
  }

  const startYear = Number(match[1]);
  const endYear = Number(match[2]);

  if (endYear !== startYear + 1) {
    throw new Error("School year must be consecutive, for example 2026-2027");
  }

  return `${startYear}-${endYear}`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const schoolYear = normalizeSchoolYear(body.name || body.school_year);
    const isActive = Boolean(body.is_active);

    await db.query("begin");

    if (isActive) {
      await db.query(`
        update school_years
        set is_active = false,
            updated_at = now()
      `);
    }

    const result = await db.query(
      `
      insert into school_years (name, is_active, updated_at)
      values ($1, $2, now())
      on conflict (name)
      do update set
        is_active = excluded.is_active,
        updated_at = now()
      returning *
      `,
      [schoolYear, isActive],
    );

    await db.query("commit");

    return okay(res, result.rows[0]);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    console.error(err);
    return badRequest(res, err.message);
  }
};
