"use strict";

const ACTIVE_ENROLLMENT_STATUSES = [
  "Pending",
  "Pending Evaluation",
  "Payment Submitted",
  "Approved",
];

const ALLOWED_REQUEST_TYPES = [
  "New Student",
  "Walk-in Student",
  "Transferee",
  "Irregular Student",
  "Returning Student",
];
const ALLOWED_ENROLLMENT_STATUSES = [
  "Pending",
  "Pending Evaluation",
  "Payment Submitted",
  "Approved",
  "Declined",
];
const enrollmentColumnCache = new Map();

function normalizeRequestType(value) {
  const text = String(value || "").trim().toLowerCase();

  if (text === "returning student" || text === "returning_student") {
    return "Returning Student";
  }

  if (
    text === "walk-in student" ||
    text === "walk in student" ||
    text === "walk_in_student"
  ) {
    return "Walk-in Student";
  }

  if (text === "transferee") {
    return "Transferee";
  }

  if (
    text === "irregular" ||
    text === "irregular student" ||
    text === "irregular_student"
  ) {
    return "Irregular Student";
  }

  return "New Student";
}

function normalizeEnrollmentStatus(value) {
  const text = String(value || "").trim().toLowerCase();

  switch (text) {
    case "declined":
    case "denied":
      return "Declined";
    case "approved":
      return "Approved";
    case "payment submitted":
      return "Payment Submitted";
    case "pending evaluation":
      return "Pending Evaluation";
    case "pending":
    default:
      return "Pending";
  }
}

function isAllowedRequestType(value) {
  return ALLOWED_REQUEST_TYPES.includes(value);
}

function isAllowedEnrollmentStatus(value) {
  return ALLOWED_ENROLLMENT_STATUSES.includes(value);
}

function isActiveEnrollmentStatus(value) {
  return ACTIVE_ENROLLMENT_STATUSES.includes(normalizeEnrollmentStatus(value));
}

function calculateCourseTotals(courses) {
  return (Array.isArray(courses) ? courses : []).reduce(
    (summary, course) => {
      summary.totalUnits += Number(course.units || 0);
      summary.totalAmount += Number(course.amount || 0);
      return summary;
    },
    { totalUnits: 0, totalAmount: 0 },
  );
}

function validateFinancialTotals({ miscFee, totalUnits, totalAmount }) {
  if (Number(miscFee) < 0 || Number.isNaN(Number(miscFee))) {
    throw new Error("Misc fee must be a valid non-negative amount");
  }

  if (Number(totalUnits) < 0 || Number.isNaN(Number(totalUnits))) {
    throw new Error("Total units must be a valid non-negative number");
  }

  if (Number(totalAmount) < 0 || Number.isNaN(Number(totalAmount))) {
    throw new Error("Total amount must be a valid non-negative number");
  }
}

async function hasEnrollmentColumn(executor, columnName) {
  if (enrollmentColumnCache.has(columnName)) {
    return enrollmentColumnCache.get(columnName);
  }

  const result = await executor.query(
    `
    select 1
    from information_schema.columns
    where table_name = 'enrollments'
      and column_name = $1
    limit 1
    `,
    [columnName],
  );

  const hasColumn = result.rows.length > 0;
  enrollmentColumnCache.set(columnName, hasColumn);

  return hasColumn;
}

async function ensureEnrollmentEvaluationColumns(executor) {
  await executor.query(`
    alter table enrollments
      add column if not exists admin_notes text,
      add column if not exists decline_reason text,
      add column if not exists evaluated_by text,
      add column if not exists evaluated_at timestamp;
  `);
}

async function assertNoActiveEnrollmentRequest({
  executor,
  email,
  studentId,
  schoolYear,
  excludeEnrollmentId = null,
}) {
  const hasStudentIdColumn = await hasEnrollmentColumn(executor, "student_id");
  const hasSchoolYearColumn = await hasEnrollmentColumn(executor, "school_year");

  const conditions = [
    "deleted_at is null",
    "coalesce(status, 'Pending') <> 'Declined'",
    "($1::uuid is null or id <> $1)",
  ];
  const params = [excludeEnrollmentId];
  let nextParamIndex = params.length + 1;

  if (hasSchoolYearColumn) {
    conditions.push(`school_year = $${nextParamIndex}`);
    params.push(schoolYear);
    nextParamIndex += 1;
  }

  const identityChecks = [`lower(email) = lower($${nextParamIndex})`];
  params.push(email);
  nextParamIndex += 1;

  if (hasStudentIdColumn && studentId) {
    identityChecks.unshift(`student_id = $${nextParamIndex}`);
    params.push(studentId);
    nextParamIndex += 1;
  }

  conditions.push(`(${identityChecks.join(" or ")})`);

  const result = await executor.query(
    `
    select id, status
    from enrollments
    where ${conditions.join("\n      and ")}
    order by created_at desc
    limit 1
    `,
    params,
  );

  if (result.rows.length) {
    throw new Error(
      `You already have an active enrollment request for school year ${schoolYear}.`,
    );
  }
}

function canTransitionEnrollment(currentStatus, nextStatus, requestType) {
  const normalizedCurrent = normalizeEnrollmentStatus(currentStatus);
  const normalizedNext = normalizeEnrollmentStatus(nextStatus);
  const normalizedRequestType = normalizeRequestType(requestType);

  if (normalizedCurrent === normalizedNext) {
    return true;
  }

  if (normalizedCurrent === "Declined" && normalizedNext !== "Declined") {
    return false;
  }

  if (normalizedCurrent === "Approved" && normalizedNext !== "Approved") {
    return false;
  }

  if (normalizedRequestType === "Returning Student") {
    return [
      "Pending Evaluation->Approved",
      "Pending Evaluation->Declined",
      "Pending Evaluation->Pending Evaluation",
    ].includes(`${normalizedCurrent}->${normalizedNext}`);
  }

  return [
    "Pending->Payment Submitted",
    "Pending->Approved",
    "Pending->Declined",
    "Payment Submitted->Approved",
    "Payment Submitted->Declined",
    "Payment Submitted->Payment Submitted",
  ].includes(`${normalizedCurrent}->${normalizedNext}`);
}

function assertValidStatusTransition(currentStatus, nextStatus, requestType) {
  const normalizedNext = normalizeEnrollmentStatus(nextStatus);

  if (!isAllowedEnrollmentStatus(normalizedNext)) {
    throw new Error("Invalid enrollment status");
  }

  if (!canTransitionEnrollment(currentStatus, normalizedNext, requestType)) {
    throw new Error(
      `Cannot change enrollment status from ${normalizeEnrollmentStatus(
        currentStatus,
      )} to ${normalizedNext}.`,
    );
  }
}

module.exports = {
  ACTIVE_ENROLLMENT_STATUSES,
  ALLOWED_ENROLLMENT_STATUSES,
  ALLOWED_REQUEST_TYPES,
  assertNoActiveEnrollmentRequest,
  assertValidStatusTransition,
  calculateCourseTotals,
  ensureEnrollmentEvaluationColumns,
  isActiveEnrollmentStatus,
  isAllowedEnrollmentStatus,
  isAllowedRequestType,
  normalizeEnrollmentStatus,
  normalizeRequestType,
  validateFinancialTotals,
};
