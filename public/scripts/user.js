function auth() {
  const user = typeof window.getStoredUser === "function"
    ? window.getStoredUser()
    : JSON.parse(sessionStorage.getItem("user") || localStorage.getItem("user") || "null");

  if (!user) return;

  return user;
}

window.auth = auth;
