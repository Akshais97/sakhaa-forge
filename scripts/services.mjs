import {
  ensureLocalStorageSimulator,
  getLocalStorageSimulatorConfig
} from "../packages/config/src/storage.mjs";

const action = process.argv[2];

if (action === "up") {
  const storage = await ensureLocalStorageSimulator(
    getLocalStorageSimulatorConfig(process.env)
  );

  console.log("Local storage simulator ready.");
  console.log(`Root: ${storage.root}`);
  console.log(`Quarantine: ${storage.quarantinePath}`);
  console.log(`Clean media: ${storage.cleanMediaPath}`);
  console.log(`Private artifacts: ${storage.privateArtifactsPath}`);
  console.log("Run Docker Compose with infra/docker/docker-compose.local.yml to start local PostgreSQL and Redis.");
  console.log("Command: docker compose -f infra/docker/docker-compose.local.yml up -d");
} else if (action === "down") {
  console.log("Run Docker Compose with infra/docker/docker-compose.local.yml to stop local PostgreSQL and Redis.");
  console.log("Command: docker compose -f infra/docker/docker-compose.local.yml down");
  console.log("Local storage simulator directories are left intact for retained evidence.");
} else {
  throw new Error("Usage: node scripts/services.mjs <up|down>");
}
