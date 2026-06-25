import { spawnSync } from "node:child_process";

const commands = [
  ["node", ["scripts/generate-contracts.mjs"]],
  ["node", ["packages/db/scripts/db-generate.mjs"]],
  ["node", ["packages/db/scripts/db-migrate-dev.mjs"]],
  ["node", ["scripts/check-format.mjs"]],
  ["node", ["scripts/lint.mjs"]],
  ["node", ["scripts/typecheck.mjs"]],
  ["node", ["--test", "tests/**/*.test.mjs"]],
  ["node", ["--test", "tests/integration/prisma-runtime.test.mjs"], { V0_RUNTIME_DB_PROOF: "1" }],
  ["node", ["packages/db/scripts/db-validate.mjs"]]
];

for (const [command, args, extraEnv] of commands) {
  const display = `${command} ${args.join(" ")}`;
  console.log(`\n> ${display}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nV0-F0/F1/F2/F3/F4/F5/B1/B2/B3/P1/P2/P3/P4/P5 local verification passed.");
