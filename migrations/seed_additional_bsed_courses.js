const db = require("../services/supabase");

const SHARED_BSED_COURSES = [
  ["Purposive Communication", "Communication skills for academic and professional settings", "1st Year", "1st Sem", 3],
  ["Readings in Philippine History", "Historical analysis and civic understanding", "1st Year", "1st Sem", 3],
  ["Understanding the Self", "Personal development and identity formation", "1st Year", "1st Sem", 3],
  ["NSTP 1", "National Service Training Program 1", "1st Year", "1st Sem", 3],
  ["The Teaching Profession", "Roles, ethics, and legal foundations of teaching", "1st Year", "1st Sem", 3],
  ["Art Appreciation", "Foundations of visual and performing arts", "1st Year", "2nd Sem", 3],
  ["Science, Technology, and Society", "Intersections of science, technology, and society", "1st Year", "2nd Sem", 3],
  ["Mathematics in the Modern World", "Quantitative reasoning for contemporary life", "1st Year", "2nd Sem", 3],
  ["NSTP 2", "National Service Training Program 2", "1st Year", "2nd Sem", 3],
  ["Facilitating Learner-Centered Teaching", "Principles of learner-centered instruction", "1st Year", "2nd Sem", 3],
  ["Child and Adolescent Development", "Growth and development of secondary learners", "2nd Year", "1st Sem", 3],
  ["Technology for Teaching and Learning 1", "Educational technology tools and strategies", "2nd Year", "1st Sem", 3],
  ["Foundation of Special and Inclusive Education", "Inclusive teaching practices and special education basics", "2nd Year", "1st Sem", 3],
  ["The Contemporary World", "Global issues and contemporary realities", "2nd Year", "1st Sem", 3],
  ["Assessment in Learning 1", "Principles and tools of classroom assessment", "2nd Year", "2nd Sem", 3],
  ["Curriculum Development", "Curriculum design and implementation", "2nd Year", "2nd Sem", 3],
  ["Building and Enhancing New Literacies", "Literacies required in modern classrooms", "2nd Year", "2nd Sem", 3],
  ["Life and Works of Rizal", "Study of Jose Rizal's life and writings", "2nd Year", "2nd Sem", 3],
  ["Field Study 1", "Observation of learning environment and school context", "3rd Year", "1st Sem", 3],
  ["Assessment in Learning 2", "Advanced assessment methods and evaluation", "3rd Year", "1st Sem", 3],
  ["Technology for Teaching and Learning 2", "Advanced technology integration in teaching", "3rd Year", "1st Sem", 3],
  ["The Teacher and the School Curriculum", "Alignment of instruction with curriculum standards", "3rd Year", "2nd Sem", 3],
  ["Field Study 2", "Participation in teaching-learning processes", "3rd Year", "2nd Sem", 3],
  ["Action Research in Education", "Research methods for classroom improvement", "3rd Year", "2nd Sem", 3],
  ["Field Study 3", "Demonstration teaching and professional reflection", "4th Year", "1st Sem", 3],
  ["Teaching Internship", "Supervised practice teaching in secondary school", "4th Year", "1st Sem", 6],
  ["Field Study 4", "Portfolio and teaching performance development", "4th Year", "2nd Sem", 3],
  ["Seminar on Teaching Practice", "Professional preparation for beginning teachers", "4th Year", "2nd Sem", 3],
];

