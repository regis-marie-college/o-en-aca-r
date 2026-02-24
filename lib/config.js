/**
 * -----------------------------------------------------------------------------
 * Configuration Module
 * -----------------------------------------------------------------------------
 * Centralized environment configuration loader.
 *
 * Responsibilities:
 * - Load environment variables from .env
 * - Provide typed and normalized configuration
 * - Prevent direct process.env usage across the codebase
 *
 * Scope:
 * Internal use only.
 * -----------------------------------------------------------------------------
 */

"use strict";

const path = require("path");

require("dotenv").config({
  path: path.resolve(process.cwd(), ".env"),
});

/**
 * Normalized application configuration.
 */
const config = {
  env: process.env.NODE_ENV || "development",
  port: {
    static: Number(process.env.STATIC_PORT) || 3000,
    api: Number(process.env.API_PORT) || 8000,
  },
};

module.exports = config;
