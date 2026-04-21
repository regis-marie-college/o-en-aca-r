function getReceiptYear(date = new Date()) {
  return date.getFullYear();
}

async function generateReceiptNo(db, date = new Date()) {
  const year = getReceiptYear(date);
  const prefix = `OR-${year}-`;
  const result = await db.query(
    `
    select receipt_no
    from treasury_transactions
    where receipt_no like $1
    order by receipt_no desc
    limit 1
    `,
    [`${prefix}%`],
  );

  const currentValue = result.rows[0]?.receipt_no || "";
  const currentSequence = Number(currentValue.split("-").pop() || 0);
  const nextSequence = String(currentSequence + 1).padStart(6, "0");

  return `${prefix}${nextSequence}`;
}

module.exports = {
  generateReceiptNo,
};
