import type {
  Asset,
  AssetDependency,
  ElectricalFeeder,
  MineLevel,
  ProductionZone,
  Pump,
  Sensor,
  Sump,
} from '../domain/types';
import type { MineDefinition, PlantDefinition } from '../domain/mine';
import type { MaterialHandlingModel } from '../domain/engineering';

/**
 * SYNTHETIC MINE — "Kestrel Ridge Underground".
 *
 * This is the single source of truth for the demonstration. Every screen reads
 * this model through the simulation engine; no page carries its own copy of
 * asset data.
 *
 * The mine is deliberately fictional. The geometry below is a schematic
 * arrangement for visualisation, not a survey, and must never be presented as
 * a real site plan.
 *
 * Design intent of the numbers:
 *  - Baseline sumps sit below their advisory thresholds with duty pumps able to
 *    hold level (small negative net flow).
 *  - The middle level carries three pumps on feeder F-02, so losing that feeder
 *    is the flagship cross-system failure.
 *  - Middle sumps have ~14 m from floor to production floor, giving physically
 *    meaningful hours-to-flood rather than instantaneous flooding.
 */

const GEOMETRY_DISCLAIMER =
  'Schematic synthetic geometry for demonstration only. Not a survey, not a mine plan, and not indicative of any real operation.';

// ------------------------------------------------------------------ levels
const levels: MineLevel[] = [
  {
    id: 'lvl-surface',
    name: 'Surface',
    kind: 'surface',
    depthM: 0,
    elevationM: 0,
    twinRow: 60,
    description: 'Headframe, processing plant, substation and dewatering riser discharge.',
  },
  {
    id: 'lvl-340',
    name: '340 Level',
    kind: 'upper',
    depthM: 340,
    elevationM: -340,
    twinRow: 240,
    description: 'Upper access and services level. Upper sump S-101 protects the level drift.',
  },
  {
    id: 'lvl-480',
    name: '480 Level',
    kind: 'middle',
    depthM: 480,
    elevationM: -480,
    twinRow: 480,
    description: 'Primary production level. North and south orebodies, two sumps, three pumps.',
  },
  {
    id: 'lvl-620',
    name: '620 Level',
    kind: 'lower',
    depthM: 620,
    elevationM: -620,
    twinRow: 720,
    description: 'Lower access and future development. Lower sump S-301 on feeder F-03.',
  },
];

// ------------------------------------------------------------ production zones
const zones: ProductionZone[] = [
  {
    id: 'zone-north',
    name: 'North Orebody',
    levelId: 'lvl-480',
    floorElevationM: -494,
    designRateTph: 620,
    twinPolygon: [
      [250, 512],
      [470, 512],
      [500, 566],
      [220, 566],
    ],
    governedBySumpIds: ['smp-201', 'smp-202'],
    floodControlSumpId: 'smp-201',
    productionSharePct: 55,
  },
  {
    id: 'zone-south',
    name: 'South Orebody',
    levelId: 'lvl-480',
    floorElevationM: -500,
    designRateTph: 500,
    twinPolygon: [
      [620, 512],
      [860, 512],
      [880, 566],
      [600, 566],
    ],
    governedBySumpIds: ['smp-202'],
    floodControlSumpId: 'smp-202',
    productionSharePct: 45,
  },
];

