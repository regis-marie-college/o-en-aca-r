const db = require("../services/supabase");

function schoolYearDate(schoolYear, month = 8, day = 12) {
  const startYear = Number(String(schoolYear || "").split("-")[0] || 2026);
  const value = new Date(Date.UTC(startYear, month - 1, day, 8, 0, 0));
  return value.toISOString().slice(0, 19).replace("T", " ");
}

async function up() {
  const existing = await db.query(`
    select count(*)::int as total
    from enrollments
    where school_year = '2026-2027'
  `);

  if (Number(existing.rows[0]?.total || 0) > 0) {
    console.log("2026-2027 demo comparison already present");
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
          id: "demo-bscs",
          name: "Bachelor of Science in Computer Science",
          code: "BSCS",
        },
        {
          id: "demo-bsit",
          name: "Bachelor of Science in Information Technology",
          code: "BSIT",
        },
        {
          id: "demo-beed",
          name: "Bachelor of Elementary Education",
          code: "BEED",
        },
        {
          id: "demo-bsba",
          name: "Bachelor of Science in Business Administration",
          code: "BSBA",
        },
      ];

  const firstNames = [
    "Adrian",
    "Bianca",
    "Cedric",
    "Donna",
    "Ethan",
    "Faith",
    "Gino",
    "Hazel",
    "Ian",
    "Jessa",
    "Kevin",
    "Lea",
  ];
  const lastNames = [
    "Navarro",
    "Perez",
    "Cruz",
    "Villanueva",
    "Morales",
    "Fernandez",
    "Diaz",
    "Salazar",
    "Ramos",
    "Serrano",
    "Valdez",
    "Domingo",
  ];

  const createdAt = schoolYearDate("2026-2027");
  const inserted = [];

  for (let index = 0; index < 24; index += 1) {
    const program = programs[index % programs.length];
    const firstName = firstNames[index % firstNames.length];
    const lastName = lastNames[index % lastNames.length];
    const email = `growth.${index + 1}@oenacar.local`;
    const totalAmount = 15800 + index * 420;

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
        "Demo",
        email,
        `0928${String(2000000 + index).padStart(7, "0")}`,
        `2005-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
        program.id,
        program.name,
        program.code,
        "2026-2027",
        index % 2 === 0 ? "1st Year" : "2nd Year",
        index % 3 === 0 ? "2nd Sem" : "1st Sem",
        JSON.stringify([]),
        24,
        Number(totalAmount).toFixed(2),
        "Approved",
        createdAt,
      ],
    );

    inserted.push({
      id: enrollment.rows[0].id,
      student_name: `${firstName} ${lastName}`,
      email,
      amount: 12000 + index * 310,
      created_at: createdAt,
    });
  }

  for (let index = 0; index < inserted.length; index += 1) {
    const item = inserted[index];

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
        item.id,
        item.student_name,
        item.email,
        `DEMO-2026-${String(index + 1).padStart(4, "0")}`,
        "Demo yearly comparison collection",
        Number(item.amount).toFixed(2),
        index % 2 === 0 ? "Online" : "Cash",
        "Paid",
        "System Demo Growth",
        item.created_at,
      ],
    );
  }

  console.log("2026-2027 demo comparison seeded");
}

async function down() {
  await db.query(`
    delete from treasury_transactions
    where processed_by = 'System Demo Growth'
       or reference_no like 'DEMO-2026-%';
  `);

  await db.query(`
    delete from enrollments
    where email like 'growth.%@oenacar.local'
      and school_year = '2026-2027';
  `);

  console.log("2026-2027 demo comparison removed");
}

module.exports = { up, down };
