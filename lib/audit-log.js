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
}

module.exports = {
  writeAuditLog,
};
