import type {
  Asset,
  AssetDependency,
  ElectricalFeeder,
  MineLevel,
  ProductionZone,
  Pump,
  Sensor,
  Sump,
} from './types';
import type { MaterialHandlingModel } from './engineering';

/**
 * A processing facility modelled as an asset with its own production model.
 */
export interface PlantDefinition {
  id: string;
  name: string;
  /** Tonnes per hour at design throughput. */
  designRateTph: number;
  /** Share of production that must reach the plant to sustain site rate. */
  criticalSharePct: number;
  levelId: string;
  twinPosition: { x: number; y: number };
  description: string;
}

/**
 * The canonical, synthetic mine model.
 *
 * Every identifier here is stable and referenced by the simulation engine, the
 * digital twin, the dependency graph and the reports. Geometry is explicitly
 * synthetic — a schematic arrangement for demonstration, not a surveyed mine.
 */
export interface MineDefinition {
  materialHandling?: MaterialHandlingModel;
  id: string;
  name: string;
  location: string;
  description: string;
  /** Explicit statement surfaced everywhere the twin is shown. */
  geometryDisclaimer: string;
  levels: MineLevel[];
  zones: ProductionZone[];
  sumps: Sump[];
  pumps: Pump[];
  feeders: ElectricalFeeder[];
  sensors: Sensor[];
  assets: Asset[];
  dependencies: AssetDependency[];
  plant: PlantDefinition;
  /** Orebody outline used by the twin (synthetic). */
  orebodyOutline: Array<[number, number]>;
  /** Surface facility outlines (synthetic). */
  surfaceFacilities: Array<{ id: string; name: string; polygon: Array<[number, number]> }>;
}
