import type { ControlPlaneState, JobRecord } from "../types.js";

export function listJobs(state: ControlPlaneState): JobRecord[] {
  return Array.from(state.jobs.values());
}

export function getJob(state: ControlPlaneState, jobId: string): JobRecord | undefined {
  return state.jobs.get(jobId);
}

export function createJob(state: ControlPlaneState, input: Partial<JobRecord>): JobRecord {
  const jobId = input.job_id || `job_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const job: JobRecord = {
    job_id: jobId,
    type: input.type || "generic",
    status: "queued",
    created_at: now,
    updated_at: now,
    payload: input.payload
  };
  state.jobs.set(jobId, job);
  return job;
}

export function completeJob(state: ControlPlaneState, jobId: string, result?: Record<string, unknown>): JobRecord | undefined {
  const job = state.jobs.get(jobId);
  if (!job) return undefined;
  job.status = "completed";
  job.updated_at = new Date().toISOString();
  job.result = result;
  return job;
}
