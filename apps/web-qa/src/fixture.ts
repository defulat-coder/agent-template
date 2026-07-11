import { createWebQaServer } from "./server.js";
import { webQaTopology } from "./environment.js";

const { host, port } = webQaTopology.fixture;
const server = createWebQaServer();

server.listen(port, host, () => {
  console.info(`Web QA fixture listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