// ------------------------------------------------------------------- sumps
const sumps: Sump[] = [
  {
    id: 'smp-101',
    name: 'Upper Sump S-101',
    levelId: 'lvl-340',
    capacityM3: 900,
    floorElevationM: -358,
    areaM2: 60,
    baselineInflowM3h: 105,
    initialFillRatio: 0.35,
    rainfallSensitiveFraction: 0.35,
    protectedElevationM: -344,
    thresholds: [
      { id: 'thr-101-a', label: 'Advisory', levelM: 6, severity: 'advisory' },
      { id: 'thr-101-w', label: 'Warning', levelM: 9, severity: 'warning' },
      { id: 'thr-101-c', label: 'Critical', levelM: 12.5, severity: 'critical' },
    ],
    twinPolygon: [
      [300, 226],
      [356, 226],
      [356, 254],
      [300, 254],
    ],
    twinPosition: { x: 328, y: 240 },
  },
  {
    id: 'smp-201',
    name: 'Middle North Sump S-201',
    levelId: 'lvl-480',
    capacityM3: 1800,
    floorElevationM: -508,
    areaM2: 80,
    baselineInflowM3h: 155,
    initialFillRatio: 0.22,
    rainfallSensitiveFraction: 0.4,
    protectedElevationM: -494,
    thresholds: [
      { id: 'thr-201-a', label: 'Advisory', levelM: 6, severity: 'advisory' },
      { id: 'thr-201-w', label: 'Warning', levelM: 9, severity: 'warning' },
      { id: 'thr-201-c', label: 'Critical', levelM: 12, severity: 'critical' },
    ],
    twinPolygon: [
      [548, 466],
      [604, 466],
      [604, 494],
      [548, 494],
    ],
    twinPosition: { x: 576, y: 480 },
  },
  {
    id: 'smp-202',
    name: 'Middle South Sump S-202',
    levelId: 'lvl-480',
    capacityM3: 1400,
    floorElevationM: -514,
    areaM2: 70,
    baselineInflowM3h: 95,
    initialFillRatio: 0.20,
    rainfallSensitiveFraction: 0.3,
    protectedElevationM: -500,
    thresholds: [
      { id: 'thr-202-a', label: 'Advisory', levelM: 5, severity: 'advisory' },
      { id: 'thr-202-w', label: 'Warning', levelM: 8, severity: 'warning' },
      { id: 'thr-202-c', label: 'Critical', levelM: 12, severity: 'critical' },
    ],
    twinPolygon: [
      [748, 466],
      [804, 466],
      [804, 494],
      [748, 494],
    ],
    twinPosition: { x: 776, y: 480 },
  },
  {
    id: 'smp-301',
    name: 'Lower Sump S-301',
    levelId: 'lvl-620',
    capacityM3: 2000,
    floorElevationM: -680,
    areaM2: 100,
    baselineInflowM3h: 200,
    initialFillRatio: 0.3,
    rainfallSensitiveFraction: 0.25,
    protectedElevationM: -664,
    thresholds: [
      { id: 'thr-301-a', label: 'Advisory', levelM: 7, severity: 'advisory' },
      { id: 'thr-301-w', label: 'Warning', levelM: 11, severity: 'warning' },
      { id: 'thr-301-c', label: 'Critical', levelM: 15, severity: 'critical' },
    ],
    twinPolygon: [
      [836, 706],
      [892, 706],
      [892, 734],
      [836, 734],
    ],
    twinPosition: { x: 864, y: 720 },
  },
];

// ------------------------------------------------------------------ feeders
const feeders: ElectricalFeeder[] = [
  {
    id: 'fdr-01',
    name: 'F-01 North 11 kV Feeder',
    route: 'Surface substation → north shaft → 340 level drift',
    voltageV: 11000,
    capacityKva: 900,
    connectedLoadKw: 150,
    status: 'energised',
    twinPolyline: [
      [960, 60],
      [500, 60],
      [180, 60],
      [180, 240],
      [330, 240],
    ],
    twinLabelPosition: { x: 250, y: 150 },
    sourceBus: 'SS-1 (11 kV bus A)',
  },
  {
    id: 'fdr-02',
    name: 'F-02 Central 11 kV Feeder',
    route: 'Surface substation → central borehole → 480 level substation',
    voltageV: 11000,
    capacityKva: 630,
    connectedLoadKw: 310,
    status: 'energised',
    twinPolyline: [
      [1000, 60],
      [1000, 480],
      [610, 480],
    ],
    twinLabelPosition: { x: 1010, y: 300 },
    sourceBus: 'SS-1 (11 kV bus B)',
  },
  {
    id: 'fdr-03',
    name: 'F-03 South 11 kV Feeder',
    route: 'Surface substation → south shaft → 620 level substation',
    voltageV: 11000,
    capacityKva: 500,
    connectedLoadKw: 132,
    status: 'energised',
    twinPolyline: [
      [1040, 60],
      [1040, 720],
      [900, 720],
    ],
    twinLabelPosition: { x: 1050, y: 520 },
    sourceBus: 'SS-1 (11 kV bus C)',
  },
];

