const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const {
  recordDocumentPaymentTransaction,
  notifyDocumentRequestStatus,
} = require("./helpers");
const DOCUMENT_REQUEST_AMOUNT = 300;

function normalizeDocumentTypes(data) {
  const rawTypes = Array.isArray(data.document_types)
    ? data.document_types
    : [data.document_type];

  return rawTypes
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  try {
    const body = await bodyParser(req);
    const request = await createDocumentRequest(body);
    return okay(res, request);
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function createDocumentRequest(data) {
  const {
    student_id,
    student_name,
    email,
    purpose,
    payment_method,
    reference_no,
    proof_of_payment,
  } = data;
  const documentTypes = normalizeDocumentTypes(data);
  const documentType = documentTypes.join(", ");
  const totalAmount = documentTypes.length * DOCUMENT_REQUEST_AMOUNT;

  const normalizedMethod =
    String(payment_method || "Online").toLowerCase() === "cash" ? "Cash" : "Online";
  const normalizedReference = String(reference_no || "").trim() || null;
  const normalizedProof = String(proof_of_payment || "").trim() || null;

  if (!student_name || !email || !documentTypes.length) {
    throw new Error("Missing required document request fields");
  }

  if (normalizedMethod === "Online" && (!normalizedReference || !normalizedProof)) {
    throw new Error("Reference number and proof of payment are required for online payment");
  }

  const requestStatus =
    normalizedMethod === "Cash" ? "Payment Approved" : "Payment Submitted";
  const paymentStatus = normalizedMethod === "Cash" ? "Approved" : "Submitted";

  const result = await db.query(
    `
    insert into document_requests
    (
      student_id,
      student_name,
      email,
      document_type,
      purpose,
      amount,
      request_status,
      payment_status,
      payment_method,
      reference_no,
      proof_of_payment
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    returning *
    `,
    [
      student_id || null,
      student_name,
      email,
      documentType,
      purpose || null,
      totalAmount.toFixed(2),
      requestStatus,
      paymentStatus,
      normalizedMethod,
      normalizedReference,
      normalizedProof,
    ],
  );

  const request = result.rows[0];

  if (normalizedMethod === "Cash") {
    await recordDocumentPaymentTransaction(request, "Cash Payment");
    await notifyDocumentRequestStatus(request, "Approved");
  }

  return request;
}

module.exports.createDocumentRequest = createDocumentRequest;
