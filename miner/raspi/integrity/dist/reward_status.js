export function buildRewardStatus(snapshot) {
    const eligible = snapshot.ok;
    const reason = eligible ? "integrity_ok" : "integrity_failed";
    return {
        time: snapshot.time,
        eligible,
        reason,
        components: snapshot.components.map(c => ({ component: c.component, ok: c.ok, problems: c.problems }))
    };
}