// ------------------------------------------------------------------- pumps
const pumps: Pump[] = [
  {
    id: 'pmp-101',
    name: 'P-101 Upper Settlement Pump',
    sumpId: 'smp-101',
    feederId: 'fdr-01',
    ratedFlowM3h: 180,
    ratedHeadM: 110,
    health: 0.92,
    efficiency: 0.78,
    mode: 'running',
    powerRequiredKw: 75,
    liftHeadM: 90,
    twinPosition: { x: 400, y: 240 },
    notes:
      'Lead duty pump for the upper level. Discharges to the main riser. Last overhaul 14 months ago; vibration trend flat.',
    commissionedYear: 2016,
  },
  {
    id: 'pmp-102',
    name: 'P-102 Upper Standby Pump',
    sumpId: 'smp-101',
    feederId: 'fdr-01',
    ratedFlowM3h: 180,
    ratedHeadM: 110,
    health: 0.9,
    efficiency: 0.77,
    mode: 'standby',
    powerRequiredKw: 75,
    liftHeadM: 90,
    twinPosition: { x: 440, y: 240 },
    notes:
      'Standby unit. Available for dispatch on feeder F-01. Monthly start test recorded, no running hours this quarter.',
    commissionedYear: 2016,
  },
  {
    id: 'pmp-201',
    name: 'P-201 Middle North Duty Pump',
    sumpId: 'smp-201',
    feederId: 'fdr-02',
    ratedFlowM3h: 260,
    ratedHeadM: 160,
    health: 0.86,
    efficiency: 0.8,
    mode: 'running',
    powerRequiredKw: 110,
    liftHeadM: 140,
    twinPosition: { x: 620, y: 480 },
    notes:
      'Primary dewatering duty for the north orebody. Power supply is single-fed from F-02 with no automatic transfer.',
    commissionedYear: 2014,
  },
  {
    id: 'pmp-202',
    name: 'P-202 Middle North Standby',
    sumpId: 'smp-201',
    feederId: 'fdr-02',
    ratedFlowM3h: 260,
    ratedHeadM: 160,
    health: 0.9,
    efficiency: 0.79,
    mode: 'standby',
    powerRequiredKw: 110,
    liftHeadM: 140,
    twinPosition: { x: 650, y: 480 },
    notes: 'Standby unit on the same feeder as P-201 — it does not provide power diversity.',
    commissionedYear: 2017,
  },
  {
    id: 'pmp-203',
    name: 'P-203 Middle South Pump',
    sumpId: 'smp-202',
    feederId: 'fdr-02',
    ratedFlowM3h: 210,
    ratedHeadM: 150,
    health: 0.74,
    efficiency: 0.76,
    mode: 'running',
    powerRequiredKw: 90,
    liftHeadM: 132,
    twinPosition: { x: 810, y: 480 },
    notes:
      'Wear ring clearance above target; efficiency has fallen through the quarter. Replacement planned at the next shutdown.',
    commissionedYear: 2012,
  },
  {
    id: 'pmp-301',
    name: 'P-301 Lower Main Pump',
    sumpId: 'smp-301',
    feederId: 'fdr-03',
    ratedFlowM3h: 340,
    ratedHeadM: 220,
    health: 0.94,
    efficiency: 0.82,
    mode: 'running',
    powerRequiredKw: 132,
    liftHeadM: 190,
    twinPosition: { x: 910, y: 720 },
    notes: 'Main dewatering path for the lower level. Discharges to the main riser.',
    commissionedYear: 2019,
  },
  {
    id: 'pmp-204', name: 'P-204 Hypothetical Additional North Standby', sumpId: 'smp-201', feederId: 'fdr-02',
    ratedFlowM3h: 260, ratedHeadM: 160, health: 0.96, efficiency: 0.8, mode: 'standby',
    powerRequiredKw: 110, liftHeadM: 140, twinPosition: { x: 680, y: 480 }, commissionedYear: 2026,
    installed: false, notes: 'Uninstalled canonical planning slot. Only a hypothetical additional-pump scenario can make this unit dispatchable. Shared F-02 and shared main; no electrical diversity is implied.',
  },
];

