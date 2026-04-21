const db = require("../services/supabase");

const BSED_MAJORS = [
  {
    major: "Filipino",
    courses: [
      ["Introduksyon sa Pagtuturo ng Filipino", "Foundations of teaching Filipino in secondary education", "1st Year", "1st Sem", 3],
      ["Ponolohiya at Morpolohiyang Filipino", "Structures and sound system of the Filipino language", "1st Year", "2nd Sem", 3],
      ["Sintaksis at Semantika ng Filipino", "Sentence structure and meaning in Filipino", "2nd Year", "1st Sem", 3],
      ["Panitikan ng Pilipinas", "Survey of Philippine literature for secondary learners", "2nd Year", "2nd Sem", 3],
      ["Pagtuturo at Pagtataya sa Filipino", "Methods and assessment in teaching Filipino", "3rd Year", "1st Sem", 3],
      ["Wika, Kultura, at Lipunan", "Language, culture, and society in Filipino studies", "3rd Year", "2nd Sem", 3],
      ["Pananaliksik sa Filipino", "Research writing and inquiry in Filipino", "4th Year", "1st Sem", 3],
      ["Gawaing Aplikatibo sa Pagtuturo ng Filipino", "Capstone teaching applications for Filipino majors", "4th Year", "2nd Sem", 3],
    ],
  },
  {
    major: "English",
    courses: [
      ["Foundations of English Language Teaching", "Introduction to English teaching in secondary education", "1st Year", "1st Sem", 3],
      ["Grammar and Structure of English", "Core grammar and usage for English majors", "1st Year", "2nd Sem", 3],
      ["Language, Literature, and Society", "Relationship of language and literature in context", "2nd Year", "1st Sem", 3],
      ["World Literature", "Major literary genres and texts for English education", "2nd Year", "2nd Sem", 3],
      ["Teaching Listening and Speaking", "Strategies for oral communication instruction", "3rd Year", "1st Sem", 3],
      ["Teaching Reading and Writing", "Methods for literacy development in English", "3rd Year", "2nd Sem", 3],
      ["Campus Journalism and Creative Writing", "Writing instruction and publication skills", "4th Year", "1st Sem", 3],
      ["Assessment in English Language Learning", "Evaluation tools for English classes", "4th Year", "2nd Sem", 3],
    ],
  },
  {
    major: "Mathematics",
    courses: [
      ["College Algebra for Secondary Teaching", "Algebra content and pedagogy for future math teachers", "1st Year", "1st Sem", 3],
      ["Trigonometry and Analytic Geometry", "Mathematical foundations for secondary instruction", "1st Year", "2nd Sem", 3],
      ["Plane and Solid Geometry", "Geometric reasoning and proofs", "2nd Year", "1st Sem", 3],
      ["Probability and Statistics", "Fundamentals of statistics for mathematics majors", "2nd Year", "2nd Sem", 3],
      ["Calculus for Secondary Education", "Differential and integral calculus for teaching", "3rd Year", "1st Sem", 3],
      ["Problem Solving and Mathematical Investigation", "Strategies for inquiry-based mathematics learning", "3rd Year", "2nd Sem", 3],
      ["Assessment of Learning in Mathematics", "Designing tests and performance tasks in math", "4th Year", "1st Sem", 3],
      ["Technology for Teaching Mathematics", "Use of digital tools in mathematics classrooms", "4th Year", "2nd Sem", 3],
    ],
  },
];

async function up() {
  await db.query(`
    alter table courses
      add column if not exists major text;
  `);

  await db.query(`
    alter table enrollments
      add column if not exists major text;
  `);

  const programResult = await db.query(
    `
    select id, name, code
    from programs
    where upper(coalesce(code, '')) = 'BSED'
    order by created_at asc nulls last
    limit 1
    `,
  );

  const bsedProgram = programResult.rows[0];

  if (!bsedProgram) {
    console.log("BSED program not found; major columns added without seeding courses");
    return;
  }

  for (const majorGroup of BSED_MAJORS) {
    for (const course of majorGroup.courses) {
      const [name, description, yearLevel, semester, units] = course;

      await db.query(
        `
        insert into courses (
          program_id,
          program_name,
          program_code,
          major,
          name,
          description,
          year_level,
          units,
          semester,
          status
        )
        select
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active'
        where not exists (
          select 1
          from courses
          where program_id = $1
            and coalesce(major, '') = coalesce($4, '')
            and name = $5
            and year_level = $7
            and semester = $9
        )
        `,
        [
          bsedProgram.id,
          bsedProgram.name,
          bsedProgram.code,
          majorGroup.major,
          name,
          description,
          yearLevel,
          units,
          semester,
        ],
      );
    }
  }

  console.log("BSED majors added and seeded with course data");
}

async function down() {
  await db.query(`
    delete from courses
    where program_code = 'BSED'
      and major in ('Filipino', 'English', 'Mathematics');
  `);

  await db.query(`
    alter table enrollments
      drop column if exists major;
  `);

  await db.query(`
    alter table courses
      drop column if exists major;
  `);

  console.log("BSED majors and seeded courses removed");
}

module.exports = { up, down };
