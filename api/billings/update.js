const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { writeAuditLog } = require("../../lib/audit-log");
const { generateReceiptNo } = require("../../lib/receipt-number");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res);
  if (!auth) {
    return;
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
  const {
    id,
    payment_amount,
    payment_method,
    payment_channel,
    reference_no,
    proof_of_payment,
    payment_status,
    notes,
    processed_by,
    treasury_reviewed_by,
  } = data;
  const normalizedPaymentMethod = String(payment_method || "").trim().toLowerCase();
  const normalizedPaymentStatus = String(payment_status || "").trim().toLowerCase();

  if (!id) {
    throw new Error("Billing ID is required");
  }

  const billing = await getBillingById(id);

  if (!billing) {
    throw new Error("Billing not found");
  }

  if (
    normalizedPaymentMethod === "online" &&
    normalizedPaymentStatus !== "approved" &&
    normalizedPaymentStatus !== "denied" &&
    normalizedPaymentStatus !== "rejected"
  ) {
    return submitOnlinePayment({
      billing,
      payment_amount,
      payment_channel,
      reference_no,
      proof_of_payment,
      processed_by,
    });
  }

  if (
    normalizedPaymentStatus === "approved" ||
    normalizedPaymentStatus === "denied" ||
    normalizedPaymentStatus === "rejected"
  ) {
    return reviewOnlinePayment({
      billing,
      payment_status:
        normalizedPaymentStatus === "approved" ? "Approved" : "Denied",
      notes,
      processed_by,
      treasury_reviewed_by,
    });
  }

  return applyDirectPayment({
    billing,
    payment_amount,
    payment_method,
    processed_by,
  });
}

async function getBillingById(id) {
  const billingResult = await db.query(`select * from billings where id = $1`, [id]);
  return billingResult.rows[0] || null;
}