// ----------------------------------------------------------------- sensors
const sensors: Sensor[] = [
  {
    id: 'sen-l-101',
    name: 'S-101 Level LT-1010',
    assetId: 'smp-101',
    kind: 'level',
    unit: 'm',
    stalenessThresholdSec: 180,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.98,
    accuracyPct: 1.5,
    twinPosition: { x: 310, y: 222 },
    commissioned: true,
  },
  {
    id: 'sen-l-201',
    name: 'S-201 Level LT-2010',
    assetId: 'smp-201',
    kind: 'level',
    unit: 'm',
    stalenessThresholdSec: 120,
    lastSampleAtMs: 0,
    samplePeriodSec: 30,
    linkQuality: 0.99,
    accuracyPct: 1.0,
    twinPosition: { x: 556, y: 462 },
    commissioned: true,
  },
  {
    id: 'sen-l-202',
    name: 'S-202 Level LT-2020',
    assetId: 'smp-202',
    kind: 'level',
    unit: 'm',
    stalenessThresholdSec: 120,
    lastSampleAtMs: 0,
    samplePeriodSec: 30,
    linkQuality: 0.97,
    accuracyPct: 1.0,
    twinPosition: { x: 756, y: 462 },
    commissioned: true,
  },
  {
    id: 'sen-l-301',
    name: 'S-301 Level LT-3010',
    assetId: 'smp-301',
    kind: 'level',
    unit: 'm',
    stalenessThresholdSec: 180,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.96,
    accuracyPct: 1.5,
    twinPosition: { x: 844, y: 702 },
    commissioned: true,
  },
  {
    id: 'sen-p-01',
    name: 'F-01 Power PT-0110',
    assetId: 'fdr-01',
    kind: 'power',
    unit: 'kW',
    stalenessThresholdSec: 90,
    lastSampleAtMs: 0,
    samplePeriodSec: 15,
    linkQuality: 0.99,
    accuracyPct: 0.8,
    twinPosition: { x: 250, y: 96 },
    commissioned: true,
  },
  {
    id: 'sen-p-02',
    name: 'F-02 Power PT-0210',
    assetId: 'fdr-02',
    kind: 'power',
    unit: 'kW',
    stalenessThresholdSec: 90,
    lastSampleAtMs: 0,
    samplePeriodSec: 15,
    linkQuality: 0.99,
    accuracyPct: 0.8,
    twinPosition: { x: 1010, y: 200 },
    commissioned: true,
  },
  {
    id: 'sen-p-03',
    name: 'F-03 Power PT-0310',
    assetId: 'fdr-03',
    kind: 'power',
    unit: 'kW',
    stalenessThresholdSec: 90,
    lastSampleAtMs: 0,
    samplePeriodSec: 15,
    linkQuality: 0.98,
    accuracyPct: 0.8,
    twinPosition: { x: 1046, y: 600 },
    commissioned: true,
  },
  {
    id: 'sen-f-101',
    name: 'P-101 Flow FT-1010',
    assetId: 'pmp-101',
    kind: 'flow',
    unit: 'm3/h',
    stalenessThresholdSec: 120,
    lastSampleAtMs: 0,
    samplePeriodSec: 30,
    linkQuality: 0.98,
    accuracyPct: 1.2,
    twinPosition: { x: 402, y: 232 },
    commissioned: true,
  },
  {
    id: 'sen-f-201',
    name: 'P-201 Flow FT-2010',
    assetId: 'pmp-201',
    kind: 'flow',
    unit: 'm3/h',
    stalenessThresholdSec: 120,
    lastSampleAtMs: 0,
    samplePeriodSec: 30,
    linkQuality: 0.97,
    accuracyPct: 1.2,
    twinPosition: { x: 622, y: 472 },
    commissioned: true,
  },
  {
    id: 'sen-f-203',
    name: 'P-203 Flow FT-2030',
    assetId: 'pmp-203',
    kind: 'flow',
    unit: 'm3/h',
    stalenessThresholdSec: 120,
    lastSampleAtMs: 0,
    samplePeriodSec: 30,
    linkQuality: 0.95,
    accuracyPct: 1.2,
    twinPosition: { x: 812, y: 472 },
    commissioned: true,
  },
  {
    id: 'sen-f-301',
    name: 'P-301 Flow FT-3010',
    assetId: 'pmp-301',
    kind: 'flow',
    unit: 'm3/h',
    stalenessThresholdSec: 120,
    lastSampleAtMs: 0,
    samplePeriodSec: 30,
    linkQuality: 0.98,
    accuracyPct: 1.2,
    twinPosition: { x: 912, y: 712 },
    commissioned: true,
  },
  {
    id: 'sen-v-201',
    name: 'P-201 Vibration VT-2010',
    assetId: 'pmp-201',
    kind: 'vibration',
    unit: 'mm/s',
    stalenessThresholdSec: 300,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.97,
    accuracyPct: 2.0,
    twinPosition: { x: 626, y: 468 },
    commissioned: true,
  },
  {
    id: 'sen-v-203',
    name: 'P-203 Vibration VT-2030',
    assetId: 'pmp-203',
    kind: 'vibration',
    unit: 'mm/s',
    stalenessThresholdSec: 300,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.96,
    accuracyPct: 2.0,
    twinPosition: { x: 816, y: 468 },
    commissioned: true,
  },
  {
    id: 'sen-v-301',
    name: 'P-301 Vibration VT-3010',
    assetId: 'pmp-301',
    kind: 'vibration',
    unit: 'mm/s',
    stalenessThresholdSec: 300,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.98,
    accuracyPct: 2.0,
    twinPosition: { x: 916, y: 708 },
    commissioned: true,
  },
  {
    id: 'sen-pr-201',
    name: 'S-201 Pressure PT-2015',
    assetId: 'smp-201',
    kind: 'pressure',
    unit: 'kPa',
    stalenessThresholdSec: 180,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.97,
    accuracyPct: 1.5,
    twinPosition: { x: 560, y: 472 },
    commissioned: true,
  },
  {
    id: 'sen-pr-301',
    name: 'S-301 Pressure PT-3015',
    assetId: 'smp-301',
    kind: 'pressure',
    unit: 'kPa',
    stalenessThresholdSec: 180,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.96,
    accuracyPct: 1.5,
    twinPosition: { x: 848, y: 712 },
    commissioned: true,
  },
  {
    id: 'sen-t-301',
    name: 'P-301 Bearing Temp TT-3012',
    assetId: 'pmp-301',
    kind: 'temperature',
    unit: 'degC',
    stalenessThresholdSec: 300,
    lastSampleAtMs: 0,
    samplePeriodSec: 60,
    linkQuality: 0.97,
    accuracyPct: 2.0,
    twinPosition: { x: 920, y: 716 },
    commissioned: true,
  },
];

