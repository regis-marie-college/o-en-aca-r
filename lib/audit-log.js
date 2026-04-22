async function writeAuditLog(db, entry) {
  const {
    entity_type,
    entity_id,
    action,
    actor,
    actor_type,
    details,
  } = entry || {};

  if (!entity_type || !entity_id || !action) {
    return null;
  }

  try {
    const result = await db.query(
      `
      insert into audit_logs (
        entity_type,
        entity_id,
        action,
        actor,
        actor_type,
        details
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
      returning *
      `,
      [
        entity_type,
        String(entity_id),
        action,
        actor || null,
        actor_type || null,
        JSON.stringify(details || {}),
      ],
    );

    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === "42P01") {
      return null;
    }

    throw error;
  }
}

async function readAuditLogs(db, { entityType, entityId }) {
  if (!entityType || !entityId) {
    return [];
  }

  try {
    const result = await db.query(
      `
      select *
      from audit_logs
      where entity_type = $1
        and entity_id = $2
      order by created_at desc
      `,
      [String(entityType), String(entityId)],
    );

    return result.rows;
  } catch (error) {
    if (error?.code === "42P01") {
      return [];
    }

    throw error;
  }
}

module.exports = {
  readAuditLogs,
  writeAuditLog,
};
