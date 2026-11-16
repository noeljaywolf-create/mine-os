import { asRecord, entriesOf, num, valuesOf } from './types';

/** Resilient readers over heterogeneous snapshot shapes (WorldState, derived snapshot.data, or recorded payloads). */

export function snapData(snapshot: any): any {
  if (!snapshot) return {};
  return snapshot.data ?? snapshot.derived ?? snapshot.state ?? snapshot.world ?? snapshot;
}

export function getPumps(snapshot: any): Record<string, any> {
  const d = snapData(snapshot);
  return asRecord(d.pumps ?? d.pumpStates ?? d.pumpRuntime ?? snapshot?.pumps);
}

export function getFeeders(snapshot: any): Record<string, any> {
  const d = snapData(snapshot);
  return asRecord(d.feeders ?? d.feederStates ?? d.feederRuntime ?? snapshot?.feeders);
}

export function getSumps(snapshot: any): Record<string, any> {
  const d = snapData(snapshot);
  return asRecord(d.sumps ?? d.sumpStates ?? d.sumpRuntime ?? snapshot?.sumps);
}

export function getZones(snapshot: any): Record<string, any> {
  const d = snapData(snapshot);
  return asRecord(d.zones ?? d.zoneStates ?? d.zoneRuntime ?? snapshot?.zones);
}

export function getSensors(snapshot: any): Record<string, any> {
  const d = snapData(snapshot);
  return asRecord(d.sensors ?? d.sensorStates ?? snapshot?.sensors);
}

export function getAssets(snapshot: any): Record<string, any> {
  const d = snapData(snapshot);
  return asRecord(d.assets ?? d.assetStates ?? snapshot?.assets);
}

export function pumpIsRunning(p: any): boolean {
  const mode = String(p?.mode ?? '').toLowerCase();
  return mode === 'running' || p?.running === true;
}

export function pumpFlowM3h(p: any): number {
  return num(p?.deliveredFlowM3h ?? p?.flowM3h ?? p?.dischargeContributionM3h, 0);
}

export function pumpPowerKw(p: any): number {
  return num(p?.powerKw ?? p?.averageInputPowerKw ?? p?.demandKw, 0);
}

export function pumpAvailable(p: any): boolean {
  if (p?.unavailable === true) return false;
  const status = String(p?.status ?? '').toLowerCase();
  if (['failed', 'offline', 'blocked', 'maintenance'].includes(status)) return false;
  if (p?.powered === false) return false;
  return true;
}

export function feederAvailableKw(f: any): number {
  const direct = num(f?.availableKw, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const cap = num(f?.capacityKva ?? f?.capacityKw, 0) * (f?.capacityKva != null ? 0.9 : 1);
  const ratio = num(f?.supplyRatio, 1);
  const status = String(f?.status ?? '').toLowerCase();
  if (['failed', 'isolated', 'maintenance', 'offline'].includes(status)) return 0;
  return Math.max(0, cap * ratio);
}

export function feederOk(f: any): boolean {
  const status = String(f?.status ?? '').toLowerCase();
  return !['failed', 'isolated', 'maintenance', 'offline'].includes(status) && num(f?.supplyRatio, 1) > 0;
}

export function sumpLevelM(s: any): number {
  return num(s?.levelM ?? s?.waterLevelM, 0);
}

export function sumpVolumeM3(s: any): number {
  return num(s?.volumeM3 ?? s?.volume, 0);
}

export function sumpFillRatio(s: any): number {
  const r = num(s?.fillRatio, NaN);
  if (Number.isFinite(r)) return r;
  const cap = num(s?.capacityM3, 0);
  return cap > 0 ? sumpVolumeM3(s) / cap : 0;
}

export function sumpNetM3h(s: any): number {
  return num(s?.inflowM3h, 0) - num(s?.outflowM3h, 0);
}

export function sumpSecondsToCritical(s: any): number | null {
  const v = s?.secondsToCritical;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export function zoneRatio(z: any): number {
  const r = num(z?.operatingRatio ?? z?.ratio, NaN);
  return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 1;
}

export function sensorFreshness(s: any): string {
  return String(s?.freshness ?? s?.quality ?? 'unknown').toLowerCase();
}

export function totalPumpDemandKw(pumps: Record<string, any>): number {
  return valuesOf(pumps).reduce((a, p) => a + (pumpIsRunning(p) ? pumpPowerKw(p) : 0), 0);
}

export function totalFeederSupplyKw(feeders: Record<string, any>): number {
  return valuesOf(feeders).reduce((a, f) => a + feederAvailableKw(f), 0);
}

export function listPumpIssues(pumps: Record<string, any>): Array<{ id: string; reason: string; p: any }> {
  return entriesOf(pumps).flatMap(([id, p]) => {
    const issues: Array<{ id: string; reason: string; p: any }> = [];
    const status = String(p?.status ?? '').toLowerCase();
    if (!pumpAvailable(p) || ['degraded', 'failed', 'blocked', 'offline'].includes(status)) {
      issues.push({ id, reason: String(p?.statusReason ?? p?.reason ?? status || 'unavailable/degraded'), p });
    }
    const cond = num(p?.condition ?? p?.health, NaN);
    if (Number.isFinite(cond) && cond < 0.7) issues.push({ id, reason: `low condition/health ${(cond * 100).toFixed(0)}%`, p });
    if (pumpIsRunning(p) && pumpFlowM3h(p) <= 0.01) issues.push({ id, reason: 'running but delivering negligible flow', p });
    return issues;
  });
}

export function getSiteId(snapshot: any, fallback: string): string {
  return String(snapshot?.siteId ?? snapData(snapshot)?.siteId ?? fallback ?? 'site');
}

export function snapshotRef(snapshot: any): string | undefined {
  return snapshot?.id ?? snapshot?.snapshotId ?? snapData(snapshot)?.snapshotId;
}
