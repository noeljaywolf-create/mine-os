import type { TelemetryAdapter, AssetCatalogueSnapshot, AdapterHealth } from '../../domain/contracts';
import type { SensorId, TelemetrySample } from '../../domain/types';
import { normaliseSample } from '../../domain/contracts';
import type { PilotSensorMapping } from '../pilot/types';

export interface GatewayHttpOptions {
  gatewayUrl: string;
  name?: string;
  mappings?: PilotSensorMapping[];
  headers?: Record<string, string>;
  /** 'latest' polls /samples/latest; 'window' can be extended for range fetches */
  mode?: 'latest';
  timeoutMs?: number;
  autoMap?: boolean; // infer mappings from /catalog when none provided
}

type GatewaySample = { sensorId?: string; sourceTag?: string; epochMs: number; value: number; unit?: string; quality?: number };

export interface GatewayProbeResult {
  ok: boolean;
  url: string;
  health?: any;
  catalog?: any;
  sampleCount?: number;
  sensors?: Array<{ sensorId: string; sourceTag?: string; kind?: string; unit?: string; assetId?: string }>;
  inferredMappings?: PilotSensorMapping[];
  latencyMs?: number;
  error?: string;
  hints?: string[];
}

/** Read-only HTTP polling adapter for an on-site gateway (pluggable, core-unchanged). */
export class GatewayHttpAdapter implements TelemetryAdapter {
  readonly id: string;
  readonly simulated = false;
  readonly description: string;
  private lastPollMs: number | null = null;
  private lastGood = 0;
  private lastTotal = 0;
  private lastError: string | null = null;
  private catalogueCache: AssetCatalogueSnapshot | null = null;
  private resolvedMappings: PilotSensorMapping[] = [];

  constructor(private opts: GatewayHttpOptions) {
    this.id = `gateway:${opts.gatewayUrl}`;
    this.description = `Read-only gateway adapter polling ${opts.gatewayUrl} (canonical samples).`;
    this.resolvedMappings = opts.mappings ?? [];
  }

  getMappings() { return this.resolvedMappings; }

  private mapBySource() { return new Map(this.resolvedMappings.map(m => [m.sourceTag, m])); }
  private mapBySensor() { return new Map(this.resolvedMappings.map(m => [m.sensorId, m])); }

