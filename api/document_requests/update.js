const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { writeAuditLog } = require("../../lib/audit-log");
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
    claimed_by,
    released_by,
    released_at,
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
  const nextRequestStatus = request_status || existingRequest.request_status;
  const resolvedReleasedBy =
    released_by ||
    reviewed_by ||
    treasury_reviewed_by ||
    existingRequest.released_by ||
    null;
  const resolvedReleasedAt =
    released_at ||
    (["Ready for Release", "Completed"].includes(nextRequestStatus)
      ? existingRequest.released_at || new Date().toISOString()
      : existingRequest.released_at || null);

  if (nextRequestStatus === "Completed" && !String(claimed_by || existingRequest.claimed_by || "").trim()) {
    throw new Error("Claimed by is required when marking a request as completed");
  }

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
        claimed_by = coalesce($10, claimed_by),
        released_by = coalesce($11, released_by),
        released_at = coalesce($12, released_at),
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
      claimed_by || null,
      resolvedReleasedBy,
      resolvedReleasedAt,
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

  const previousRequestStatus = String(existingRequest.request_status || "");
  const hasRequestStatusChanged = previousRequestStatus !== String(updatedRequest.request_status || "");

  if (
    hasRequestStatusChanged ||
    hasPaymentDecisionChanged ||
    claimed_by ||
    released_by ||
    released_at ||
    notes
  ) {
    await writeAuditLog(db, {
      entity_type: "document_request",
      entity_id: updatedRequest.id,
      action: hasRequestStatusChanged
        ? `request_status_${String(updatedRequest.request_status || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
        : hasPaymentDecisionChanged
          ? `payment_status_${String(updatedRequest.payment_status || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
          : "request_updated",
      actor: treasury_reviewed_by || reviewed_by || released_by || "System",
      actor_type: hasPaymentDecisionChanged ? "treasury" : "records",
      details: {
        previous_request_status: existingRequest.request_status,
        next_request_status: updatedRequest.request_status,
        previous_payment_status: existingRequest.payment_status,
        next_payment_status: updatedRequest.payment_status,
        claimed_by: updatedRequest.claimed_by || null,
        released_by: updatedRequest.released_by || null,
        released_at: updatedRequest.released_at || null,
        notes: updatedRequest.notes || null,
      },
    });
  }

  return updatedRequest;
}
