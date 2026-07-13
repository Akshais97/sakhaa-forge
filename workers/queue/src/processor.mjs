import { processQueueWakeUp } from "./brand-crawl-processor.mjs";

const intervalMs = Number.parseInt(process.env.QUEUE_HEARTBEAT_MS || "5000", 10);
const oneShotJobId = process.env.V0_BRAND_CRAWL_JOB_ID;
const redisUrl = process.env.REDIS_URL;

console.log("Sakhaa Forge queue processor started.");

if (oneShotJobId) {
  const result = await processQueueWakeUp({ id: oneShotJobId });
  if (!result.ok) {
    console.error(`brand_crawl_failed:${result.problem?.code ?? "unknown"}`);
    process.exitCode = 1;
  }
} else if (redisUrl) {
  const { Worker } = await import("bullmq");
  const queueName = `${process.env.QUEUE_PREFIX || "v0-local"}:cpu`;
  const worker = new Worker(
    queueName,
    async (wakeUp) => {
      const result = await processQueueWakeUp(wakeUp.data ?? { id: wakeUp.id });
      if (!result.ok) throw new Error(result.problem?.code ?? "brand_crawl_failed");
      return { jobId: wakeUp.data?.jobId ?? wakeUp.id, status: "completed" };
    },
    { connection: redisConnection(redisUrl), concurrency: Number.parseInt(process.env.QUEUE_CPU_CONCURRENCY || "2", 10) }
  );
  worker.on("failed", (wakeUp, error) => console.error(`queue_wakeup_failed:${wakeUp?.id ?? "unknown"}:${error.message}`));
  console.log(`Listening for opaque BullMQ wake-up IDs on ${queueName}.`);
} else {
  console.log("No Redis connection is configured. Set V0_BRAND_CRAWL_JOB_ID for a one-shot local run.");
  setInterval(() => {
    console.log("queue_processor_heartbeat");
  }, intervalMs);
}

function redisConnection(value) {
  const parsed = new URL(value);
  const database = Number.parseInt(parsed.pathname.replace(/^\//, "") || "0", 10);
  return {
    host: parsed.hostname,
    port: Number.parseInt(parsed.port || (parsed.protocol === "rediss:" ? "6380" : "6379"), 10),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: Number.isInteger(database) ? database : 0,
    tls: parsed.protocol === "rediss:" ? {} : undefined
  };
}
