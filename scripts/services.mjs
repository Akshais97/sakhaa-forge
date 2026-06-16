const action = process.argv[2];

if (action === "up") {
  console.log("Run Docker Compose with infra/docker/docker-compose.local.yml to start local PostgreSQL, Redis and S3-compatible storage.");
  console.log("Command: docker compose -f infra/docker/docker-compose.local.yml up -d");
} else if (action === "down") {
  console.log("Run Docker Compose with infra/docker/docker-compose.local.yml to stop local services.");
  console.log("Command: docker compose -f infra/docker/docker-compose.local.yml down");
} else {
  throw new Error("Usage: node scripts/services.mjs <up|down>");
}