const MAJOR_COURSES = {
  Filipino: [
    ["Komunikasyon at Pananaliksik sa Wika at Kulturang Filipino", "Core communication and research in Filipino language and culture", "1st Year", "1st Sem", 3],
    ["Introduksyon sa Pagtuturo ng Filipino", "Foundations of teaching Filipino in secondary education", "1st Year", "1st Sem", 3],
    ["Pagbasa at Pagsusuri ng Iba't Ibang Teksto Tungo sa Pananaliksik", "Reading and text analysis in Filipino", "1st Year", "2nd Sem", 3],
    ["Ponolohiya at Morpolohiyang Filipino", "Structures and sound system of the Filipino language", "1st Year", "2nd Sem", 3],
    ["Estruktura at Gamit ng Wikang Filipino", "Advanced grammar and usage of Filipino", "2nd Year", "1st Sem", 3],
    ["Sintaksis at Semantika ng Filipino", "Sentence structure and meaning in Filipino", "2nd Year", "1st Sem", 3],
    ["Panitikan ng Rehiyon", "Regional Philippine literature and criticism", "2nd Year", "2nd Sem", 3],
    ["Panitikan ng Pilipinas", "Survey of Philippine literature for secondary learners", "2nd Year", "2nd Sem", 3],
    ["Pagtuturo at Pagtataya sa Filipino", "Methods and assessment in teaching Filipino", "3rd Year", "1st Sem", 3],
    ["Pagsasaling-Wika", "Theories and practices in Filipino translation", "3rd Year", "1st Sem", 3],
    ["Wika, Kultura, at Lipunan", "Language, culture, and society in Filipino studies", "3rd Year", "2nd Sem", 3],
    ["Malikhaing Pagsulat sa Filipino", "Creative writing for Filipino majors", "3rd Year", "2nd Sem", 3],
    ["Pananaliksik sa Filipino", "Research writing and inquiry in Filipino", "4th Year", "1st Sem", 3],
    ["Pagsusuri ng Kurikulum sa Filipino", "Curriculum analysis for Filipino education", "4th Year", "1st Sem", 3],
    ["Gawaing Aplikatibo sa Pagtuturo ng Filipino", "Capstone teaching applications for Filipino majors", "4th Year", "2nd Sem", 3],
    ["Paghahanda sa Licensure Examination sa Filipino", "Board exam review for Filipino major students", "4th Year", "2nd Sem", 3],
  ],
  English: [
    ["Structure of English", "Overview of English grammar and syntax", "1st Year", "1st Sem", 3],
    ["Foundations of English Language Teaching", "Introduction to English teaching in secondary education", "1st Year", "1st Sem", 3],
    ["Speech and Oral Communication", "Speaking and speech training for English majors", "1st Year", "2nd Sem", 3],
    ["Grammar and Structure of English", "Core grammar and usage for English majors", "1st Year", "2nd Sem", 3],
    ["Language, Literature, and Society", "Relationship of language and literature in context", "2nd Year", "1st Sem", 3],
    ["Survey of English and American Literature", "Major literary traditions in English", "2nd Year", "1st Sem", 3],
    ["World Literature", "Major literary genres and texts for English education", "2nd Year", "2nd Sem", 3],
    ["Language Education Across the Curriculum", "Integrating English learning across subject areas", "2nd Year", "2nd Sem", 3],
    ["Teaching Listening and Speaking", "Strategies for oral communication instruction", "3rd Year", "1st Sem", 3],
    ["Teaching Literature Studies", "Methods for teaching literature in secondary school", "3rd Year", "1st Sem", 3],
    ["Teaching Reading and Writing", "Methods for literacy development in English", "3rd Year", "2nd Sem", 3],
    ["Creative Writing and Stylistics", "Style analysis and creative production in English", "3rd Year", "2nd Sem", 3],
    ["Campus Journalism and Creative Writing", "Writing instruction and publication skills", "4th Year", "1st Sem", 3],
    ["Research in English Language and Literature", "Academic inquiry for English majors", "4th Year", "1st Sem", 3],
    ["Assessment in English Language Learning", "Evaluation tools for English classes", "4th Year", "2nd Sem", 3],
    ["Preparation for Licensure Examination in English", "Board exam review for English major students", "4th Year", "2nd Sem", 3],
  ],
  Mathematics: [
    ["College Algebra for Secondary Teaching", "Algebra content and pedagogy for future math teachers", "1st Year", "1st Sem", 3],
    ["Mathematical Reasoning", "Logic, sets, and patterns for mathematics majors", "1st Year", "1st Sem", 3],
    ["Trigonometry and Analytic Geometry", "Mathematical foundations for secondary instruction", "1st Year", "2nd Sem", 3],
    ["Calculus Readiness", "Pre-calculus concepts for higher mathematics", "1st Year", "2nd Sem", 3],
    ["Plane and Solid Geometry", "Geometric reasoning and proofs", "2nd Year", "1st Sem", 3],
    ["Linear Algebra", "Matrices, vectors, and transformations", "2nd Year", "1st Sem", 3],
    ["Probability and Statistics", "Fundamentals of statistics for mathematics majors", "2nd Year", "2nd Sem", 3],
    ["Mathematics of Investment", "Business mathematics and financial applications", "2nd Year", "2nd Sem", 3],
    ["Calculus for Secondary Education", "Differential and integral calculus for teaching", "3rd Year", "1st Sem", 3],
    ["Abstract Algebra", "Groups, rings, and algebraic structures", "3rd Year", "1st Sem", 3],
    ["Problem Solving and Mathematical Investigation", "Strategies for inquiry-based mathematics learning", "3rd Year", "2nd Sem", 3],
    ["Mathematics Modeling", "Applied mathematical modeling and interpretation", "3rd Year", "2nd Sem", 3],
    ["Assessment of Learning in Mathematics", "Designing tests and performance tasks in math", "4th Year", "1st Sem", 3],
    ["Research in Mathematics Education", "Research methods in math teaching and learning", "4th Year", "1st Sem", 3],
    ["Technology for Teaching Mathematics", "Use of digital tools in mathematics classrooms", "4th Year", "2nd Sem", 3],
    ["Preparation for Licensure Examination in Mathematics", "Board exam review for Math major students", "4th Year", "2nd Sem", 3],
  ],
};

async function insertCourse(program, major, course) {
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
      program.id,
      program.name,
      program.code,
      major,
      name,
      description,
      yearLevel,
      units,
      semester,
    ],
  );
}

async function up() {
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
    console.log("BSED program not found; no additional courses seeded");
    return;
  }

  for (const course of SHARED_BSED_COURSES) {
    await insertCourse(bsedProgram, null, course);
  }

  for (const [major, courses] of Object.entries(MAJOR_COURSES)) {
    for (const course of courses) {
      await insertCourse(bsedProgram, major, course);
    }
  }

  console.log("Additional BSED courses seeded");
}

async function down() {
  const allCourseNames = [
    ...SHARED_BSED_COURSES.map(([name]) => name),
    ...Object.values(MAJOR_COURSES).flat().map(([name]) => name),
  ];

  await db.query(
    `
    delete from courses
    where program_code = 'BSED'
      and name = any($1::text[])
    `,
    [allCourseNames],
  );

  console.log("Additional BSED courses removed");
}

module.exports = { up, down };
