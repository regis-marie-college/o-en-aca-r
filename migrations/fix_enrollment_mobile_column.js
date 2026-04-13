const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table enrollments
      add column if not exists mobile varchar(15);
  `);

  await db.query(`
    do $$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_name = 'enrollments'
          and column_name = 'mobile_number'
      ) then
        execute '
          update enrollments
          set mobile = coalesce(mobile, mobile_number)
          where mobile is null
        ';
      end if;
    end
    $$;
  `);

  console.log("enrollment mobile column fixed");
}

async function down() {
  console.log("No down migration for enrollment mobile compatibility fix");
}

module.exports = { up, down };
