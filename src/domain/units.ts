/**
 * MINE OS — canonical unit system.
 *
 * Every physical quantity in the domain carries an explicit unit suffix in its
 * name. The engine works exclusively in the SI units declared here:
 *
 *   volume    m3
 *   level     m  (above sump floor)
 *   flow      m3/h  (converted to m3/s only inside the integrator)
 *   time      s    (simulation seconds)
 *   power     kW
 *   energy    kWh
 *   money     USD
 *   mass      t   (tonnes)
 *
 * Presentation-layer conversion lives in this module so that no screen can
 * invent its own scaling.
 */

export const M3_PER_M3H_PER_S = 1 / 3600;

/** Convert m3/h to m3/s. */
export function m3hToM3s(flowM3h: number): number {
  return flowM3h * M3_PER_M3H_PER_S;
}

/** Convert m3/s to m3/h. */
export function m3sToM3h(flowM3s: number): number {
  return flowM3s * 3600;
}

/** Convert m3/h to litres per second (common industrial pump unit). */
export function m3hToLps(flowM3h: number): number {
  return (flowM3h * 1000) / 3600;
}

/** Seconds to hours. */
export function secondsToHours(seconds: number): number {
  return seconds / 3600;
}

/** Hours to seconds. */
export function hoursToSeconds(hours: number): number {
  return hours * 3600;
}

/** Minutes to seconds. */
export function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

/** Specific energy of a pumped fluid, kWh per m3, for a given head in metres. */
export function hydraulicEnergyKwhPerM3(headM: number, pumpEfficiency: number): number {
  const densityKgM3 = 1000;
  const gravity = 9.81;
  const kwhPerM3 = (densityKgM3 * gravity * headM) / 3_600_000;
  return kwhPerM3 / Math.max(pumpEfficiency, 0.05);
}

/** Power required to lift flow at a head, in kW. */
export function requiredPowerKw(flowM3h: number, headM: number, efficiency: number): number {
  const densityKgM3 = 1000;
  const gravity = 9.81;
  const flowM3s = m3hToM3s(flowM3h);
  return (densityKgM3 * gravity * flowM3s * headM) / (efficiency * 1000);
}

/** Flow from a pump at a given head using a simple duty curve (no curve data -> linear). */
export function pumpFlowAtHead(ratedFlowM3h: number, ratedHeadM: number, headM: number): number {
  if (ratedHeadM <= 0) return ratedFlowM3h;
  const ratio = 1 - Math.max(0, headM - ratedHeadM) / (ratedHeadM * 2);
  return ratedFlowM3h * Math.max(0, Math.min(1.05, ratio));
}

export type FormatStyle = 'engineering' | 'plain';

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatFlow(flowM3h: number): string {
  if (!Number.isFinite(flowM3h)) return '—';
  const abs = Math.abs(flowM3h);
  if (abs >= 1000) return `${formatNumber(flowM3h / 1000, 2)}k m³/h`;
  return `${formatNumber(flowM3h, 0)} m³/h`;
}

export function formatVolume(volumeM3: number): string {
  if (!Number.isFinite(volumeM3)) return '—';
  return `${formatNumber(volumeM3, 0)} m³`;
}

export function formatLevel(levelM: number): string {
  if (!Number.isFinite(levelM)) return '—';
  return `${formatNumber(levelM, 2)} m`;
}

export function formatPower(kw: number): string {
  if (!Number.isFinite(kw)) return '—';
  return `${formatNumber(kw, 0)} kW`;
}

export function formatEnergy(kwh: number): string {
  if (!Number.isFinite(kwh)) return '—';
  if (Math.abs(kwh) >= 1000) return `${formatNumber(kwh / 1000, 2)} MWh`;
  return `${formatNumber(kwh, 0)} kWh`;
}

export function formatMoney(usd: number): string {
  if (!Number.isFinite(usd)) return '—';
  return usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatTonnes(tonnes: number): string {
  if (!Number.isFinite(tonnes)) return '—';
  if (Math.abs(tonnes) >= 1000) return `${formatNumber(tonnes / 1000, 2)} kt`;
  return `${formatNumber(tonnes, 1)} t`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 48) return `${hours} h ${remMinutes} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function formatDurationHours(hours: number): string {
  return formatDuration(Math.max(0, hours * 3600));
}

export function formatTimestamp(epochMs: number): string {
  if (!Number.isFinite(epochMs)) return '—';
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `T+${pad(h)}:${pad(m)}:${pad(s)}`;
}
