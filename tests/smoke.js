"use strict";

const modules = [
  "./lib/auth",
  "./lib/audit-log",
  "./api/auth/login",
  "./api/auth/logout",
  "./api/auth/register",
  "./api/auth/session",
  "./api/enrollments/create",
  "./api/enrollments/list",
  "./api/enrollments/read",
  "./api/enrollments/update-finance",
  "./api/enrollments/update-status",
  "./api/students/portal",
  "./api/student_records/create",
  "./api/student_records/import-excel",
  "./api/student_records/list",
  "./api/document_requests/create",
  "./api/document_requests/list",
  "./api/document_requests/read",
  "./api/document_requests/update",
  "./api/billings/create",
  "./api/billings/list",
  "./api/billings/update",
  "./api/treasury/statistics",
  "./api/treasury/transactions/list",
  "./api/treasury/transactions/read",
  "./api/users/create",
  "./api/users/list",
  "./api/users/read",
  "./api/users/update-role",
];

for (const modulePath of modules) {
  require(require("path").resolve(__dirname, "..", modulePath));
}

const { isTransientDatabaseError, sanitizeErrorMessage } = require("../lib/response");

const poolConnectTimeout = "timeout exceeded when trying to connect";

if (!isTransientDatabaseError(poolConnectTimeout)) {
  throw new Error("Pool connect timeout should be treated as transient");
}

if (sanitizeErrorMessage(poolConnectTimeout) !== "The server is busy right now. Please wait a few seconds and try again.") {
  throw new Error("Pool connect timeout should be sanitized for users");
}

console.log("Smoke test passed");
