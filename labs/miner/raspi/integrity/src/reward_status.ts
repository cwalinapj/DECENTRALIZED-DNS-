import type { IntegritySnapshot } from "./checks.js";

export type RewardStatus = {
  time: number;
  eligible: boolean;
  reason: string;
  components: Array<{ component: string; ok: boolean; problems: string[] }>;
};

export function buildRewardStatus(snapshot: IntegritySnapshot): RewardStatus {
  const eligible = snapshot.ok;
  const reason = eligible ? "integrity_ok" : "integrity_failed";
  return {
    time: snapshot.time,
    eligible,
    reason,
    components: snapshot.components.map(c => ({ component: c.component, ok: c.ok, problems: c.problems }))
  };
}
