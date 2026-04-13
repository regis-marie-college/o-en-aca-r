const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

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
    proof_of_payment,
    notes,
    reviewed_by,
    treasury_reviewed_by,
  } = data;

  if (!id) {
    throw new Error("Document request ID is required");
  }

  const result = await db.query(
    `
    update document_requests
    set request_status = coalesce($2, request_status),
        payment_status = coalesce($3, payment_status),
        proof_of_payment = coalesce($4, proof_of_payment),
        notes = coalesce($5, notes),
        reviewed_by = coalesce($6, reviewed_by),
        treasury_reviewed_by = coalesce($7, treasury_reviewed_by),
        updated_at = now()
    where id = $1
    returning *
    `,
    [
      id,
      request_status || null,
      payment_status || null,
      proof_of_payment || null,
      notes || null,
      reviewed_by || null,
      treasury_reviewed_by || null,
    ],
  );

  if (!result.rows.length) {
    throw new Error("Document request not found");
  }

  if (payment_status === "Approved") {
    const request = result.rows[0];

    await db.query(
      `
      insert into treasury_transactions
      (student_name, email, reference_no, description, amount, payment_method, status, processed_by)
      values ($1,$2,$3,$4,$5,'Proof of Payment','Paid',$6)
      `,
      [
        request.student_name,
        request.email,
        `DOC-${Date.now()}`,
        `${request.document_type} request payment`,
        Number(request.amount || 0).toFixed(2),
        treasury_reviewed_by || "Treasury",
      ],
    );
  }

  return result.rows[0];
}
