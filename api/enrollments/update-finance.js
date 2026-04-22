const { okay, badRequest, notAllowed } = require("../../lib/response");
const { bodyParser } = require("../../lib/body-parser");
const db = require("../../services/supabase");
const { requireAuth } = require("../../lib/auth");
const { writeAuditLog } = require("../../lib/audit-log");

const ID_FEE = 300;
const DEFAULT_DOWNPAYMENT_AMOUNT = 2000;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return notAllowed(res);
  }

  const auth = await requireAuth(req, res, "treasury");
  if (!auth) {
    return;
  }

  try {
    const body = await bodyParser(req);
    const {
      id,
      misc_fee,
      misc_fee_description,
      processed_by,
    } = body;

    if (!id) {
      return badRequest(res, "Enrollment ID is required");
    }

    const parsedMiscFee = Number(misc_fee);

    if (Number.isNaN(parsedMiscFee) || parsedMiscFee < 0) {
      return badRequest(res, "Misc fee must be a valid non-negative amount");
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");
      await ensureEnrollmentFinanceColumns(client);

      const currentResult = await client.query(
        `
        select *
        from enrollments
        where id = $1
        for update
        `,
        [id],
      );
      const enrollment = currentResult.rows[0];

      if (!enrollment) {
        throw new Error("Enrollment not found");
      }

      const actorName = String(
        processed_by || auth.email || auth.first_name || "Treasury",
      ).trim() || "Treasury";
      const nextDescription = String(misc_fee_description || "").trim() || null;

      const result = await client.query(
        `
        update enrollments
        set misc_fee = $2,
            misc_fee_description = $3,
            updated_at = now()
        where id = $1
        returning *
        `,
        [id, parsedMiscFee.toFixed(2), nextDescription],
      );
      const updatedEnrollment = result.rows[0];

      if (Number(enrollment.misc_fee || 0) !== Number(parsedMiscFee || 0)) {
        await writeAuditLog(client, {
          entity_type: "enrollment",
          entity_id: updatedEnrollment.id,
          action: "enrollment_misc_fee_updated",
          actor: actorName,
          actor_type: "treasury",
          details: {
            previous_misc_fee: Number(enrollment.misc_fee || 0),
            misc_fee: Number(parsedMiscFee || 0),
          },
        });
      }

      if (
        String(enrollment.misc_fee_description || "") !==
        String(nextDescription || "")
      ) {
        await writeAuditLog(client, {
          entity_type: "enrollment",
          entity_id: updatedEnrollment.id,
          action: "enrollment_misc_fee_description_updated",
          actor: actorName,
          actor_type: "treasury",
          details: {
            previous_misc_fee_description: enrollment.misc_fee_description || null,
            misc_fee_description: nextDescription || null,
          },
        });
      }

      await ensureEnrollmentBillings(updatedEnrollment, client);
      await syncEnrollmentBillings(updatedEnrollment, client);

      await client.query("COMMIT");
      return okay(res, updatedEnrollment);
    } catch (txError) {
      await client.query("ROLLBACK");
      throw txError;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};

async function ensureEnrollmentFinanceColumns(executor) {
  await executor.query(`
    alter table enrollments
      add column if not exists misc_fee numeric(12, 2) default 0,
      add column if not exists misc_fee_description text;
  `);
}

async function ensureEnrollmentBillings(enrollment, executor = db) {
  if (!enrollment?.id || String(enrollment.status || "") !== "Approved") {
    return;
  }

  const billingsResult = await executor.query(
    `
    select id
    from billings
    where enrollment_id = $1
    limit 1
    `,
    [enrollment.id],
  );

  if (billingsResult.rows.length) {
    return;
  }

  const courseAmount = Number(enrollment.total_amount || 0);
  const totalAssessment = courseAmount + Number(enrollment.misc_fee || 0) + ID_FEE;
  const downpaymentAmount = Math.min(DEFAULT_DOWNPAYMENT_AMOUNT, totalAssessment);

  await createInstallmentBillings({
    enrollment,
    first_name: enrollment.first_name,
    last_name: enrollment.last_name,
    email: enrollment.email,
    courseAmount,
    downpaymentAmount,
    executor,
  });
}

async function createInstallmentBillings({
  enrollment,
  first_name,
  last_name,
  email,
  courseAmount,
  downpaymentAmount,
  executor = db,
}) {
  const studentName = `${first_name} ${last_name}`.trim();
  const miscFee = Number(enrollment.misc_fee || 0);
  const totalAssessment = Number(courseAmount || 0) + miscFee + ID_FEE;
  const downpayment = Number(downpaymentAmount || 0);
  const remainingBalance = Math.max(totalAssessment - downpayment, 0);
  const installments = splitAmounts(remainingBalance, 4);

  const billingItems = [
    {
      description: `Downpayment - Tuition and Fees (Course Fee: PHP ${Number(
        courseAmount || 0,
      ).toFixed(2)}, Misc Fee: PHP ${miscFee.toFixed(2)}, ID Fee: PHP ${ID_FEE.toFixed(2)})`,
      amount: downpayment,
    },
    ...installments.map((amount, index) => ({
      description: `${ordinalLabel(index + 1)} Payment Installment`,
      amount,
    })),
  ].filter((item) => Number(item.amount || 0) > 0);

  for (const item of billingItems) {
    await executor.query(
      `
      insert into billings
      (enrollment_id, student_name, email, description, amount, amount_paid, balance, due_date, status, created_by, updated_by)
      values ($1,$2,$3,$4,$5,0,$5,null,'Unpaid',$6,$6)
      `,
      [
        enrollment.id,
        studentName,
        email,
        item.description,
        Number(item.amount).toFixed(2),
        "System Enrollment",
      ],
    );
  }
}

async function syncEnrollmentBillings(enrollment, executor = db) {
  if (!enrollment?.id) {
    return;
  }

  const result = await executor.query(
    `
    select *
    from billings
    where enrollment_id = $1
    order by created_at asc
    `,
    [enrollment.id],
  );

  if (!result.rows.length) {
    return;
  }

  const billings = result.rows;
  const downpaymentBilling = billings.find((billing) =>
    String(billing.description || "").toLowerCase().includes("downpayment"),
  );

  if (!downpaymentBilling) {
    return;
  }

  const miscFee = Number(enrollment.misc_fee || 0);
  const courseAmount = Number(enrollment.total_amount || 0);
  const totalAssessment = courseAmount + miscFee + ID_FEE;
  const downpaymentAmount = Number(downpaymentBilling.amount || 0);
  const installmentBillings = billings.filter((billing) => billing.id !== downpaymentBilling.id);
  const remainingBalance = Math.max(totalAssessment - downpaymentAmount, 0);
  const installmentAmounts = splitAmounts(remainingBalance, installmentBillings.length);

  await executor.query(
    `
    update billings
    set description = $2,
        balance = greatest(amount - amount_paid, 0),
        status = case
          when greatest(amount - amount_paid, 0) <= 0 and amount > 0 then 'Paid'
          when amount_paid > 0 then 'Partial'
          else 'Unpaid'
        end,
        updated_at = now()
    where id = $1
    `,
    [
      downpaymentBilling.id,
      `Downpayment - Tuition and Fees (Course Fee: PHP ${courseAmount.toFixed(
        2,
      )}, Misc Fee: PHP ${miscFee.toFixed(2)}, ID Fee: PHP ${ID_FEE.toFixed(2)})`,
    ],
  );

  for (const [index, billing] of installmentBillings.entries()) {
    const nextAmount = Number(installmentAmounts[index] || 0);

    await executor.query(
      `
      update billings
      set amount = $2,
          balance = greatest($2 - amount_paid, 0),
          status = case
            when greatest($2 - amount_paid, 0) <= 0 and $2 > 0 then 'Paid'
            when amount_paid > 0 then 'Partial'
            else 'Unpaid'
          end,
          updated_at = now()
      where id = $1
      `,
      [billing.id, nextAmount.toFixed(2)],
    );
  }
}

function splitAmounts(total, count) {
  const safeCount = Number(count || 0);

  if (safeCount <= 0) {
    return [];
  }

  const amounts = [];
  const baseAmount = Number((Number(total || 0) / safeCount).toFixed(2));

  for (let index = 0; index < safeCount; index += 1) {
    if (index < safeCount - 1) {
      amounts.push(baseAmount);
      continue;
    }

    const allocated = amounts.reduce((sum, value) => sum + value, 0);
    amounts.push(Number((Number(total || 0) - allocated).toFixed(2)));
  }

  return amounts;
}

function ordinalLabel(value) {
  switch (value) {
    case 1:
      return "1st";
    case 2:
      return "2nd";
    case 3:
      return "3rd";
    case 4:
      return "4th";
    default:
      return `${value}th`;
  }
}
