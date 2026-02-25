const { okay, notAllowed } = require("../../lib/response");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const users = [
    {
      id: "123",
      name: "Tony Tripulca",
      type: "admin",
      email: "tony.tripulca@gmail.com",
    },
    {
      id: "124",
      name: "Tony Tripulca",
      type: "student",
      email: "test@gmail.com",
    },
  ];

  return okay(res, users);
};
