import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL || "";

export function getQueue() {
  if (!redisUrl) return null;
  return new Queue("compat-jobs", { connection: { url: redisUrl } });
}

export type JobPayload = { job_id: string };
