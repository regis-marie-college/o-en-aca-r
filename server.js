const staticServer = require("./lib/static");
const apiRouter = require("./lib/router");
const config = require("./lib/config");

function startServer(server, { label, port }) {
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.error(
        `[${label}] Port ${port} is already in use. ` +
          `Another app or older server instance is already using http://localhost:${port}.`,
      );
      console.error(
        `[${label}] Close the other process or free the port, then save a file or restart the dev server.`,
      );
      return;
    }

    console.error(`[${label}] Failed to start:`, error);
  });

  server.listen(port, () => {
    console.log(`${label} server running at http://localhost:${port}`);
  });
}

startServer(staticServer, {
  label: "Static",
  port: config.port.static,
});

startServer(apiRouter, {
  label: "API",
  port: config.port.api,
});
