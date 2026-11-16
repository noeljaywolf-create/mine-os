import type { DatasetManifest, DataSource } from '@mine-os/contracts';
import { extractFeatures } from './features';

export interface SnapshotRecord { id?: string; snapshot: any; labels?: Record<string, unknown>; meta?: Record<string, unknown> }
export interface TabularExample { id: string; features: Record<string, number | boolean | string | null>; labels: Record<string, unknown>; meta: Record<string, unknown> }

/** Build feature/label examples from snapshot logs (Approach A/C input). No hallucinated labels: use provided labels or leave empty. */
export function buildExamplesFromSnapshots(records: SnapshotRecord[]): TabularExample[] {
  return records.map((r, idx) => {
    const fv = extractFeatures(r.snapshot);
    return {
      id: r.id ?? `ex-${idx}`,
      features: fv.features,
      labels: r.labels ?? {},
      meta: { ...(r.meta ?? {}), featureSchemaVersion: fv.schemaVersion, snapshotId: fv.provenance?.snapshotId, extractedAtMs: fv.atMs },
    };
  });
}

export function splitExamples<T>(items: T[], ratios = { train: 0.7, validation: 0.15, test: 0.15 }, seed = 42): { train: T[]; validation: T[]; test: T[] } {
  // Deterministic pseudo-shuffle by seed + index hash for reproducibility without RNG dependency.
  const arr = items.map((item, i) => ({ item, k: hash(`${seed}:${i}:${JSON.stringify((item as any)?.id ?? i)}`) })).sort((a,b)=>a.k-b.k).map(x=>x.item);
  const n = arr.length; const nTrain = Math.floor(n * ratios.train); const nVal = Math.floor(n * ratios.validation);
  return { train: arr.slice(0, nTrain), validation: arr.slice(nTrain, nTrain + nVal), test: arr.slice(nTrain + nVal) };
}

function hash(s: string): number { let h = 2166136261; for (let i=0;i<s.length;i++){h ^= s.charCodeAt(i); h = Math.imul(h, 16777619);} return h >>> 0; }

export function datasetManifestFromExamples(args: { id: string; version: string; title: string; description?: string; examples: TabularExample[]; sources: DataSource[] }): DatasetManifest {
  const labelKeys = Array.from(new Set(args.examples.flatMap(e => Object.keys(e.labels || {}))));
  return {
    id: args.id, version: args.version, title: args.title, description: args.description,
    sources: args.sources,
    features: args.examples[0] ? Object.keys(args.examples[0].features).map(name => ({ name, dtype: typeof args.examples[0].features[name] === 'boolean' ? 'boolean' : 'number', nullable: true })) : [],
    labels: labelKeys.map(name => ({ name, dtype: 'boolean', description: 'Provided/derived label (verify definition and horizon per site)' })),
    recordCount: args.examples.length,
    createdAtMs: Date.now(),
    provenance: { builder: 'buildExamplesFromSnapshots', deterministic: true },
  };
}

/** CSV adapter helper: parse simple CSV text to records (caller provides mapping to features/labels). */
export function parseSimpleCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r\n/g,'\n').split('\n').filter(l => l.trim().length);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => { const cols = splitCsvLine(line); const obj: Record<string,string> = {}; header.forEach((h,i)=>obj[h]=cols[i] ?? ''); return obj; });
}
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i=0;i<line.length;i++){ const ch=line[i]; if (ch==='"'){ if (q && line[i+1]==='"'){cur+='"'; i++;} else q=!q; } else if (ch===',' && !q){ out.push(cur.trim()); cur=''; } else cur+=ch; }
  out.push(cur.trim()); return out;
}
