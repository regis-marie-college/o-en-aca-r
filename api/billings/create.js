const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const billing = await createBilling(body);
    return okay(res, billing);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function createBilling(data) {
  const {
    enrollment_id,
    student_name,
    email,
    description,
    amount,
    due_date,
    created_by,
  } = data;

  const totalAmount = Number(amount || 0);

  if (!student_name || !email || !description || totalAmount <= 0) {
    throw new Error("Missing required billing fields");
  }

  const result = await db.query(
    `
    insert into billings
    (enrollment_id, student_name, email, description, amount, amount_paid, balance, due_date, status, created_by, updated_by)
    values ($1,$2,$3,$4,$5,0,$5,$6,'Unpaid',$7,$7)
    returning *
    `,
    [
      enrollment_id || null,
      student_name,
      email,
      description,
      totalAmount.toFixed(2),
      due_date || null,
      created_by || null,
    ],
  );

  return result.rows[0];
}

module.exports.createBilling = createBilling;
