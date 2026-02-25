const { okay, notAllowed } = require("../../lib/response");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return notAllowed(res);
  }

  const { index } = req.query;

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
    {
      id: "125",
      name: "Tony Tripulca",
      type: "teacher",
      email: "testing@gmail.com",
    },
  ];

  return okay(res, users[index || 0]);
};
