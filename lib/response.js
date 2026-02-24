/**
 * -----------------------------------------------------------------------------
 * HTTP Response Utility Module
 * -----------------------------------------------------------------------------
 * Internal response helper utilities for Node.js HTTP servers.
 *
 * Description:
 * Provides standardized helper functions for sending HTTP responses
 * with consistent structure and content-type handling.
 *
 * Responsibilities:
 * - Centralize response writing logic
 * - Standardize JSON response formatting
 * - Provide common HTTP status helpers
 *
 * Design Principles:
 * - Zero external dependencies
 * - Framework-agnostic
 * - Consistent response structure
 * - Suitable for internal microservices and controlled environments
 *
 * Default Behavior:
 * - JSON responses use `application/json`
 * - Non-JSON content types are sent as-is
 * - Error responses follow `{ error: string }` structure
 *
 * Scope:
 * Internal use only.
 * -----------------------------------------------------------------------------
 */

"use strict";

/**
 * Sends an HTTP response.
 *
 * @param {import("http").ServerResponse} res
 *        Node.js HTTP response object.
 *
 * @param {number} statusCode
 *        HTTP status code.
 *
 * @param {*} data
 *        Response payload. Automatically stringified if JSON.
 *
 * @param {string} [contentType="application/json"]
 *        Content-Type header value.
 */
function send(res, statusCode, data, contentType = "application/json") {
  res.writeHead(statusCode, { "Content-Type": contentType });

  if (contentType === "application/json") {
    res.end(JSON.stringify(data));
  } else {
    res.end(data);
  }
}

/**
 * Sends HTTP 200 OK response.
 *
 * @param {import("http").ServerResponse} res
 * @param {*} data
 */
function okay(res, data) {
  send(res, 200, data);
}

/**
 * Sends HTTP 404 Not Found response.
 *
 * @param {import("http").ServerResponse} res
 * @param {string} [message="Not Found"]
 */
function notFound(res, message = "Not Found") {
  send(res, 404, { error: message });
}

/**
 * Sends HTTP 400 Bad Request response.
 *
 * @param {import("http").ServerResponse} res
 * @param {string} [message="Bad Request"]
 */
function badRequest(res, message = "Bad Request") {
  send(res, 400, { error: message });
}

/**
 * Sends HTTP 405 Method Not Allowed response.
 *
 * @param {import("http").ServerResponse} res
 * @param {string} [message="Method Not Allowed"]
 */
function notAllowed(res, message = "Method Not Allowed") {
  send(res, 405, { error: message });
}

module.exports = {
  send,
  okay,
  notFound,
  badRequest,
  notAllowed,
};
