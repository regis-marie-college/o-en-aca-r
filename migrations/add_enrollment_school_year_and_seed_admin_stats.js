const db = require("../services/supabase");

function schoolYearDate(schoolYear, month = 8, day = 10) {
  const startYear = Number(String(schoolYear || "").split("-")[0] || 2025);
  const value = new Date(Date.UTC(startYear, month - 1, day, 8, 0, 0));
  return value.toISOString().slice(0, 19).replace("T", " ");
}

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists school_year text;
  `);

  await db.query(`
    update enrollments
    set school_year = case
      when extract(month from created_at) >= 6
        then concat(extract(year from created_at)::int, '-', (extract(year from created_at)::int + 1))
      else concat((extract(year from created_at)::int - 1), '-', extract(year from created_at)::int)
    end
    where coalesce(school_year, '') = '';
  `);

  const existingBaseline = await db.query(`
    select count(*)::int as total
    from enrollments
    where school_year = '2025-2026'
  `);

  if (Number(existingBaseline.rows[0]?.total || 0) > 0) {
    console.log("school_year ensured and baseline already present");
    return;
  }

  const programResult = await db.query(`
    select id, name, code
    from programs
    order by name asc
    limit 4
  `);

  const programs = programResult.rows.length
    ? programResult.rows
    : [
        {
          id: "baseline-bscs",
          name: "Bachelor of Science in Computer Science",
          code: "BSCS",
        },
        {
          id: "baseline-bsit",
          name: "Bachelor of Science in Information Technology",
          code: "BSIT",
        },
        {
          id: "baseline-beed",
          name: "Bachelor of Elementary Education",
          code: "BEED",
        },
        {
          id: "baseline-bsba",
          name: "Bachelor of Science in Business Administration",
          code: "BSBA",
        },
      ];

  const firstNames = [
    "Juan",
    "Maria",
    "Jose",
    "Ana",
    "Carlo",
    "Rina",
    "Mark",
    "Liza",
    "Paolo",
    "Mae",
    "Ralph",
    "Joy",
  ];
  const lastNames = [
    "Dela Cruz",
    "Reyes",
    "Santos",
    "Garcia",
    "Mendoza",
    "Torres",
    "Aquino",
    "Flores",
    "Castro",
    "Lopez",
    "Rivera",
    "Bautista",
  ];

  const createdAt = schoolYearDate("2025-2026");
  const seededEnrollments = [];

  for (let index = 0; index < 18; index += 1) {
    const program = programs[index % programs.length];
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[index % lastNames.length];
    const email = `baseline.${index + 1}@oenacar.local`;
    const mobile = `0917${String(1000000 + index).padStart(7, "0")}`;
    const totalAmount = 14500 + index * 350;

    const result = await db.query(
      `
      insert into enrollments
      (
        last_name,
        first_name,
        middle_name,
        email,
        mobile,
        birthday,
        program_id,
        program_name,
        program_code,
        school_year,
        year_level,
        semester,
        selected_courses,
        total_units,
        total_amount,
        status,
        created_at,
        updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$17)
      returning id
      `,
      [
        lastName,
        firstName,
        "Baseline",
        email,
        mobile,
        `2004-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
        program.id,
        program.name,
        program.code,
        "2025-2026",
        index % 2 === 0 ? "1st Year" : "2nd Year",
        index % 3 === 0 ? "2nd Sem" : "1st Sem",
        JSON.stringify([]),
        21,
        Number(totalAmount).toFixed(2),
        "Approved",
        createdAt,
      ],
    );

    seededEnrollments.push({
      id: result.rows[0].id,
      student_name: `${firstName} ${lastName}`,
      email,
      amount: 9000 + index * 220,
      created_at: createdAt,
    });
  }

  for (let index = 0; index < seededEnrollments.length; index += 1) {
    const entry = seededEnrollments[index];

    await db.query(
      `
      insert into treasury_transactions
      (
        enrollment_id,
        student_name,
        email,
        reference_no,
        description,
        amount,
        payment_method,
        status,
        processed_by,
        created_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [
        entry.id,
        entry.student_name,
        entry.email,
        `BASELINE-2025-${String(index + 1).padStart(4, "0")}`,
        "Baseline tuition collection",
        Number(entry.amount).toFixed(2),
        index % 2 === 0 ? "Online" : "Cash",
        "Paid",
        "System Baseline",
        entry.created_at,
      ],
    );
  }

  console.log("enrollment school_year added and admin baseline seeded");
}

async function down() {
  await db.query(`
    delete from treasury_transactions
    where processed_by = 'System Baseline'
       or reference_no like 'BASELINE-2025-%';
  `);

  await db.query(`
    delete from enrollments
    where email like 'baseline.%@oenacar.local'
      and school_year = '2025-2026';
  `);

  await db.query(`
    alter table enrollments
      drop column if exists school_year;
  `);

  console.log("enrollment school_year baseline removed");
}

module.exports = { up, down };
