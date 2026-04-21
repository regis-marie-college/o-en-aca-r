const db = require("../services/supabase");

function buildArchivedEmail(email, userId) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const safeId = String(userId || "").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  const [localPart, domainPart] = normalizedEmail.split("@");

  if (!localPart || !domainPart) {
    return `archived.${safeId}@dedup.local`;
  }

  return `${localPart}+archived-${safeId}@${domainPart}`;
}

function getTypePriority(type) {
  switch (String(type || "").trim().toLowerCase()) {
    case "admin":
      return 1;
    case "treasury":
      return 2;
    case "records":
      return 3;
    case "student":
      return 4;
    default:
      return 9;
  }
}

async function up() {
  const duplicatesResult = await db.query(`
    select lower(email) as normalized_email
    from users
    where coalesce(email, '') <> ''
      and deleted_at is null
    group by lower(email)
    having count(*) > 1
    order by lower(email) asc
  `);

  for (const duplicate of duplicatesResult.rows) {
    const usersResult = await db.query(
      `
      select id, email, type, created_at, updated_at, deleted_at
      from users
      where lower(email) = $1
      order by created_at desc
      `,
      [duplicate.normalized_email],
    );

    const rankedUsers = [...usersResult.rows].sort((left, right) => {
      const typeDiff = getTypePriority(left.type) - getTypePriority(right.type);
      if (typeDiff !== 0) return typeDiff;

      const leftUpdated = new Date(left.updated_at || left.created_at || 0).getTime();
      const rightUpdated = new Date(right.updated_at || right.created_at || 0).getTime();
      return rightUpdated - leftUpdated;
    });

    const keeper = rankedUsers[0];
    const archivedUsers = rankedUsers.slice(1);

    for (const user of archivedUsers) {
      const archivedEmail = buildArchivedEmail(user.email, user.id);

      await db.query(
        `
        update users
        set email = $2,
            username = case when username = $3 then $2 else username end,
            deleted_at = coalesce(deleted_at, now()),
            updated_at = now()
        where id = $1
        `,
        [user.id, archivedEmail, user.email],
      );
    }

    await db.query(
      `
      update users
      set email = $2,
          updated_at = now()
      where id = $1
      `,
      [keeper.id, duplicate.normalized_email],
    );
  }

  await db.query(`
    create unique index if not exists idx_users_email_unique_active
    on users (lower(email))
    where deleted_at is null and coalesce(email, '') <> '';
  `);

  console.log("users deduplicated and unique active email enforced");
}

async function down() {
  await db.query(`
    drop index if exists idx_users_email_unique_active;
  `);

  console.log("unique active email protection removed");
}

module.exports = { up, down };
