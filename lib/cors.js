/**
 * -----------------------------------------------------------------------------
 * CORS Middleware Module
 * -----------------------------------------------------------------------------
 * Internal Cross-Origin Resource Sharing (CORS) handler
 * for Node.js HTTP servers.
 *
 * Description:
 * Applies standard CORS headers to outgoing responses and
 * handles preflight (OPTIONS) requests.
 *
 * Responsibilities:
 * - Set Access-Control-Allow-* headers
 * - Short-circuit preflight requests
 * - Prevent further request processing when applicable
 *
 * Design Principles:
 * - Zero external dependencies
 * - Minimal and framework-agnostic
 * - Suitable for internal APIs and controlled environments
 *
 * Current Policy:
 * - Allows all origins ("*")
 * - Allows common HTTP methods
 * - Allows Content-Type and Authorization headers
 *
 * Security Notice:
 * - Wildcard origin ("*") should NOT be used for sensitive
 *   public-facing APIs without additional validation.
 * - Consider restricting allowed origins in production.
 *
 * Scope:
 * Internal use only.
 * -----------------------------------------------------------------------------
 */

"use strict";

/**
 * Applies CORS headers to the response.
 *
 * @param {import("http").IncomingMessage} req
 *        Node.js HTTP request object.
 *
 * @param {import("http").ServerResponse} res
 *        Node.js HTTP response object.
 *
 * @returns {boolean}
 *          - Returns `true` if the request has been fully handled
 *            (e.g., preflight OPTIONS).
 *          - Returns `false` if request processing should continue.
 */
function applyCors(req, res) {
  // Allow all origins (adjust for production if needed)
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Allowed HTTP methods
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );

  // Allowed request headers
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Session-Id",
  );

  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    res.writeHead(204); // No Content
    res.end();
    return true; // Stop further request handling
  }

  return false;
}

module.exports = applyCors;
