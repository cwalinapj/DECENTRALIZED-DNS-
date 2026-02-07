export type Report = {
  ok: boolean;
  time: number;
  manifest: any;
  baseline: any;
  after: any;
  notes: string[];
};

export function makeReport(input: Partial<Report>): Report {
  return {
    ok: input.ok ?? false,
    time: Math.floor(Date.now() / 1000),
    manifest: input.manifest ?? {},
    baseline: input.baseline ?? {},
    after: input.after ?? {},
    notes: input.notes ?? []
  };
}
