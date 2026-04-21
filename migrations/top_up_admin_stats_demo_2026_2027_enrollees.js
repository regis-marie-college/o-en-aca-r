const db = require("../services/supabase");

function schoolYearDate(schoolYear, month = 9, day = 5) {
  const startYear = Number(String(schoolYear || "").split("-")[0] || 2026);
  const value = new Date(Date.UTC(startYear, month - 1, day, 8, 0, 0));
  return value.toISOString().slice(0, 19).replace("T", " ");
}

async function up() {
  const currentCountResult = await db.query(`
    select count(*)::int as total
    from enrollments
    where school_year = '2026-2027'
  `);

  const currentCount = Number(currentCountResult.rows[0]?.total || 0);
  const targetCount = 40;

  if (currentCount >= targetCount) {
    console.log("2026-2027 enrollee count already meets target");
    return;
  }

  const toInsert = targetCount - currentCount;
  const programsResult = await db.query(`
    select id, name, code
    from programs
    order by name asc
    limit 4
  `);

  const programs = programsResult.rows.length
    ? programsResult.rows
    : [
        { id: "topup-bscs", name: "Bachelor of Science in Computer Science", code: "BSCS" },
        { id: "topup-bsit", name: "Bachelor of Science in Information Technology", code: "BSIT" },
        { id: "topup-beed", name: "Bachelor of Elementary Education", code: "BEED" },
        { id: "topup-bsba", name: "Bachelor of Science in Business Administration", code: "BSBA" },
      ];

  const firstNames = ["Nico", "Pat", "Quinn", "Rose", "Sean", "Tina", "Una", "Vince", "Wes", "Xyra", "Yana", "Zed"];
  const lastNames = ["Ortiz", "Lim", "Tan", "Ocampo", "Padilla", "Manalo", "Cabrera", "Luna", "Pascual", "Yap", "Soriano", "Mercado"];
  const createdAt = schoolYearDate("2026-2027");

  for (let index = 0; index < toInsert; index += 1) {
    const program = programs[index % programs.length];
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[index % lastNames.length];
    const email = `growth.topup.${index + 1}@oenacar.local`;
    const amount = 12800 + index * 180;

    const enrollment = await db.query(
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
        "TopUp",
        email,
        `0939${String(3000000 + index).padStart(7, "0")}`,
        `2005-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
        program.id,
        program.name,
        program.code,
        "2026-2027",
        index % 2 === 0 ? "1st Year" : "2nd Year",
        "1st Sem",
        JSON.stringify([]),
        24,
        Number(amount).toFixed(2),
        "Approved",
        createdAt,
      ],
    );

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
        enrollment.rows[0].id,
        `${firstName} ${lastName}`,
        email,
        `TOPUP-2026-${String(index + 1).padStart(4, "0")}`,
        "Demo enrollee growth top up",
        Number(9800 + index * 140).toFixed(2),
        index % 2 === 0 ? "Online" : "Cash",
        "Paid",
        "System Demo Growth TopUp",
        createdAt,
      ],
    );
  }

  console.log("2026-2027 demo enrollee count topped up");
}

async function down() {
  await db.query(`
    delete from treasury_transactions
    where processed_by = 'System Demo Growth TopUp'
       or reference_no like 'TOPUP-2026-%';
  `);

  await db.query(`
    delete from enrollments
    where email like 'growth.topup.%@oenacar.local'
      and school_year = '2026-2027';
  `);

  console.log("2026-2027 demo enrollee top up removed");
}

module.exports = { up, down };
