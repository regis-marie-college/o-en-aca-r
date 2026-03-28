function auth() {
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) return;

  return user;
}
