const db = require("../services/supabase");

async function up() {
  await db.query(`
    create extension if not exists "pgcrypto";

    create table if not exists school_years (
      id uuid primary key default gen_random_uuid(),
      name text not null unique,
      is_active boolean not null default false,
      created_at timestamp default now(),
      updated_at timestamp default now()
    );
  `);

  await db.query(`
    insert into school_years (name, is_active)
    select distinct e.school_year, false
    from enrollments e
    where coalesce(e.school_year, '') <> ''
      and not exists (
        select 1
        from school_years sy
        where sy.name = e.school_year
      );
  `);

  await db.query(`
    update school_years
    set is_active = true,
        updated_at = now()
    where name = (
      select max(name)
      from school_years
    )
      and not exists (
        select 1
        from school_years
        where is_active = true
      );
  `);

  console.log("school_years table created");
}

async function down() {
  await db.query(`
    drop table if exists school_years;
  `);

  console.log("school_years table dropped");
}

module.exports = { up, down };
