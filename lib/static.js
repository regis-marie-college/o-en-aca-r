/**
 * -----------------------------------------------------------------------------
 * Static File Server Module
 * -----------------------------------------------------------------------------
 * Internal static asset server for Node.js HTTP applications.
 *
 * Description:
 * Serves files from the designated `public` directory.
 * Intended for internal tools, dashboards, and controlled environments.
 *
 * Responsibilities:
 * - Resolve requested file paths relative to public directory
 * - Determine appropriate MIME type
 * - Serve static file content
 * - Provide centralized 404 fallback for missing assets
 *
 * Design Principles:
 * - Zero external dependencies
 * - Lightweight and framework-agnostic
 * - Suitable for internal services and non-public deployments
 *
 * Security Notice:
 * - Includes basic path normalization to prevent traversal attacks
 * - Not optimized for high-throughput production traffic
 * - Consider reverse proxy (NGINX) for public deployments
 *
 * Scope:
 * Internal use only.
 * -----------------------------------------------------------------------------
 */

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { send, notFound } = require("./response");

/**
 * Absolute path to public directory.
 */
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

/**
 * Supported MIME types.
 */
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

/**
 * Static file HTTP server.
 */
const staticServer = http.createServer((req, res) => {
  try {
    // Default to index.html for root requests
    const requestedPath =
      req.url === "/" ? "index.html" : req.url.replace(/^\/+/, "");

    // Resolve absolute file path
    const resolvedPath = path.resolve(PUBLIC_DIR, requestedPath);

    // 🔐 Prevent path traversal
    if (!resolvedPath.startsWith(PUBLIC_DIR)) {
      return notFound(res, "Static file not found");
    }

    const ext = path.extname(resolvedPath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(resolvedPath, (err, content) => {
      if (err) {
        return notFound(res, "Static file not found");
      }

      send(res, 200, content, contentType);
    });
  } catch (err) {
    console.error("[StaticServer] Unexpected error:", {
      message: err.message,
      stack: err.stack,
      url: req.url,
    });

    return notFound(res, "Static file not found");
  }
});

module.exports = staticServer;