// ---------------------------------------------------------- processing plant
const plant: PlantDefinition = {
  id: 'plant-01',
  name: 'Kestrel Ridge Processing Plant',
  designRateTph: 1120,
  criticalSharePct: 100,
  levelId: 'lvl-surface',
  twinPosition: { x: 760, y: 60 },
  description:
    'Surface crushing, grinding and concentrate plant. Modelled throughput is limited by underground ore delivery.',
};

// ------------------------------------------------------------------- assets
function assetBase(
  id: string,
  name: string,
  kind: Asset['kind'],
  system: Asset['system'],
  levelId: string | null,
  tag: string,
  description: string,
  twinPosition: { x: number; y: number },
  manufacturer: string,
  model: string,
  commissionedYear: number,
): Asset {
  return {
    id,
    name,
    kind,
    system,
    levelId,
    tag,
    manufacturer,
    model,
    serialNumber: `SYN-${id.toUpperCase()}-${String(commissionedYear).slice(2)}`,
    commissionedYear,
    description,
    operatingLimits: {},
    attributes: {},
    twinPosition,
  };
}

const assets: Asset[] = [
  assetBase(
    'plant-01',
    plant.name,
    'plant',
    'processing',
    'lvl-surface',
    'PLANT.CNTRL.TPH',
    plant.description,
    plant.twinPosition,
    'Synthetic Process Systems',
    'CR-1120',
    2011,
  ),
  ...pumps.map((pump) => {
    const base = assetBase(
      pump.id,
      pump.name,
      'pump',
      'dewatering',
      mineLevelForSump(pump.sumpId),
      `PUMP.${pump.id.toUpperCase().replace('PMP-', '')}.FLOW`,
      pump.notes,
      pump.twinPosition,
      'Synthetic Pumps Ltd',
      `Dewatering ${pump.ratedFlowM3h}`,
      pump.commissionedYear,
    );
    base.operatingLimits = {
      maxFlowM3h: pump.ratedFlowM3h,
      maxHeadM: pump.ratedHeadM,
      dutyHoursPerDay: pump.mode === 'standby' ? 2 : 20,
    };
    base.attributes = {
      ratedFlowM3h: pump.ratedFlowM3h,
      ratedHeadM: pump.ratedHeadM,
      healthPct: Math.round(pump.health * 100),
      efficiencyPct: Math.round(pump.efficiency * 100),
      powerRequiredKw: pump.powerRequiredKw,
      feeder: pump.feederId,
      sump: pump.sumpId,
      duty: pump.mode,
    };
    return base;
  }),
  ...feeders.map((feeder) => {
    const base = assetBase(
      feeder.id,
      feeder.name,
      'feeder',
      'electrical',
      'lvl-surface',
      `FEED.${feeder.id.toUpperCase().replace('FDR-', '')}.KW`,
      feeder.route,
      { x: feeder.twinLabelPosition.x, y: feeder.twinLabelPosition.y },
      'Synthetic Switchgear',
      '11 kV vacuum',
      2009,
    );
    base.operatingLimits = { maxLoadKw: feeder.capacityKva * 0.9 };
    base.attributes = {
      voltageV: feeder.voltageV,
      capacityKva: feeder.capacityKva,
      connectedLoadKw: feeder.connectedLoadKw,
      sourceBus: feeder.sourceBus,
      protection: 'Overcurrent + earth fault (modelled)',
    };
    return base;
  }),
  ...sumps.map((sump) => {
    const base = assetBase(
      sump.id,
      sump.name,
      'sump',
      'dewatering',
      sump.levelId,
      `SUMP.${sump.id.toUpperCase().replace('SMP-', '')}.LEVEL`,
      `Modelled storage ${sump.capacityM3} m³ with a ${(sump.capacityM3 / sump.areaM2).toFixed(
        1,
      )} m depth and ${sump.areaM2} m² plan area. Floor elevation ${sump.floorElevationM} m.`,
      sump.twinPosition,
      'Synthetic Civil Works',
      'Excavated sump',
      2009,
    );
    base.operatingLimits = {};
    base.attributes = {
      capacityM3: sump.capacityM3,
      areaM2: sump.areaM2,
      floorElevationM: sump.floorElevationM,
      baselineInflowM3h: sump.baselineInflowM3h,
      protectedElevationM: sump.protectedElevationM,
    };
    return base;
  }),
  ...zones.map((zone) => {
    const base = assetBase(
      zone.id,
      zone.name,
      'zone',
      'production',
      zone.levelId,
      `ZONE.${zone.id.toUpperCase().replace('ZONE-', '')}.TPH`,
      `Production zone with design throughput ${zone.designRateTph} t/h and floor elevation ${zone.floorElevationM} m.`,
      {
        x: zone.twinPolygon.reduce((sum, p) => sum + p[0], 0) / zone.twinPolygon.length,
        y: zone.twinPolygon.reduce((sum, p) => sum + p[1], 0) / zone.twinPolygon.length,
      },
      'Kestrel Ridge Operations',
      'Orebody',
      2009,
    );
    base.operatingLimits = { maxLoadKw: undefined };
    base.attributes = {
      designRateTph: zone.designRateTph,
      floorElevationM: zone.floorElevationM,
      productionSharePct: zone.productionSharePct,
      floodControlSump: zone.floodControlSumpId,
    };
    return base;
  }),
  ...sensors.map((sensor) => {
    const base = assetBase(
      sensor.id,
      sensor.name,
      'sensor',
      'instrumentation',
      mineLevelForAsset(sensor.assetId),
      `SENS.${sensor.id.toUpperCase()}`,
      `Modelled ${sensor.kind} tag on ${sensor.assetId}. Staleness window ${sensor.stalenessThresholdSec} s.`,
      sensor.twinPosition,
      'Synthetic Instruments',
      `TX-${sensor.kind}`,
      2018,
    );
    base.attributes = {
      kind: sensor.kind,
      unit: sensor.unit,
      stalenessThresholdSec: sensor.stalenessThresholdSec,
      samplePeriodSec: sensor.samplePeriodSec,
      accuracyPct: sensor.accuracyPct,
      linkQuality: sensor.linkQuality,
      monitors: sensor.assetId,
    };
    return base;
  }),
  assetBase(
    'inf-riser',
    'Main Dewatering Riser',
    'infrastructure',
    'dewatering',
    'lvl-surface',
    'RISER.FLOW.TOTAL',
    'Abstract staged discharge boundary. Station lift is to an intermediate receiving reservoir; full-depth riser and series-train design require a separate validated design.',
    { x: 540, y: 330 },
    'Synthetic Civil Works',
    'Riser 1',
    2009,
  ),
  assetBase(
    'inf-vent',
    'Ventilation Circuit',
    'infrastructure',
    'ventilation',
    'lvl-480',
    'VENT.MAIN.FLOW',
    'Primary ventilation circuit serving the production level. Modelled as an operational dependency only.',
    { x: 700, y: 400 },
    'Synthetic Ventilation',
    'VF-2',
    2010,
  ),
  assetBase(
    'inf-upper-drift',
    '340 Level Drift',
    'infrastructure',
    'infrastructure',
    'lvl-340',
    'INFRA.340.DRIFT',
    'Access drift on the upper level, protected by sump S-101.',
    { x: 600, y: 240 },
    'Synthetic Civil Works',
    'Drift 340',
    2009,
  ),
  assetBase(
    'inf-lower-drift',
    '620 Level Access',
    'infrastructure',
    'infrastructure',
    'lvl-620',
    'INFRA.620.DRIFT',
    'Lower level access and development heading, protected by sump S-301.',
    { x: 700, y: 720 },
    'Synthetic Civil Works',
    'Drift 620',
    2009,
  ),
];

