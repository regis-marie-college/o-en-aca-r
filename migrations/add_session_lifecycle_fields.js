const db = require("../services/supabase");

async function up() {
  await db.query(`
    alter table sessions
      add column if not exists created_at timestamp default now(),
      add column if not exists last_used_at timestamp default now(),
      add column if not exists expires_at timestamp default (now() + interval '30 days');
  `);

  await db.query(`
    update sessions
    set created_at = coalesce(created_at, now()),
        last_used_at = coalesce(last_used_at, now()),
        expires_at = coalesce(expires_at, now() + interval '30 days');
  `);

  await db.query(`
    create index if not exists idx_sessions_user_id on sessions (user_id);
  `);

  await db.query(`
    create index if not exists idx_sessions_expires_at on sessions (expires_at);
  `);

  console.log("session lifecycle fields added");
}

async function down() {
  await db.query(`
    drop index if exists idx_sessions_expires_at;
  `);

  await db.query(`
    drop index if exists idx_sessions_user_id;
  `);

  await db.query(`
    alter table sessions
      drop column if exists expires_at,
      drop column if exists last_used_at,
      drop column if exists created_at;
  `);

  console.log("session lifecycle fields removed");
}

module.exports = { up, down };
