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

  function parseStoredUser(rawValue) {
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return null;
    }
  }

  function getStoredUser() {
    const sessionUser = parseStoredUser(window.sessionStorage.getItem("user"));

    if (sessionUser) {
      return sessionUser;
    }

    const legacyUser = parseStoredUser(window.localStorage.getItem("user"));

    if (legacyUser) {
      window.sessionStorage.setItem("user", JSON.stringify(legacyUser));
      window.localStorage.removeItem("user");
      return legacyUser;
    }

    return null;
  }

  function setStoredUser(user) {
    if (!user) {
      window.sessionStorage.removeItem("user");
      window.localStorage.removeItem("user");
      return;
    }

    const serializedUser = JSON.stringify(user);
    window.sessionStorage.setItem("user", serializedUser);
    window.localStorage.removeItem("user");
  }

  function clearStoredUser() {
    window.sessionStorage.removeItem("user");
    window.localStorage.removeItem("user");
  }

  window.getStoredUser = getStoredUser;
  window.setStoredUser = setStoredUser;
  window.clearStoredUser = clearStoredUser;

  const originalFetch = window.fetch.bind(window);

  function isApiRequest(input) {
    const url = input instanceof Request ? input.url : String(input || "");

    try {
      const resolvedUrl = new URL(url, window.location.origin);
      return resolvedUrl.pathname.startsWith("/api/");
    } catch (error) {
      return false;
    }
  }

  function shouldAttachSessionHeader(input) {
    const url = input instanceof Request ? input.url : String(input || "");

    try {
      const resolvedUrl = new URL(url, window.location.origin);
      return ![
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/session",
      ].includes(resolvedUrl.pathname);
    } catch (error) {
      return true;
    }
  }

  window.fetch = function patchedFetch(input, init) {
    if (!isApiRequest(input)) {
      return originalFetch(input, init);
    }

    const user = getStoredUser();
    const headers = new Headers(
      input instanceof Request ? input.headers : (init && init.headers) || {},
    );

    if (user?.session_id && shouldAttachSessionHeader(input)) {
      headers.set("x-session-id", user.session_id);
    }

    const nextInit = {
      ...(init || {}),
      headers,
    };

    if (input instanceof Request) {
      return originalFetch(new Request(input, nextInit));
    }

    return originalFetch(input, nextInit);
  };
})();
