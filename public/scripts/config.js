/**
 * -----------------------------------------------------------------------------
 * Global App Configuration
 * -----------------------------------------------------------------------------
 * Detects environment (local vs production)
 * and exposes APP_CONFIG globally.
 * -----------------------------------------------------------------------------
 */

(function () {
  const hostname = window.location.hostname;

  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

  const CONFIG = {
    ENV: isLocal ? "local" : "production",
    API_BASE_URL: isLocal ? "http://localhost:8000/api" : "/api",
    BASE_URL: isLocal ? "http://localhost:3000" : window.location.origin,
  };

  window.APP_CONFIG = CONFIG;
})();
