/**
 * -----------------------------------------------------------------------------
 * File Router Module
 * -----------------------------------------------------------------------------
 * Internal HTTP file-based router.
 *
 * Description:
 * Dynamically maps incoming HTTP request paths to handler modules
 * resolved relative to the application root directory.
 *
 * Example:
 *   GET /users/list
 *     → <project_root>/users/list.js
 *
 * Each route module must export a function:
 *   module.exports = (req, res) => {}
 *
 * Responsibilities:
 * - Apply CORS policy
 * - Parse and attach query parameters to `req.query`
 * - Resolve and execute route handlers
 * - Provide centralized 404 fallback handling
 *
 * Security:
 * - Includes path normalization guard against traversal attempts
 * - Intended for internal or controlled environments
 *
 * Scope:
 * Internal use only.
 * -----------------------------------------------------------------------------
 */

"use strict";

const http = require("http");
const path = require("path");
const { notFound } = require("./response");
const applyCors = require("./cors");

/**
 * Absolute root directory for route resolution.
 * Typically resolves to project root.
 */
const ROOT_DIR = path.resolve(__dirname, "..");

/**
 * Internal HTTP router server.
 */
const router = http.createServer(async (req, res) => {
  try {
    // Apply CORS policy (may terminate request early)
    if (applyCors(req, res)) return;

    // Ensure host header exists
    if (!req.headers.host) {
      return notFound(res);
    }

    // Parse URL safely
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // Attach query parameters
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());

    // Normalize pathname (remove leading slashes)
    const pathname = parsedUrl.pathname.replace(/^\/+/, "");

    if (!pathname) {
      return notFound(res);
    }

    // Resolve absolute handler path
    const resolvedPath = path.resolve(ROOT_DIR, pathname + ".js");


    // 🔐 Prevent path traversal attacks
    if (!resolvedPath.startsWith(ROOT_DIR)) {
      console.warn("[Router] Path traversal attempt:", pathname);
      return notFound(res);
    }

    // Dynamically load handler
    let handler;
    try {
      delete require.cache[require.resolve(resolvedPath)];
      handler = require(resolvedPath);
    } catch (err) {
      // Module not found or invalid require
      console.error(err);
      return notFound(res);
    }

    // Ensure handler is executable
    if (typeof handler !== "function") {
      console.error("[Router] Invalid handler export:", resolvedPath);
      return notFound(res);
    }

    // Execute handler
    return handler(req, res);
  } catch (err) {
    // Structured internal logging
    console.error("[Router] Unexpected error:", {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });

    return notFound(res);
  }
});

module.exports = router;
