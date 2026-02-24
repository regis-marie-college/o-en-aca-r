/**
 * -----------------------------------------------------------------------------
 * Migration Runner Module
 * -----------------------------------------------------------------------------
 * Manual database migration executor for Supabase/PostgreSQL.
 *
 * Responsibilities:
 * - Load and execute a specific migration file
 * - Support directional execution (up | down)
 * - Validate migration existence and exported functions
 * - Provide controlled CLI-based migration workflow
 *
 * Execution:
 * npm run migrate -- <migration_name> [up|down]
 *
 * Examples:
 * npm run migrate -- create_users_table
 * npm run migrate -- create_users_table down
 *
 * Design Principles:
 * - Explicit execution (no auto-running all migrations)
 * - No hidden state or tracking
 * - Environment variables loaded via npm preload flag
 * - Fail-fast on missing files or invalid direction
 *
 * Scope:
 * Internal infrastructure tool.
 * Not intended for runtime usage inside application logic.
 * -----------------------------------------------------------------------------
 */

const path = require("path");
const fs = require("fs");

async function run() {
  const migrationName = process.argv[2];
  const direction = process.argv[3] || "up";

  if (!migrationName) {
    console.error("Please provide migration name.");
    console.log("Example:");
    console.log("npm run migrate -- create_users_table");
    console.log("npm run migrate -- create_users_table down");
    process.exit(1);
  }

  if (!["up", "down"].includes(direction)) {
    console.error("Direction must be 'up' or 'down'");
    process.exit(1);
  }

  const migrationPath = path.join(
    __dirname,
    "..",
    "migrations",
    `${migrationName}.js`,
  );

  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration "${migrationName}" not found.`);
    process.exit(1);
  }

  try {
    const migration = require(migrationPath);

    if (typeof migration[direction] !== "function") {
      console.error(`Migration does not export '${direction}' function.`);
      process.exit(1);
    }

    console.log(`🚀 Running migration: ${migrationName} (${direction})`);

    await migration[direction]();

    console.log("✅ Migration completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:");
    console.error(err);
    process.exit(1);
  }
}

run();