function mineLevelForSump(sumpId: string): string {
  const sump = sumps.find((s) => s.id === sumpId);
  return sump?.levelId ?? 'lvl-480';
}

function mineLevelForAsset(assetId: string): string | null {
  const sump = sumps.find((s) => s.id === assetId);
  if (sump) return sump.levelId;
  const pump = pumps.find((p) => p.id === assetId);
  if (pump) return mineLevelForSump(pump.sumpId);
  const zone = zones.find((z) => z.id === assetId);
  if (zone) return zone.levelId;
  return 'lvl-surface';
}

// -------------------------------------------------------------- dependencies
const dependency = (
  id: string,
  from: string,
  to: string,
  type: AssetDependency['type'],
  rationale: string,
  criticality: AssetDependency['criticality'],
): AssetDependency => ({ id, from, to, type, rationale, criticality });

const dependencies: AssetDependency[] = [
  // Power distribution
  dependency('dep-f01-p101', 'fdr-01', 'pmp-101', 'powered_by', 'P-101 is fed from F-01 with no alternate supply.', 5),
  dependency('dep-f01-p102', 'fdr-01', 'pmp-102', 'powered_by', 'P-102 is fed from F-01 with no alternate supply.', 4),
  dependency('dep-f02-p201', 'fdr-02', 'pmp-201', 'powered_by', 'P-201 is fed from F-02; no automatic transfer is modelled.', 5),
  dependency('dep-f02-p202', 'fdr-02', 'pmp-202', 'powered_by', 'P-202 shares F-02 with P-201, so it gives no power diversity.', 4),
  dependency('dep-f02-p203', 'fdr-02', 'pmp-203', 'powered_by', 'P-203 is fed from F-02; the south sump has no alternate supply.', 5),
  dependency('dep-f03-p301', 'fdr-03', 'pmp-301', 'powered_by', 'P-301 is fed from F-03; no alternate supply is modelled.', 5),
  dependency('dep-f02-p204', 'fdr-02', 'pmp-204', 'powered_by', 'Hypothetical P-204 installation still shares F-02; installation and dispatch must be explicitly enabled.', 4),
  dependency('dep-f01-plant', 'fdr-01', 'plant-01', 'powered_by', 'The processing plant is supplied from F-01.', 5),

  // Pump / sump hydraulics
  dependency('dep-s101-p101', 'smp-101', 'pmp-101', 'pumps_from', 'P-101 draws from S-101.', 4),
  dependency('dep-s101-p102', 'smp-101', 'pmp-102', 'pumps_from', 'P-102 draws from S-101.', 3),
  dependency('dep-s201-p201', 'smp-201', 'pmp-201', 'pumps_from', 'P-201 draws from S-201.', 5),
  dependency('dep-s201-p202', 'smp-201', 'pmp-202', 'pumps_from', 'P-202 draws from S-201.', 4),
  dependency('dep-s201-p204', 'smp-201', 'pmp-204', 'pumps_from', 'Hypothetical P-204 draws from S-201 only when installed in the scenario.', 4),
  dependency('dep-s202-p203', 'smp-202', 'pmp-203', 'pumps_from', 'P-203 draws from S-202.', 5),
  dependency('dep-s301-p301', 'smp-301', 'pmp-301', 'pumps_from', 'P-301 draws from S-301.', 5),

  // Discharge path
  dependency('dep-p101-riser', 'pmp-101', 'inf-riser', 'drains_to', 'P-101 discharges into the main riser.', 3),
  dependency('dep-p201-riser', 'pmp-201', 'inf-riser', 'drains_to', 'P-201 discharges into the main riser.', 4),
  dependency('dep-p203-riser', 'pmp-203', 'inf-riser', 'drains_to', 'P-203 discharges into the main riser.', 4),
  dependency('dep-p301-riser', 'pmp-301', 'inf-riser', 'drains_to', 'P-301 discharges into the main riser.', 5),

  // Dewatering protects production
  dependency('dep-s201-zoneN', 'smp-201', 'zone-north', 'supports', 'S-201 controls water level beneath the north orebody floor.', 5),
  dependency('dep-s202-zoneS', 'smp-202', 'zone-south', 'supports', 'S-202 controls water level beneath the south orebody floor.', 5),
  dependency('dep-p201-zoneN', 'pmp-201', 'zone-north', 'supports', 'P-201 provides the north orebody dewatering capability.', 4),
  dependency('dep-p203-zoneS', 'pmp-203', 'zone-south', 'supports', 'P-203 provides the south orebody dewatering capability.', 4),
  dependency('dep-s101-upper', 'smp-101', 'inf-upper-drift', 'supports', 'S-101 protects the 340 level drift from inundation.', 4),
  dependency('dep-s301-lower', 'smp-301', 'inf-lower-drift', 'supports', 'S-301 protects the 620 level access.', 4),

  // Production feeds the plant
  dependency('dep-zoneN-plant', 'zone-north', 'plant-01', 'feeds', 'North orebody ore is delivered to the processing plant.', 5),
  dependency('dep-zoneS-plant', 'zone-south', 'plant-01', 'feeds', 'South orebody ore is delivered to the processing plant.', 5),

  // Instrumentation
  ...sensors.map((sensor) =>
    dependency(
      `dep-${sensor.id}-${sensor.assetId}`,
      sensor.id,
      sensor.assetId,
      'monitors',
      `${sensor.name} provides the ${sensor.kind} measurement used to model this asset's state.`,
      sensor.kind === 'level' || sensor.kind === 'power' ? 4 : 3,
    ),
  ),
];

