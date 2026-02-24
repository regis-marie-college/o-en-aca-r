const { okay, notAllowed } = require("../../lib/response");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  return okay(res, { id: "123" });
};
