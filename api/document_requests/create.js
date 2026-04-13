const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");

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
    document_type,
    purpose,
    amount,
  } = data;

  const amountValue = Number(amount || 0);

  if (!student_name || !email || !document_type || amountValue <= 0) {
    throw new Error("Missing required document request fields");
  }

  const result = await db.query(
    `
    insert into document_requests
    (student_id, student_name, email, document_type, purpose, amount, request_status, payment_status)
    values ($1,$2,$3,$4,$5,$6,'Pending Payment','Unpaid')
    returning *
    `,
    [
      student_id || null,
      student_name,
      email,
      document_type,
      purpose || null,
      amountValue.toFixed(2),
    ],
  );

  return result.rows[0];
}

module.exports.createDocumentRequest = createDocumentRequest;
