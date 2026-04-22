const { okay, notAllowed, badRequest } = require("../../lib/response");
const { getAuthenticatedUser } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  try {
    const user = await getAuthenticatedUser(req);
    return okay(res, {
      auth: Boolean(user),
      user,
    });
  } catch (err) {
    console.error(err);
    return badRequest(res, err.message);
  }
};
