/** Snapshot/data quality checks (Approach 5) - improve inputs before logic. */
export interface QualityIssue { severity: 'info' | 'warning' | 'critical'; code: string; message: string; path?: string }

function rec(v: unknown): Record<string, any> { return v && typeof v === 'object' && !Array.isArray(v) ? v as any : {}; }
function data(snap: any): any { return snap?.data ?? snap?.derived ?? snap?.state ?? snap?.world ?? snap ?? {}; }

export function assessSnapshotQuality(snapshot: any): { ok: boolean; score: number; issues: QualityIssue[]; summary: Record<string, unknown> } {
  const issues: QualityIssue[] = [];
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, score: 0, issues: [{ severity: 'critical', code: 'missing_snapshot', message: 'Snapshot is missing or not an object.' }], summary: {} };
  }
  const d = data(snapshot);
  const pumps = rec(d.pumps ?? d.pumpStates);
  const feeders = rec(d.feeders ?? d.feederStates);
  const sumps = rec(d.sumps ?? d.sumpStates);
  const zones = rec(d.zones ?? d.zoneStates);
  const sensors = rec(d.sensors ?? d.sensorStates);

  if (Object.keys(sumps).length === 0) issues.push({ severity: 'warning', code: 'no_sumps', message: 'No sump states present; dewatering/safety analysis limited.' });
  if (Object.keys(pumps).length === 0) issues.push({ severity: 'warning', code: 'no_pumps', message: 'No pump states present; capacity/feasibility analysis limited.' });
  if (Object.keys(feeders).length === 0) issues.push({ severity: 'info', code: 'no_feeders', message: 'No feeder states present; power feasibility cannot be fully verified.' });
  if (Object.keys(zones).length === 0) issues.push({ severity: 'info', code: 'no_zones', message: 'No zone states present; production impact assessment limited.' });

  let staleCount = 0; let totalSensors = 0;
  for (const [id, s] of Object.entries(sensors)) {
    totalSensors++;
    const f = String(s?.freshness ?? s?.quality ?? '').toLowerCase();
    if (['stale', 'expired', 'unavailable', 'bad'].includes(f)) staleCount++;
    if (s && typeof s === 'object' && s.lastValue == null && f === 'live') issues.push({ severity: 'info', code: 'live_no_value', message: `Sensor ${id} marked live but has no value.`, path: `sensors.${id}` });
  }
  if (totalSensors > 0 && staleCount / totalSensors >= 0.5) issues.push({ severity: 'warning', code: 'high_stale_sensors', message: `${staleCount}/${totalSensors} sensors stale/expired/unavailable; observability degraded.` });

  // basic numeric sanity
  for (const [id, s] of Object.entries(sumps)) {
    const fill = typeof s?.fillRatio === 'number' ? s.fillRatio : NaN;
    if (Number.isFinite(fill) && (fill < -0.01 || fill > 1.5)) issues.push({ severity: 'warning', code: 'sump_fill_range', message: `Sump ${id} fill ratio out of expected range (${fill}).`, path: `sumps.${id}.fillRatio` });
  }

  const crit = issues.filter(i => i.severity === 'critical').length;
  const warn = issues.filter(i => i.severity === 'warning').length;
  const score = Math.max(0, 1 - crit * 0.4 - warn * 0.1 - issues.filter(i=>i.severity==='info').length * 0.02);
  return {
    ok: crit === 0,
    score: +score.toFixed(3),
    issues,
    summary: { pumps: Object.keys(pumps).length, feeders: Object.keys(feeders).length, sumps: Object.keys(sumps).length, zones: Object.keys(zones).length, sensors: totalSensors, staleSensors: staleCount, snapshotId: snapshot?.id ?? d?.snapshotId },
  };
}