// ------------------------------------------------------------------- geometry
const orebodyOutline: Array<[number, number]> = [
  [210, 500],
  [900, 500],
  [930, 585],
  [180, 585],
];

const surfaceFacilities = [
  {
    id: 'fac-headframe',
    name: 'North Headframe',
    polygon: [
      [140, 20],
      [220, 20],
      [220, 100],
      [140, 100],
    ] as Array<[number, number]>,
  },
  {
    id: 'fac-plant',
    name: 'Processing Plant',
    polygon: [
      [620, 18],
      [900, 18],
      [900, 96],
      [620, 96],
    ] as Array<[number, number]>,
  },
  {
    id: 'fac-substation',
    name: 'Surface Substation SS-1',
    polygon: [
      [940, 18],
      [1100, 18],
      [1100, 96],
      [940, 96],
    ] as Array<[number, number]>,
  },
  {
    id: 'fac-winder',
    name: 'South Winder',
    polygon: [
      [980, 110],
      [1050, 110],
      [1050, 170],
      [980, 170],
    ] as Array<[number, number]>,
  },
];

const materialHandling: MaterialHandlingModel = {
  routes: [
    { id: 'mat-north', name: 'North primary ore route', zoneIds: ['zone-north'], capacityTph: 700, defaultAvailable: true, alternative: false },
    { id: 'mat-south', name: 'South primary ore route', zoneIds: ['zone-south'], capacityTph: 600, defaultAvailable: true, alternative: false },
    { id: 'mat-crosscut', name: 'Shared alternative crosscut', zoneIds: ['zone-north', 'zone-south'], capacityTph: 250, defaultAvailable: false, alternative: true },
  ], hoistCapacityTph: 1200, bufferCapacityTonnes: 1120, initialBufferTonnes: 560,
};