function validatePaymentAmount(amount, balance) {
  const amountToPay = Number(amount || 0);
  const currentBalance = Number(balance || 0);

  if (currentBalance <= 0) {
    throw new Error("Billing is already fully paid");
  }

  if (amountToPay <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  if (amountToPay > currentBalance) {
    throw new Error("Payment amount exceeds the remaining balance");
  }

  return amountToPay;
}

async function submitOnlinePayment({
  billing,
  payment_amount,
  payment_channel,
  reference_no,
  proof_of_payment,
  processed_by,
}) {
  const amountToPay = validatePaymentAmount(payment_amount, billing.balance);

  if (!payment_channel) {
    throw new Error("Payment channel is required for online payment");
  }

  if (!reference_no) {
    throw new Error("Reference number is required for online payment");
  }

  if (!proof_of_payment) {
    throw new Error("Proof of payment is required for online payment");
  }

  const updated = await db.query(
    `
    update billings
    set payment_method = 'Online',
        payment_channel = $2,
        reference_no = $3,
        proof_of_payment = $4,
        pending_payment_amount = $5,
        payment_status = 'Submitted',
        updated_by = $6,
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      billing.id,
      payment_channel,
      reference_no,
      proof_of_payment,
      amountToPay.toFixed(2),
      processed_by || null,
    ],
  );

  await writeAuditLog(db, {
    entity_type: "billing",
    entity_id: billing.id,
    action: "payment_submitted",
    actor: processed_by || billing.email || null,
    actor_type: "treasury",
    details: {
      payment_channel,
      reference_no,
      pending_payment_amount: amountToPay.toFixed(2),
      enrollment_id: billing.enrollment_id || null,
    },
  });

  return updated.rows[0];
}

async function reviewOnlinePayment({
  billing,
  payment_status,
  notes,
  processed_by,
  treasury_reviewed_by,
}) {
  if (String(billing.payment_method || "").trim().toLowerCase() !== "online") {
    throw new Error("Only online payment submissions can be reviewed here");
  }

  if (String(billing.payment_status || "").trim().toLowerCase() !== "submitted") {
    throw new Error("This billing has no submitted online payment to review");
  }

  const reviewer = treasury_reviewed_by || processed_by || null;
  const reviewNotes = String(notes || "").trim() || null;

  if (payment_status === "Denied" && !reviewNotes) {
    throw new Error("Treasury note is required when denying a payment");
  }

  if (payment_status === "Denied") {
    const denied = await db.query(
      `
      update billings
      set payment_status = 'Denied',
          treasury_reviewed_by = $2,
          notes = $3,
          updated_by = $4,
          updated_at = now()
      where id = $1
      returning *
      `,
      [billing.id, reviewer, reviewNotes, processed_by || null],
    );

    await syncEnrollmentPaymentStatus(denied.rows[0]);
    await writeAuditLog(db, {
      entity_type: "billing",
      entity_id: billing.id,
      action: "payment_denied",
      actor: reviewer || processed_by || null,
      actor_type: "treasury",
      details: {
        notes: reviewNotes,
        enrollment_id: billing.enrollment_id || null,
      },
    });

    return denied.rows[0];
  }

  const amountToPay = validatePaymentAmount(
    billing.pending_payment_amount,
    billing.balance,
  );
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
        payment_status = 'Approved',
        pending_payment_amount = 0,
        treasury_reviewed_by = $5,
        notes = $6,
        updated_by = $7,
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      billing.id,
      nextPaid.toFixed(2),
      nextBalance.toFixed(2),
      nextStatus,
      reviewer,
      reviewNotes,
      processed_by || null,
    ],
  );

  await insertTransaction({
    billing,
    amount: amountToPay,
    payment_method: "Online",
    processed_by,
    reference_no: billing.reference_no,
  });

  await syncEnrollmentPaymentStatus(updated.rows[0]);
  await writeAuditLog(db, {
    entity_type: "billing",
    entity_id: billing.id,
    action: "payment_approved",
    actor: reviewer || processed_by || null,
    actor_type: "treasury",
    details: {
      amount_paid: amountToPay.toFixed(2),
      status: nextStatus,
      enrollment_id: billing.enrollment_id || null,
      notes: reviewNotes,
    },
  });

  return updated.rows[0];
}

async function applyDirectPayment({
  billing,
  payment_amount,
  payment_method,
  processed_by,
}) {
  const amountToPay = validatePaymentAmount(payment_amount, billing.balance);
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
        payment_method = $5,
        payment_channel = null,
        reference_no = null,
        proof_of_payment = null,
        payment_status = 'Approved',
        pending_payment_amount = 0,
        updated_by = $6,
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      billing.id,
      nextPaid.toFixed(2),
      nextBalance.toFixed(2),
      nextStatus,
      payment_method || "Cash",
      processed_by || null,
    ],
  );

  await insertTransaction({
    billing,
    amount: amountToPay,
    payment_method: payment_method || "Cash",
    processed_by,
    reference_no: `TXN-${Date.now()}`,
  });

  await syncEnrollmentPaymentStatus(updated.rows[0]);
  await writeAuditLog(db, {
    entity_type: "billing",
    entity_id: billing.id,
    action: "direct_payment_recorded",
    actor: processed_by || null,
    actor_type: "treasury",
    details: {
      amount_paid: amountToPay.toFixed(2),
      payment_method: payment_method || "Cash",
      status: nextStatus,
      enrollment_id: billing.enrollment_id || null,
    },
  });

  return updated.rows[0];
}

async function syncEnrollmentPaymentStatus(billing) {
  if (!billing?.enrollment_id) {
    return;
  }

  const isDownpayment = String(billing.description || "")
    .toLowerCase()
    .includes("downpayment");

  if (!isDownpayment) {
    return;
  }

  const paymentStatus = String(billing.payment_status || "").toLowerCase();
  const nextEnrollmentStatus =
    paymentStatus === "approved"
      ? "Pending"
      : paymentStatus === "denied"
        ? "Payment Rejected"
        : null;

  if (!nextEnrollmentStatus) {
    return;
  }

  await db.query(
    `
    update enrollments
    set status = $2,
        updated_at = now()
    where id = $1
      and lower(coalesce(status, '')) not in ('approved', 'declined', 'denied')
    `,
    [billing.enrollment_id, nextEnrollmentStatus],
  );
}

async function insertTransaction({
  billing,
  amount,
  payment_method,
  processed_by,
  reference_no,
}) {
  const receiptNo = await generateReceiptNo(db);
  await db.query(
    `
    insert into treasury_transactions
    (billing_id, enrollment_id, student_name, email, reference_no, receipt_no, description, amount, payment_method, status, processed_by)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Paid',$10)
    `,
    [
      billing.id,
      billing.enrollment_id,
      billing.student_name,
      billing.email,
      reference_no || `TXN-${Date.now()}`,
      receiptNo,
      billing.description,
      Number(amount || 0).toFixed(2),
      payment_method || "Cash",
      processed_by || null,
    ],
  );
}

module.exports.updateBilling = updateBilling;
