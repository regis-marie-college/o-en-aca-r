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
  supabase: {
    url: process.env.SUPABASE_URL || "",
    db_url: process.env.SUPABASE_DB_URL || "",
    role_key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },
  payment_accounts: [
    {
      key: "gcash",
      label: "GCash",
      account_name: process.env.PAYMENT_GCASH_ACCOUNT_NAME || "",
      account_number: process.env.PAYMENT_GCASH_ACCOUNT_NUMBER || "",
    },
    {
      key: "bpi",
      label: "BPI",
      account_name: process.env.PAYMENT_BPI_ACCOUNT_NAME || "",
      account_number: process.env.PAYMENT_BPI_ACCOUNT_NUMBER || "",
    },
    {
      key: "rcbc",
      label: "RCBC",
      account_name: process.env.PAYMENT_RCBC_ACCOUNT_NAME || "",
      account_number: process.env.PAYMENT_RCBC_ACCOUNT_NUMBER || "",
    },
    {
      key: "metrobank",
      label: "Metrobank",
      account_name: process.env.PAYMENT_METROBANK_ACCOUNT_NAME || "",
      account_number: process.env.PAYMENT_METROBANK_ACCOUNT_NUMBER || "",
    },
  ],
};

module.exports = config;
