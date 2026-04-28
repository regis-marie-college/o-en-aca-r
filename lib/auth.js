"use strict";

const db = require("../services/supabase");
const { forbidden, unauthorized } = require("./response");

async function getAuthenticatedUser(req, executor = db) {
  const sessionId = String(req.headers["x-session-id"] || "").trim();

  if (!sessionId) {
    return null;
  }

  const sessionResult = await executor.query(
    `
    select *
    from sessions
    where id = $1
    limit 1
    `,
    [sessionId],
  );
  const session = sessionResult.rows[0] || null;

  if (!session) {
    return null;
  }

  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    await executor.query(`delete from sessions where id = $1`, [sessionId]).catch(() => null);
    return null;
  }

  const userResult = await executor.query(
    `
    select
      id,
      student_number,
      last_name,
      first_name,
      middle_name,
      username,
      email,
      mobile,
      type,
      status,
      created_at,
      updated_at
    from users
    where id = $1
      and deleted_at is null
    limit 1
    `,
    [session.user_id],
  );
  const user = userResult.rows[0] || null;

  if (!user) {
    return null;
  }

  if (String(user.status || "active").toLowerCase() !== "active") {
    return null;
  }

  if (shouldTouchSession(session)) {
    await executor.query(
      `
      update sessions
      set last_used_at = now()
      where id = $1
      `,
      [sessionId],
    ).catch(() => null);
  }

  return {
    ...user,
    session_id: session.id,
    session_expires_at: session.expires_at || null,
    session_last_used_at: session.last_used_at || null,
  };
}

function shouldTouchSession(session) {
  if (!Object.prototype.hasOwnProperty.call(session, "last_used_at")) {
    return false;
  }

  if (!session.last_used_at) {
    return true;
  }

  return Date.now() - new Date(session.last_used_at).getTime() > 5 * 60 * 1000;
}

async function requireAuth(req, res, allowedRoles = null, executor = db) {
  const user = await getAuthenticatedUser(req, executor);

  if (!user) {
    unauthorized(res, "Please sign in to continue");
    return null;
  }

  const normalizedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => String(role || "").trim().toLowerCase()).filter(Boolean)
    : allowedRoles
      ? [String(allowedRoles).trim().toLowerCase()]
      : [];

  const userRole = String(user.type || "").toLowerCase();
  const isSuperAdmin = userRole === "super_admin";

  if (normalizedRoles.length && !isSuperAdmin && !normalizedRoles.includes(userRole)) {
    forbidden(res, "You do not have permission to access this resource");
    return null;
  }

  req.auth = user;
  return user;
}

module.exports = {
  getAuthenticatedUser,
  requireAuth,
};
