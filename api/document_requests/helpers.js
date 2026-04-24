const db = require("../../services/supabase");
const sendEmail = require("../sendMail/sendMail");
const { generateReceiptNo } = require("../../lib/receipt-number");

function buildTransactionReference(request) {
  const rawId = String(request.id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  return request.reference_no || `DOC-${rawId || Date.now()}`;
}

async function recordDocumentPaymentTransaction(request, processedBy) {
  const referenceNo = buildTransactionReference(request);
  const description = `${request.document_type} request payment`;

  const existing = await db.query(
    `
    select id
    from treasury_transactions
    where email = $1 and reference_no = $2 and description = $3
    limit 1
    `,
    [request.email, referenceNo, description],
  );

  if (existing.rows.length) {
    return existing.rows[0];
  }

  const result = await db.query(
    `
    insert into treasury_transactions
    (student_name, email, reference_no, receipt_no, description, amount, payment_method, status, processed_by)
    values ($1,$2,$3,$4,$5,$6,$7,'Paid',$8)
    returning *
    `,
    [
      request.student_name,
      request.email,
      referenceNo,
      await generateReceiptNo(db),
      description,
      Number(request.amount || 0).toFixed(2),
      request.payment_method || "Online",
      processedBy || "Treasury",
    ],
  );

  return result.rows[0];
}

async function notifyDocumentRequestStatus(request, decision) {
  if (!request?.email || !decision) {
    return;
  }

  const normalizedDecision = String(decision).toLowerCase();
  const isApproved = normalizedDecision === "approved";
  const isReady = normalizedDecision === "ready";
  const subject = isReady
    ? "Document Request Ready for Claiming"
    : `Document Request ${isApproved ? "Approved" : "Rejected"}`;
  const statusLine = isReady
    ? "Your requested document(s) are now ready for claiming."
    : `Your document request has been <strong>${isApproved ? "approved" : "rejected"}</strong>.`;
  const nextStep = isReady
    ? "Please come to the campus and claim your document(s) at the Records Office."
    : isApproved
      ? "Your payment has been approved. The Records Office will process your requested document(s)."
      : "Please log in to your student portal for the latest update.";
  const message = `
    <p>Good day ${escapeHtml(request.student_name || "Student")},</p>
    <p>${statusLine}</p>
    <p><strong>Document(s):</strong> ${escapeHtml(request.document_type || "-")}</p>
    <p><strong>Amount:</strong> PHP ${Number(request.amount || 0).toFixed(2)}</p>
    <p><strong>Payment Method:</strong> ${escapeHtml(request.payment_method || "-")}</p>
    <p><strong>Reference No.:</strong> ${escapeHtml(request.reference_no || "-")}</p>
    <p><strong>Status:</strong> ${escapeHtml(request.request_status || request.payment_status || "-")}</p>
    ${request.notes ? `<p><strong>Notes:</strong> ${escapeHtml(request.notes)}</p>` : ""}
    <p>${nextStep}</p>
    <p>Regis Marie College</p>
  `;

  try {
    await sendEmail(request.email, subject, message);
  } catch (error) {
    console.error("[DocumentRequestEmail]", error.message);
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return map[char] || char;
  });
}

module.exports = {
  recordDocumentPaymentTransaction,
  notifyDocumentRequestStatus,
};
