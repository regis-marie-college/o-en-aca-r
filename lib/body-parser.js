/**
 * -----------------------------------------------------------------------------
 * JSON Body Parser Module
 * -----------------------------------------------------------------------------
 * Internal JSON request body parser for Node.js HTTP servers.
 *
 * Description:
 * Consumes the incoming readable stream from a Node.js
 * `http.IncomingMessage` instance and parses the payload as JSON.
 *
 * Responsibilities:
 * - Accumulate incoming data chunks
 * - Parse JSON payload safely
 * - Gracefully handle empty request bodies
 * - Surface parsing and stream errors
 *
 * Design Principles:
 * - Zero external dependencies
 * - Promise-based API
 * - Lightweight and framework-agnostic
 * - Suitable for internal microservices and controlled environments
 *
 * Limitations:
 * - Supports JSON payloads only
 * - Does not validate Content-Type headers
 * - Does not enforce payload size limits
 * - Not hardened for large or untrusted payload sources
 *
 * Security Notice:
 * For public-facing services, consider:
 * - Enforcing request size limits
 * - Validating Content-Type headers
 * - Implementing request timeouts
 *
 * Scope:
 * Internal use only.
 * -----------------------------------------------------------------------------
 */

"use strict";

/**
 * Parses the incoming HTTP request body as JSON.
 *
 * @param {import("http").IncomingMessage} req
 *        Node.js HTTP request object.
 *
 * @returns {Promise<Object>}
 *          Resolves with:
 *          - Parsed JSON object when valid JSON is provided.
 *          - Empty object `{}` if no body is sent.
 *
 * @throws {Error}
 *          - "Invalid JSON" when parsing fails.
 *          - Stream errors emitted by the request.
 */
function bodyParser(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    // Accumulate data chunks from the request stream
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    // Triggered once the full request body has been received
    req.on("end", () => {
      if (!body) {
        return resolve({});
      }

      try {
        const parsed = JSON.parse(body);
        return resolve(parsed);
      } catch (err) {
        console.error(err);
        return reject(new Error("Invalid JSON"));
      }
    });

    // Handle lower-level stream errors
    req.on("error", (err) => {
      return reject(err);
    });
  });
}

module.exports = {
  bodyParser,
};