export const MINE: MineDefinition = {
  materialHandling,
  id: 'mine-kestrel-ridge',
  name: 'Kestrel Ridge Underground',
  location: 'Synthetic demonstration site',
  description:
    'Three-level underground mine with two production orebodies, four sumps, six installed pumps plus one explicit hypothetical planning slot, three 11 kV feeders and a surface processing plant.',
  geometryDisclaimer: GEOMETRY_DISCLAIMER,
  levels,
  zones,
  sumps: sumps.map(s => ({ ...s, stageStorage: [
    { levelM: 0, volumeM3: 0 },
    { levelM: s.capacityM3 / s.areaM2 * 0.5, volumeM3: s.capacityM3 * 0.5 },
    { levelM: s.capacityM3 / s.areaM2 * 0.75, volumeM3: s.capacityM3 * 0.8 },
    { levelM: s.capacityM3 / s.areaM2, volumeM3: s.capacityM3 },
  ] })),
  pumps,
  feeders,
  sensors,
  assets: [...assets, ...materialHandling.routes.map((r, i) => ({
    ...assetBase(r.id, r.name, 'infrastructure', 'production', 'lvl-480', `${r.id}.FLOW`,
      'Synthetic capacity-limited ore movement route; geometry and transport capacities require site verification.',
      { x: 320 + i * 250, y: 600 }, 'Synthetic material handling', 'Route capacity model', 2026),
    attributes: { capacityTph: r.capacityTph, alternative: r.alternative },
  })), assetBase('mat-hoist', 'Ore movement / hoist bottleneck', 'infrastructure', 'production', 'lvl-surface', 'MAT.HOIST.FLOW',
    'Synthetic common material-handling capacity. This is not a hoist mechanical/electrical design.', { x: 980, y: 560 }, 'Synthetic material handling', 'Capacity model', 2026)],
  dependencies: [...dependencies,
    ...materialHandling.routes.flatMap(r => [
      ...r.zoneIds.map(z => dependency(`dep-${z}-${r.id}`, z, r.id, 'feeds', 'Ore movement uses an available capacity-limited primary or explicitly enabled alternate route.', 4)),
      dependency(`dep-${r.id}-hoist`, r.id, 'mat-hoist', 'feeds', 'Route flows share a common hoisting/material-handling limit.', 4),
    ]), dependency('dep-hoist-plant', 'mat-hoist', plant.id, 'feeds', 'Finite buffer inventory delays processing consequences after material-handling interruption.', 5)],
  plant,
  orebodyOutline,
  surfaceFacilities,
};

/** Stable id lists used throughout the UI. */
export const MINE_IDS = {
  levels: levels.map((l) => l.id),
  zones: zones.map((z) => z.id),
  sumps: sumps.map((s) => s.id),
  pumps: pumps.map((p) => p.id),
  feeders: feeders.map((f) => f.id),
  sensors: sensors.map((s) => s.id),
  plant: plant.id,
  riser: 'inf-riser',
  ventilation: 'inf-vent',
} as const;

export const MINE_GEOMETRY_DISCLAIMER = GEOMETRY_DISCLAIMER;
