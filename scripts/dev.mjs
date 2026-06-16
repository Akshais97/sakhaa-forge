import { spawn } from "node:child_process";

const services = [
  ["api", "node", ["apps/api/src/server.mjs"], { PORT: "3001" }],
  ["web", "node", ["apps/web/src/server.mjs"], { PORT: "3000" }],
  ["queue", "node", ["workers/queue/src/processor.mjs"], {}]
];

for (const [name, command, args, env] of services) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...env
    }
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`${name} exited with code ${code}`);
      process.exitCode = code;
    }
  });
}
