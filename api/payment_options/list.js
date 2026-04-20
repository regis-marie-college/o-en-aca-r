const { okay, notAllowed } = require("../../lib/response");
const config = require("../../lib/config");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  return okay(res, config.payment_accounts);
};
