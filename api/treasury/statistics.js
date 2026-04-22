const { okay, notAllowed, badRequest } = require("../../lib/response");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, ["admin", "treasury", "records"]);
  if (!auth) {
    return;
  }

  try {
    const [students, enrollments, pending, billings, transactions, yearlyComparison] =
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
        db.query(`
          with enrollment_years as (
            select
              school_year,
              count(*)::int as enrollee_count
            from enrollments
            where coalesce(school_year, '') <> ''
            group by school_year
          ),
          revenue_years as (
            select
              linked_enrollment.school_year,
              coalesce(sum(b.amount_paid), 0)::numeric(12,2) as collected_amount
            from billings b
            left join lateral (
              select e.school_year
              from enrollments e
              where
                (b.enrollment_id is not null and e.id = b.enrollment_id) or
                (b.enrollment_id is null and e.email = b.email)
              order by e.created_at desc
              limit 1
            ) as linked_enrollment on true
            where
              coalesce(linked_enrollment.school_year, '') <> '' and
              coalesce(b.amount_paid, 0) > 0
            group by linked_enrollment.school_year
          )
          select
            coalesce(e.school_year, r.school_year) as school_year,
            coalesce(e.enrollee_count, 0)::int as enrollee_count,
            coalesce(r.collected_amount, 0)::numeric(12,2) as collected_amount
          from enrollment_years e
          full outer join revenue_years r
            on r.school_year = e.school_year
          order by coalesce(e.school_year, r.school_year) asc
        `),
      ]);

    const yearlyRows = yearlyComparison.rows.map((row) => ({
      school_year: row.school_year,
      enrollee_count: Number(row.enrollee_count || 0),
      collected_amount: Number(row.collected_amount || 0),
    }));

    const latestYear = yearlyRows[yearlyRows.length - 1] || null;
    const previousYear = yearlyRows[yearlyRows.length - 2] || null;

    function percentageChange(currentValue, previousValue) {
      const current = Number(currentValue || 0);
      const previous = Number(previousValue || 0);

      if (!previous) {
        return current > 0 ? 100 : 0;
      }

      return Number((((current - previous) / previous) * 100).toFixed(2));
    }

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
      yearly_comparison: yearlyRows,
      latest_school_year: latestYear?.school_year || null,
      previous_school_year: previousYear?.school_year || null,
      latest_enrollees: latestYear?.enrollee_count || 0,
      previous_enrollees: previousYear?.enrollee_count || 0,
      enrollee_change_pct: percentageChange(
        latestYear?.enrollee_count,
        previousYear?.enrollee_count,
      ),
      latest_collected_school_year: latestYear?.collected_amount || 0,
      previous_collected_school_year: previousYear?.collected_amount || 0,
      collected_change_pct: percentageChange(
        latestYear?.collected_amount,
        previousYear?.collected_amount,
      ),
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
