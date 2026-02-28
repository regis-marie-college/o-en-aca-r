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
const fs = require("fs");
const { notFound } = require("./response");
const applyCors = require("./cors");

const ROOT_DIR = path.resolve(__dirname, "..");

const router = http.createServer(async (req, res) => {
  try {
    if (applyCors(req, res)) return;

    if (!req.headers.host) {
      return notFound(res);
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    req.params = {}; // 🔥 add params support

    let pathname = parsedUrl.pathname.replace(/^\/+/, "");

    if (!pathname) {
      return notFound(res);
    }

    const segments = pathname.split("/").filter(Boolean);

    let resolvedPath;

    // -------------------------------------------------
    // 🔥 Dynamic API Route Support
    // Example:
    // /api/users/UUID
    // -------------------------------------------------
    if (segments.length === 3 && segments[0] === "api") {
      const [api, resource, id] = segments;

      req.params.id = id;

      // 1️⃣ Try Vercel-style: api/users/[id].js
      const dynamicFile = path.resolve(ROOT_DIR, `api/${resource}/[id].js`);

      // 2️⃣ Fallback: api/users/read.js
      const fallbackFile = path.resolve(ROOT_DIR, `api/${resource}/read.js`);

      if (fs.existsSync(dynamicFile)) {
        resolvedPath = dynamicFile;
      } else if (fs.existsSync(fallbackFile)) {
        resolvedPath = fallbackFile;
      } else {
        return notFound(res);
      }
    } else {
      // Normal file-based routing
      resolvedPath = path.resolve(ROOT_DIR, pathname + ".js");
    }

    // 🔐 Prevent path traversal
    if (!resolvedPath.startsWith(ROOT_DIR)) {
      console.warn("[Router] Path traversal attempt:", pathname);
      return notFound(res);
    }

    let handler;
    try {
      delete require.cache[require.resolve(resolvedPath)];
      handler = require(resolvedPath);
    } catch (err) {
      console.error(err);
      return notFound(res);
    }

    if (typeof handler !== "function") {
      console.error("[Router] Invalid handler export:", resolvedPath);
      return notFound(res);
    }

    return handler(req, res);
  } catch (err) {
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
