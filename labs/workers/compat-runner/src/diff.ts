export function diffSnapshots(
  baseline: { page: string; file: string }[],
  upgraded: { page: string; file: string }[]
) {
  const changes: { page: string; status: string; notes?: string }[] = [];
  const upgradedMap = new Map(upgraded.map((item) => [item.page, item.file]));

  for (const base of baseline) {
    if (!upgradedMap.has(base.page)) {
      changes.push({ page: base.page, status: 'missing', notes: 'No upgrade snapshot.' });
    } else {
      changes.push({ page: base.page, status: 'stub', notes: 'Snapshots captured (diff stub).' });
    }
  }

  return changes;
}
