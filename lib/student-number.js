async function generateStudentNumber(db, date = new Date()) {
  const year = date.getFullYear();
  const prefix = `STU-${year}-`;
  const result = await db.query(
    `
    select student_number
    from users
    where student_number like $1
    order by student_number desc
    limit 1
    `,
    [`${prefix}%`],
  );

  const latestStudentNumber = result.rows[0]?.student_number || "";
  const latestSequence = Number(latestStudentNumber.split("-").pop() || 0);
  const nextSequence = String(latestSequence + 1).padStart(5, "0");

  return `${prefix}${nextSequence}`;
}

module.exports = {
  generateStudentNumber,
};
