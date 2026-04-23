const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { updateBilling } = require("./update");

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      return notAllowed(res);
    }

    const auth = await requireAuth(req, res);
    if (!auth) {
      return;
    }

    const body = await bodyParser(req);
    const result = await payFullRemainingBalance(body, auth);
    return okay(res, result);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function payFullRemainingBalance(data, auth) {
  const {
    billing_ids,
    payment_method,
    payment_channel,
    reference_no,
    proof_of_payment,
    processed_by,
  } = data;
  const billingIds = Array.isArray(billing_ids)
    ? billing_ids.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  if (!billingIds.length) {
    throw new Error("At least one billing item is required");
  }

  const billingsResult = await db.query(
    `
    select *
    from billings
    where id = any($1::uuid[])
      and coalesce(balance, 0) > 0
      and lower(coalesce(payment_status, '')) <> 'submitted'
    order by created_at asc
    `,
    [billingIds],
  );
  const billings = billingsResult.rows;

  if (!billings.length) {
    throw new Error("No payable billing balance found");
  }

  const normalizedRole = String(auth.type || "").trim().toLowerCase();
  const isPrivileged = ["admin", "treasury", "records"].includes(normalizedRole);
  const authEmail = String(auth.email || "").trim().toLowerCase();

  if (
    !isPrivileged &&
    billings.some((billing) => String(billing.email || "").trim().toLowerCase() !== authEmail)
  ) {
    throw new Error("You are not allowed to pay these billings");
  }

  const totalAmount = billings.reduce(
    (sum, billing) => sum + Number(billing.balance || 0),
    0,
  );
  const updatedBillings = [];

  for (const billing of billings) {
    const updated = await updateBilling({
      id: billing.id,
      payment_amount: Number(billing.balance || 0).toFixed(2),
      payment_method,
      payment_channel,
      reference_no,
      proof_of_payment,
      processed_by: processed_by || auth.email || auth.id || "Student",
    });

    updatedBillings.push(updated);
  }

  return {
    total_amount: Number(totalAmount || 0).toFixed(2),
    billings: updatedBillings,
  };
}

module.exports.payFullRemainingBalance = payFullRemainingBalance;
