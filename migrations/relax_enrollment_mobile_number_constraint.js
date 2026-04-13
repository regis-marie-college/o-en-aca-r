const db = require("../services/supabase");

async function up() {
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
          set mobile_number = coalesce(mobile_number, mobile)
          where mobile_number is null
        ';

        execute '
          alter table enrollments
          alter column mobile_number drop not null
        ';
      end if;
    end
    $$;
  `);

  console.log("enrollment mobile_number constraint relaxed");
}

async function down() {
  console.log("No down migration for enrollment mobile_number compatibility fix");
}

module.exports = { up, down };
