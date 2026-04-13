const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  try {
    const [students, enrollments, pending, billings, transactions] =
      await Promise.all([
        db.query(`select count(*)::int as total from users where type = 'student'`),
        db.query(`select count(*)::int as total from enrollments`),
        db.query(
          `select count(*)::int as total from enrollments where lower(status) = 'pending'`,
        ),
        db.query(`
          select
            count(*)::int as total_billings,
            count(*) filter (where lower(status) = 'paid')::int as paid_billings,
            count(*) filter (where lower(status) = 'partial')::int as partial_billings,
            count(*) filter (where lower(status) = 'unpaid')::int as unpaid_billings,
            coalesce(sum(amount), 0)::numeric(12,2) as total_assessed,
            coalesce(sum(amount_paid), 0)::numeric(12,2) as total_collected,
            coalesce(sum(balance), 0)::numeric(12,2) as total_outstanding
          from billings
        `),
        db.query(`
          select
            count(*)::int as total_transactions,
            coalesce(sum(amount), 0)::numeric(12,2) as transaction_total
          from treasury_transactions
        `),
      ]);

    return okay(res, {
      students: students.rows[0]?.total || 0,
      enrollments: enrollments.rows[0]?.total || 0,
      pending_enrollments: pending.rows[0]?.total || 0,
      total_billings: billings.rows[0]?.total_billings || 0,
      paid_billings: billings.rows[0]?.paid_billings || 0,
      partial_billings: billings.rows[0]?.partial_billings || 0,
      unpaid_billings: billings.rows[0]?.unpaid_billings || 0,
      total_assessed: Number(billings.rows[0]?.total_assessed || 0),
      total_collected: Number(billings.rows[0]?.total_collected || 0),
      total_outstanding: Number(billings.rows[0]?.total_outstanding || 0),
      total_transactions: transactions.rows[0]?.total_transactions || 0,
      transaction_total: Number(transactions.rows[0]?.transaction_total || 0),
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
