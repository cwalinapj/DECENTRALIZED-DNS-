import { inspectContainer, listContainers } from "./docker.js";

export type ServiceStatus = {
  name: string;
  containerId?: string;
  state?: string;    // running/exited
  health?: string;   // healthy/unhealthy/starting/none
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

function findByNameHint(containers: any[], hint: string): any | undefined {
  // We set container_name to ddns-<service>, so we match that first.
  return containers.find(c => (c.Names || []).some((n: string) => n.includes(`ddns-${hint}`) || n.includes(hint)));
}

export async function getServiceStatuses(serviceNames: string[]): Promise<ServiceStatus[]> {
  const containers = await listContainers();
  const out: ServiceStatus[] = [];

  for (const svc of serviceNames) {
    const match = findByNameHint(containers, svc);
    if (!match) {
      out.push({ name: svc, error: "container not found" });
      continue;
    }

    const insp = await inspectContainer(match.Id);
    const st = insp?.State;

    out.push({
      name: svc,
      containerId: match.Id,
      state: st?.Status,
      health: st?.Health?.Status ?? "none",
      exitCode: st?.ExitCode,
      startedAt: st?.StartedAt,
      finishedAt: st?.FinishedAt,
      error: st?.Error || undefined
    });
  }

  return out;
}
