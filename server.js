const staticServer = require("./lib/static");
const apiRouter = require("./lib/router");
const config = require("./lib/config");

staticServer.listen(config.port.static, () => {
  console.log(
    `Static server running at http://localhost:${config.port.static}`,
  );
});

apiRouter.listen(config.port.api, () => {
  console.log(`API server running at http://localhost:${config.port.api}`);
});
