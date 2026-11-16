import type { FeatureSpec } from '@mine-os/contracts';

function num(v: unknown, d = 0): number { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : d; }
function rec(v: unknown): Record<string, any> { return v && typeof v === 'object' && !Array.isArray(v) ? v as any : {}; }
function data(snap: any): any { return snap?.data ?? snap?.derived ?? snap?.state ?? snap?.world ?? snap ?? {}; }
function vals(v: unknown): any[] { return Object.values(rec(v)); }

export interface FeatureVector {
  schemaVersion: string;
  atMs: number;
  features: Record<string, number | boolean | string | null>;
  provenance: Record<string, unknown>;
}

export const COMMON_FEATURES: FeatureSpec[] = [
  { name: 'power.demand_kw', dtype: 'number', unit: 'kW', description: 'Total running pump demand' },
  { name: 'power.supply_kw', dtype: 'number', unit: 'kW', description: 'Available feeder supply' },
  { name: 'power.margin_kw', dtype: 'number', unit: 'kW', description: 'Supply minus demand' },
  { name: 'power.unavailable_feeders', dtype: 'number', description: 'Count of failed/isolated feeders' },
  { name: 'dewater.max_sump_fill_ratio', dtype: 'number', description: 'Maximum sump fill ratio [0..1]' },
  { name: 'dewater.max_net_inflow_m3h', dtype: 'number', unit: 'm3/h', description: 'Maximum sump net inflow' },
  { name: 'dewater.total_discharge_m3h', dtype: 'number', unit: 'm3/h', description: 'Total pump discharge' },
  { name: 'dewater.pumps_running', dtype: 'number', description: 'Running pump count' },
  { name: 'dewater.pumps_unavailable', dtype: 'number', description: 'Unavailable/blocked pump count' },
  { name: 'production.min_zone_ratio', dtype: 'number', description: 'Minimum zone operating ratio [0..1]' },
  { name: 'production.constrained_zones', dtype: 'number', description: 'Zones below full throughput' },
  { name: 'maintenance.pump_concerns', dtype: 'number', description: 'Pumps with degradation/fault indicators' },
  { name: 'maintenance.stale_sensors', dtype: 'number', description: 'Stale/expired/unavailable sensors' },
  { name: 'safety.critical_flood_flags', dtype: 'number', description: 'Sumps in critical/warning flood state' },
];

export function extractFeatures(snapshot: any): FeatureVector {
  const d = data(snapshot);
  const pumps = rec(d.pumps ?? d.pumpStates);
  const feeders = rec(d.feeders ?? d.feederStates);
  const sumps = rec(d.sumps ?? d.sumpStates);
  const zones = rec(d.zones ?? d.zoneStates);
  const sensors = rec(d.sensors ?? d.sensorStates);
  const pvals = vals(pumps);
  const fvals = vals(feeders);
  const svals = vals(sumps);
  const zvals = vals(zones);
  const sens = vals(sensors);

  const demand = pvals.reduce((a, p) => a + (String(p?.mode).toLowerCase() === 'running' ? num(p?.powerKw ?? p?.averageInputPowerKw) : 0), 0);
  const supply = fvals.reduce((a, f) => {
    const status = String(f?.status).toLowerCase();
    if (['failed', 'isolated', 'maintenance', 'offline'].includes(status)) return a;
    const direct = num(f?.availableKw, NaN);
    if (Number.isFinite(direct)) return a + Math.max(0, direct);
    return a + Math.max(0, num(f?.capacityKva ?? f?.capacityKw) * (f?.capacityKva != null ? 0.9 : 1) * num(f?.supplyRatio, 1));
  }, 0);
  const unavailFeeders = fvals.filter(f => ['failed', 'isolated', 'offline', 'maintenance'].includes(String(f?.status).toLowerCase())).length;
  const sumpFills = svals.map(s => {
    const r = num(s?.fillRatio, NaN);
    if (Number.isFinite(r)) return r; const cap = num(s?.capacityM3, 0); return cap > 0 ? num(s?.volumeM3) / cap : 0;
  });
  const sumpNets = svals.map(s => num(s?.inflowM3h) - num(s?.outflowM3h));
  const discharge = pvals.reduce((a, p) => a + num(p?.deliveredFlowM3h ?? p?.flowM3h ?? p?.dischargeContributionM3h), 0);
  const running = pvals.filter(p => String(p?.mode).toLowerCase() === 'running').length;
  const unavailPumps = pvals.filter(p => p?.unavailable === true || ['failed', 'blocked', 'offline', 'maintenance'].includes(String(p?.status).toLowerCase()) || p?.powered === false).length;
  const zoneRatios = zvals.map(z => {
    const r = num(z?.operatingRatio ?? z?.ratio, NaN); return Number.isFinite(r) ? Math.max(0, Math.min(1, r)) : 1;
  });
  const constrainedZones = zoneRatios.filter(r => r < 0.999).length;
  const pumpConcerns = pvals.filter(p => {
    const cond = num(p?.condition ?? p?.health, NaN);
    const noFlow = String(p?.mode).toLowerCase() === 'running' && num(p?.deliveredFlowM3h ?? p?.flowM3h) <= 0.01;
    return noFlow || (Number.isFinite(cond) && cond < 0.75) || ['degraded', 'failed', 'blocked'].includes(String(p?.status).toLowerCase());
  }).length;
  const staleSensors = sens.filter(s => ['stale', 'expired', 'unavailable', 'bad'].includes(String(s?.freshness ?? s?.quality).toLowerCase())).length;
  const criticalFlood = svals.filter(s => {
    const sev = String(s?.breach?.severity).toLowerCase();
    const fill = ((): number => { const r = num(s?.fillRatio, NaN); if (Number.isFinite(r)) return r; const cap = num(s?.capacityM3, 0); return cap > 0 ? num(s?.volumeM3) / cap : 0; })();
    const ttc = s?.secondsToCritical;
    return sev === 'critical' || sev === 'warning' || fill >= 0.85 || (typeof ttc === 'number' && ttc <= 6 * 3600);
  }).length;

  return {
    schemaVersion: '0.1.0',
    atMs: Date.now(),
    features: {
      'power.demand_kw': +demand.toFixed(3),
      'power.supply_kw': +supply.toFixed(3),
      'power.margin_kw': +(supply - demand).toFixed(3),
      'power.unavailable_feeders': unavailFeeders,
      'dewater.max_sump_fill_ratio': sumpFills.length ? +Math.max(...sumpFills).toFixed(6) : null,
      'dewater.max_net_inflow_m3h': sumpNets.length ? +Math.max(...sumpNets).toFixed(3) : null,
      'dewater.total_discharge_m3h': +discharge.toFixed(3),
      'dewater.pumps_running': running,
      'dewater.pumps_unavailable': unavailPumps,
      'production.min_zone_ratio': zoneRatios.length ? +Math.min(...zoneRatios).toFixed(6) : null,
      'production.constrained_zones': constrainedZones,
      'maintenance.pump_concerns': pumpConcerns,
      'maintenance.stale_sensors': staleSensors,
      'safety.critical_flood_flags': criticalFlood,
    },
    provenance: { deterministic: true, source: 'snapshot-derived', snapshotId: snapshot?.id ?? snapshot?.snapshotId ?? d?.snapshotId },
  };
}
