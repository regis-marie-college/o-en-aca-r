const db = require("../services/supabase");

async function up() {
  await db.query(`
    update enrollments
    set school_year = '2026-2027'
    where email not like 'baseline.%@oenacar.local'
      and email not like 'growth.%@oenacar.local'
      and coalesce(school_year, '') in ('', '2025-2026');
  `);

  console.log("real enrollments moved to 2026-2027");
}

async function down() {
  await db.query(`
    update enrollments
    set school_year = '2025-2026'
    where email not like 'baseline.%@oenacar.local'
      and email not like 'growth.%@oenacar.local'
      and school_year = '2026-2027';
  `);

  console.log("real enrollments moved back to 2025-2026");
}

module.exports = { up, down };
