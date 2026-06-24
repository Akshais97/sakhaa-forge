import { readFileSync, existsSync } from "node:fs";

export function loadApiEnv() {
  return loadEnvFile("apps/api/.env");
}

function loadEnvFile(path) {
  const env = {};
  if (!existsSync(path)) {
    return env;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    env[key] = rawValue.trim().replace(/^"|"$/g, "");
  }
  return env;
}