  private async fetchJson<T>(path: string, timeoutMs = this.opts.timeoutMs ?? 8000): Promise<T> {
    const base = this.opts.gatewayUrl.trim().replace(/\/$/, '');
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'accept': 'application/json', ...(this.opts.headers ?? {}) }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`Gateway ${res.status} ${res.statusText} (${path})`);
      return await res.json() as T;
    } catch (e: any) {
      if (e?.name === 'AbortError') throw new Error(`Timeout connecting to gateway (${timeoutMs}ms). Check IP/URL, network reachability, and that the gateway is running.`);
      if (String(e?.message || e).includes('Failed to fetch')) throw new Error(`Cannot reach gateway. Check URL/IP, TLS (https), firewall/VPN, and CORS on the gateway.`);
      throw e;
    } finally { clearTimeout(t); }
  }

  static normalizeUrl(input: string): string {
    let u = input.trim();
    if (!u) return u;
    if (!/^https?:\/\//i.test(u)) u = `http://${u}`; // easy local/IP connect
    return u.replace(/\/$/, '');
  }

  static inferMappingsFromCatalog(catalog: any): PilotSensorMapping[] {
    const sensors = Array.isArray(catalog?.sensors) ? catalog.sensors : [];
    return sensors.map((s: any) => ({
      sourceTag: String(s.sourceTag ?? s.tag ?? s.id ?? ''),
      sensorId: String(s.sensorId ?? s.id ?? s.sourceTag ?? s.tag ?? ''),
      assetId: String(s.assetId ?? s.asset ?? s.sensorId ?? s.id ?? 'asset-unknown'),
      kind: (['level','flow','pressure','vibration','power','temperature'].includes(s.kind) ? s.kind : 'level') as any,
      unit: (['m','m3/h','kPa','mm/s','kW','degC'].includes(s.unit) ? s.unit : 'm') as any,
      scale: Number.isFinite(Number(s.scale)) ? Number(s.scale) : 1,
      deadband: 0, minQuality: 0,
      stalenessThresholdSec: Number(s.stalenessThresholdSec) > 0 ? Number(s.stalenessThresholdSec) : 300,
      samplePeriodSec: Number(s.samplePeriodSec) > 0 ? Number(s.samplePeriodSec) : 60,
      accuracyPct: Number(s.accuracyPct) >= 0 ? Number(s.accuracyPct) : 2,
      provenance: 'measured' as const,
    })).filter((m: PilotSensorMapping) => m.sourceTag && m.sensorId);
  }

  async probe(): Promise<GatewayProbeResult> {
    const url = GatewayHttpAdapter.normalizeUrl(this.opts.gatewayUrl);
    const started = Date.now();
    const hints: string[] = [];
    try {
      let health: any = null, catalog: any = null, samples: any = null;
      try { health = await this.fetchJson<any>('/health', 6000); } catch { hints.push('No /health endpoint (optional).'); }
      try { catalog = await this.fetchJson<any>('/catalog', 6000); } catch { hints.push('No /catalog endpoint; provide mappings or let gateway return sensor metadata.'); }
      try { samples = await this.fetchJson<any>('/samples/latest', 8000); } catch (e:any) { hints.push(`Could not read /samples/latest: ${e?.message || e}`); }
      const inferredMappings = catalog ? GatewayHttpAdapter.inferMappingsFromCatalog(catalog) : [];
      const sampleArr = Array.isArray(samples?.samples) ? samples.samples : [];
      const sensors = (inferredMappings.length ? inferredMappings : (sampleArr.map((s:any)=>({sensorId:String(s.sensorId||s.sourceTag||''), sourceTag:s.sourceTag, unit:s.unit})))).filter((s:any)=>s.sensorId);
      if (!health && !catalog && !samples) throw new Error('Gateway did not respond to /health, /catalog, or /samples/latest.');
      if (inferredMappings.length && this.resolvedMappings.length === 0) this.resolvedMappings = inferredMappings;
      return { ok: true, url, health, catalog, sampleCount: sampleArr.length, sensors, inferredMappings, latencyMs: Date.now()-started, hints };
    } catch (e: any) {
      return { ok: false, url, error: e?.message || String(e), latencyMs: Date.now()-started, hints: [
        'Use the gateway/edge service URL reachable from this browser (e.g. http://192.168.x.x:8080).',
        'If connecting across origins, enable read-only CORS on the gateway.',
        'For OPC UA/Modbus/MQTT devices, connect them to the gateway; browser connects to gateway URL only.',
      ] };
    }
  }

  async getCatalogue(): Promise<AssetCatalogueSnapshot> {
    if (this.catalogueCache) return this.catalogueCache;
    try {
      const data = await this.fetchJson<any>('/catalog');
      if (this.resolvedMappings.length === 0) this.resolvedMappings = GatewayHttpAdapter.inferMappingsFromCatalog(data);
      const sensors = Array.isArray(data.sensors) && data.sensors.length
        ? data.sensors.map((s: any) => ({ id: String(s.sensorId ?? s.id ?? s.sourceTag), name: String(s.name ?? s.sourceTag ?? s.sensorId ?? s.id), assetId: String(s.assetId ?? s.asset ?? s.sensorId ?? s.id ?? 'asset'), kind: s.kind ?? 'level', unit: s.unit ?? 'm', stalenessThresholdSec: Number(s.stalenessThresholdSec) || 300, samplePeriodSec: Number(s.samplePeriodSec) || 60, accuracyPct: Number(s.accuracyPct) || 2 }))
        : this.resolvedMappings.map(m => ({ id: m.sensorId, name: m.sourceTag, assetId: m.assetId, kind: m.kind, unit: m.unit, stalenessThresholdSec: m.stalenessThresholdSec, samplePeriodSec: m.samplePeriodSec, accuracyPct: m.accuracyPct }));
      this.catalogueCache = { assets: data.assets ?? [], pumps: data.pumps ?? [], feeders: data.feeders ?? [], sumps: data.sumps ?? [], zones: data.zones ?? [], sensors };
      return this.catalogueCache;
    } catch {
      const mappings = this.resolvedMappings.length ? this.resolvedMappings : (this.opts.mappings ?? []);
      this.resolvedMappings = mappings;
      this.catalogueCache = { assets: [], pumps: [], feeders: [], sumps: [], zones: [],
        sensors: mappings.map(m => ({ id: m.sensorId, name: m.sourceTag, assetId: m.assetId, kind: m.kind, unit: m.unit, stalenessThresholdSec: m.stalenessThresholdSec, samplePeriodSec: m.samplePeriodSec, accuracyPct: m.accuracyPct })) };
      return this.catalogueCache;
    }
  }

  private normalize(raw: GatewaySample): TelemetrySample | null {
    const bySource = this.mapBySource();
    const bySensor = this.mapBySensor();
    const sourceTag = raw.sourceTag ?? raw.sensorId ?? '';
    const mapping = bySensor.get(raw.sensorId ?? '') ?? bySource.get(sourceTag);
    const sensorId = mapping?.sensorId ?? raw.sensorId ?? sourceTag;
    if (!sensorId) return null;
    const baseUnit = raw.unit ?? mapping?.unit ?? 'm';
    const base = { sensorId, value: raw.value, unit: baseUnit, epochMs: raw.epochMs ?? Date.now(), quality: raw.quality ?? 1 };
    if (mapping) {
      return normaliseSample(base, { sensorId, kind: mapping.kind, canonicalUnit: mapping.unit, scale: mapping.scale, deadband: mapping.deadband, minQuality: mapping.minQuality });
    }
    if (!Number.isFinite(base.value)) return null;
    return { sensorId, epochMs: base.epochMs, value: base.value, unit: (baseUnit as TelemetrySample['unit']), quality: base.quality ?? 1 };
  }

  async getSamples(sensorIds: SensorId[]): Promise<TelemetrySample[]> {
    try {
      const qs = sensorIds.length ? `?ids=${encodeURIComponent(sensorIds.join(','))}` : '';
      const data = await this.fetchJson<{ samples: GatewaySample[] }>(`/samples/latest${qs}`);
      const out: TelemetrySample[] = [];
      for (const raw of data.samples ?? []) {
        const n = this.normalize(raw);
        if (n && (sensorIds.length === 0 || sensorIds.includes(n.sensorId))) out.push(n);
      }
      this.lastPollMs = Date.now();
      this.lastTotal = out.length || sensorIds.length || 1;
      this.lastGood = out.filter(s => s.quality >= 0.5).length;
      this.lastError = null;
      return out;
    } catch (e) {
      this.lastPollMs = Date.now();
      this.lastError = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  subscribe(sensorIds: SensorId[], onSample: (sample: TelemetrySample) => void, onError?: (error: Error) => void): () => void {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try { (await this.getSamples(sensorIds)).forEach(onSample); }
      catch (e) { onError?.(e instanceof Error ? e : new Error(String(e))); }
    };
    const h = setInterval(tick, this.opts.mode === 'latest' ? 5000 : 5000);
    void tick();
    return () => { active = false; clearInterval(h); };
  }

  async getHealth(): Promise<AdapterHealth> {
    try {
      const h = await this.fetchJson<any>('/health');
      return { status: h.status === 'ok' ? 'online' : h.status === 'degraded' ? 'degraded' : 'online', lastPollMs: this.lastPollMs, message: h.details ?? 'Gateway reachable', goodSensorPct: this.lastTotal ? Math.round((this.lastGood / this.lastTotal) * 100) : 100 };
    } catch {
      return { status: this.lastError ? 'offline' : 'degraded', lastPollMs: this.lastPollMs, message: this.lastError ?? 'Health unknown', goodSensorPct: 0 };
    }
  }
}
