import { createWebQaServer } from "./server.js";

const host = "127.0.0.1";
const port = 14_100;
const server = createWebQaServer();

server.listen(port, host, () => {
  console.info(`Web QA fixture listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
