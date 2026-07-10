import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const tscPath = fileURLToPath(
  new URL("../node_modules/@typescript/native/bin/tsc", import.meta.url),
);

const child = spawn(process.execPath, [tscPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
