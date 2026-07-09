import { spawn } from "node:child_process";

const services = [
  ["api", "node", ["apps/api/src/server.mjs"], { PORT: "3001" }],
  ["web", "pnpm", ["--filter", "@sakhaa-forge/web", "dev"], { PORT: process.env.PORT_WEB || "3005" }],
  ["queue", "node", ["workers/queue/src/processor.mjs"], {}]
];

const localAuthEnv = {
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || "local-dev-supabase-jwt-secret",
  V0_INTERNAL_WORKER_TOKEN: process.env.V0_INTERNAL_WORKER_TOKEN || "local-dev-worker-token"
};

for (const [name, command, args, env] of services) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...localAuthEnv,
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
