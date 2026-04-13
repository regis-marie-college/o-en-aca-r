const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const billing = await updateBilling(body);
    return okay(res, billing);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function updateBilling(data) {
  const { id, payment_amount, payment_method, processed_by } = data;

  if (!id) {
    throw new Error("Billing ID is required");
  }

  const amountToPay = Number(payment_amount || 0);

  if (amountToPay <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const billingResult = await db.query(`select * from billings where id = $1`, [
    id,
  ]);
  const billing = billingResult.rows[0];

  if (!billing) {
    throw new Error("Billing not found");
  }

  const nextPaid = Number(billing.amount_paid || 0) + amountToPay;
  const totalAmount = Number(billing.amount || 0);
  const nextBalance = Math.max(totalAmount - nextPaid, 0);
  const nextStatus = nextBalance <= 0 ? "Paid" : "Partial";

  const updated = await db.query(
    `
    update billings
    set amount_paid = $2,
        balance = $3,
        status = $4,
        updated_by = $5,
        updated_at = now()
    where id = $1
    returning *
    `,
    [id, nextPaid.toFixed(2), nextBalance.toFixed(2), nextStatus, processed_by || null],
  );

  await db.query(
    `
    insert into treasury_transactions
    (billing_id, enrollment_id, student_name, email, reference_no, description, amount, payment_method, status, processed_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,'Paid',$9)
    `,
    [
      billing.id,
      billing.enrollment_id,
      billing.student_name,
      billing.email,
      `TXN-${Date.now()}`,
      billing.description,
      amountToPay.toFixed(2),
      payment_method || "Cash",
      processed_by || null,
    ],
  );

  return updated.rows[0];
}

module.exports.updateBilling = updateBilling;
