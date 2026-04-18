const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const {
  recordDocumentPaymentTransaction,
  notifyDocumentRequestStatus,
} = require("./helpers");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const updated = await updateDocumentRequest(body);
    return okay(res, updated);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function updateDocumentRequest(data) {
  const {
    id,
    request_status,
    payment_status,
    payment_method,
    reference_no,
    proof_of_payment,
    notes,
    reviewed_by,
    treasury_reviewed_by,
  } = data;

  if (!id) {
    throw new Error("Document request ID is required");
  }

  const existingResult = await db.query(
    `
    select *
    from document_requests
    where id = $1
    limit 1
    `,
    [id],
  );

  if (!existingResult.rows.length) {
    throw new Error("Document request not found");
  }

  const existingRequest = existingResult.rows[0];

  const result = await db.query(
    `
    update document_requests
    set request_status = coalesce($2, request_status),
        payment_status = coalesce($3, payment_status),
        payment_method = coalesce($4, payment_method),
        reference_no = coalesce($5, reference_no),
        proof_of_payment = coalesce($6, proof_of_payment),
        notes = coalesce($7, notes),
        reviewed_by = coalesce($8, reviewed_by),
        treasury_reviewed_by = coalesce($9, treasury_reviewed_by),
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      id,
      request_status || null,
      payment_status || null,
      payment_method || null,
      reference_no || null,
      proof_of_payment || null,
      notes || null,
      reviewed_by || null,
      treasury_reviewed_by || null,
    ],
  );

  const updatedRequest = result.rows[0];
  const previousPaymentStatus = String(existingRequest.payment_status || "");
  const nextPaymentStatus = String(updatedRequest.payment_status || "");
  const hasPaymentDecisionChanged = previousPaymentStatus !== nextPaymentStatus;

  if (nextPaymentStatus === "Approved" && hasPaymentDecisionChanged) {
    await recordDocumentPaymentTransaction(
      updatedRequest,
      treasury_reviewed_by || reviewed_by || "Treasury",
    );
    await notifyDocumentRequestStatus(updatedRequest, "Approved");
  }

  if (nextPaymentStatus === "Denied" && hasPaymentDecisionChanged) {
    await notifyDocumentRequestStatus(updatedRequest, "Rejected");
  }

  return updatedRequest;
}
