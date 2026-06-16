import { spawnSync } from "node:child_process";

const commands = [
  ["node", ["scripts/generate-contracts.mjs"]],
  ["node", ["scripts/check-format.mjs"]],
  ["node", ["scripts/lint.mjs"]],
  ["node", ["scripts/typecheck.mjs"]],
  ["node", ["--test", "tests/**/*.test.mjs"]],
  ["node", ["packages/db/scripts/db-validate.mjs"]]
];

for (const [command, args] of commands) {
  const display = `${command} ${args.join(" ")}`;
  console.log(`\n> ${display}`);
  const result = spawnSync(command, args, {
    stdio: "inherit"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nV0-F0 verification passed.");
