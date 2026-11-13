import type { TelemetryAdapter, AssetCatalogueSnapshot, AdapterHealth } from '../../domain/contracts';
import type { SensorId, TelemetrySample } from '../../domain/types';
import { convertUnit, normaliseSample } from '../../domain/contracts';
import type { PilotDataset, PilotSensorMapping } from './types';

export class PilotFileAdapter implements TelemetryAdapter {
  readonly id = 'pilot-file';
  readonly simulated = false;
  readonly description = 'Pilot replay adapter: serves telemetry from an imported dataset (CSV/historian export). Read-only; no plant control.';

  private cursor = 0;
  private lastPollMs: number | null = null;
  private readonly bySensor = new Map<string, PilotDataset['samples']>();

  constructor(private dataset: PilotDataset, private catalogue: AssetCatalogueSnapshot) {
    for (const s of dataset.samples) {
      const arr = this.bySensor.get(s.sensorId) ?? [];
      arr.push(s);
      this.bySensor.set(s.sensorId, arr);
    }
  }

  private mappingFor(sensorId: string): PilotSensorMapping | undefined {
    return this.dataset.config.sensors.find(m => m.sensorId === sensorId || m.sourceTag === sensorId);
  }

  async getCatalogue(): Promise<AssetCatalogueSnapshot> { return this.catalogue; }

  async getSamples(sensorIds: SensorId[]): Promise<TelemetrySample[]> {
    this.lastPollMs = Date.now();
    const out: TelemetrySample[] = [];
    for (const id of sensorIds) {
      const series = this.bySensor.get(id);
      if (!series || series.length === 0) continue;
      // Latest sample at or before current cursor window (MVP: return latest known)
      const sample = series[Math.min(this.cursor, series.length - 1)];
      const mapping = this.mappingFor(id);
      const rule = mapping ? {
        sensorId: id,
        kind: mapping.kind,
        canonicalUnit: mapping.unit,
        scale: mapping.scale,
        deadband: mapping.deadband,
        minQuality: mapping.minQuality,
      } : null;
      const raw = { sensorId: id, value: sample.value, unit: sample.unit ?? mapping?.unit ?? 'm', epochMs: sample.epochMs, quality: sample.quality };
      const normalised = rule ? normaliseSample(raw, rule) : {
        sensorId: id, epochMs: sample.epochMs, value: sample.value,
        unit: (mapping?.unit ?? 'm') as TelemetrySample['unit'], quality: sample.quality,
      };
      if (normalised) out.push(normalised);
    }
    this.cursor++;
    return out;
  }

  /** Samples available at or before a given time (for replay driver). */
  getSamplesAt(epochMs: number, sensorIds?: SensorId[]): TelemetrySample[] {
    const ids = sensorIds ?? [...this.bySensor.keys()];
    const out: TelemetrySample[] = [];
    for (const id of ids) {
      const series = this.bySensor.get(id);
      if (!series?.length) continue;
      let lo = 0, hi = series.length - 1, best = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (series[mid].epochMs <= epochMs) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      if (best < 0) continue;
      const sample = series[best];
      const mapping = this.mappingFor(id);
      const unit = (sample.unit ?? mapping?.unit ?? 'm') as TelemetrySample['unit'];
      const value = sample.unit && mapping && sample.unit !== mapping.unit
        ? (convertUnit(sample.value, sample.unit, mapping.unit) ?? sample.value) * (mapping?.scale ?? 1)
        : sample.value * (mapping?.scale ?? 1);
      if ((sample.quality ?? 1) < (mapping?.minQuality ?? 0)) continue;
      out.push({ sensorId: id, epochMs: sample.epochMs, value, unit, quality: sample.quality });
    }
    return out;
  }

  subscribe(
    sensorIds: SensorId[],
    onSample: (sample: TelemetrySample) => void,
    _onError?: (error: Error) => void,
  ): () => void {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const samples = await this.getSamples(sensorIds);
        samples.forEach(onSample);
      } catch (e) { _onError?.(e instanceof Error ? e : new Error(String(e))); }
    };
    const handle = setInterval(tick, 1000);
    void tick();
    return () => { active = false; clearInterval(handle); };
  }

  async getHealth(): Promise<AdapterHealth> {
    const total = this.bySensor.size;
    const good = [...this.bySensor.values()].filter(s => (s[s.length - 1]?.quality ?? 0) >= 0.5).length;
    return {
      status: total === 0 ? 'offline' : 'online',
      lastPollMs: this.lastPollMs,
      message: `Pilot dataset: ${this.dataset.samples.length} samples across ${total} sensors`,
      goodSensorPct: total ? Math.round((good / total) * 100) : 0,
    };
  }
}
