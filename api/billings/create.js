const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const DOWNPAYMENT_AMOUNT = 2000;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury"]);
  if (!auth) {
    return;
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

  const billingItems = buildInstallmentBillings({
    description,
    totalAmount,
  });
  const createdBillings = [];

  for (const item of billingItems) {
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
        item.description,
        Number(item.amount).toFixed(2),
        due_date || null,
        created_by || null,
      ],
    );

    createdBillings.push(result.rows[0]);
  }

  return {
    total_amount: totalAmount,
    downpayment: billingItems[0]?.amount || 0,
    installments: billingItems,
    records: createdBillings,
  };
}

function buildInstallmentBillings({ description, totalAmount }) {
  const cleanDescription = String(description || "").trim();
  const downpayment = Math.min(DOWNPAYMENT_AMOUNT, totalAmount);
  const remainingBalance = Math.max(totalAmount - downpayment, 0);
  const installmentCount = 4;
  const baseInstallment = Number((remainingBalance / installmentCount).toFixed(2));
  const installments = [];

  for (let index = 0; index < installmentCount; index += 1) {
    if (index < installmentCount - 1) {
      installments.push(baseInstallment);
      continue;
    }

    const allocated = installments.reduce((sum, item) => sum + item, 0);
    installments.push(Number((remainingBalance - allocated).toFixed(2)));
  }

  return [
    {
      description: `Downpayment - ${cleanDescription}`,
      amount: Number(downpayment.toFixed(2)),
    },
    ...installments.map((installment, index) => ({
      description: `${ordinalLabel(index + 1)} Payment - ${cleanDescription}`,
      amount: Number(installment.toFixed(2)),
    })),
  ].filter((item) => Number(item.amount || 0) > 0);
}

function ordinalLabel(value) {
  switch (value) {
    case 1:
      return "1st";
    case 2:
      return "2nd";
    case 3:
      return "3rd";
    case 4:
      return "4th";
    default:
      return `${value}th`;
  }
}

module.exports.createBilling = createBilling;
