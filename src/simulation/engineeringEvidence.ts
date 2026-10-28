import { MODEL_VERSION, type EngineeringBasis } from '../domain/engineering';
import type { MineDefinition } from '../domain/mine';
import type { Scenario, WorldState } from '../domain/types';
import { effectivePipe } from './hydraulics';
import { defaultPipe } from './hydraulics';
import { computePumpStates } from './plant';
import { effectiveSump } from './waterNetwork';
import { readSensorValue } from './sensors';

const formatRates = (rates: Record<string, number> | undefined) => {
  const entries = Object.entries(rates ?? {});
  return entries.length ? entries.map(([id, rate]) => `${id}: ${rate}`).join('; ') : 'No rates available';
};

export function engineeringBasis(mine: MineDefinition, scenario: Scenario, world: WorldState, id: string): EngineeringBasis {
  scenario = { ...scenario, overrides: world.scenarioSnapshot ?? scenario.overrides };
  const tags = mine.sensors.filter(s => s.assetId === id);
  const common = { modelVersion: MODEL_VERSION, quality: tags.length ? `Synthetic observations: ${tags.map(s => `${s.id}: ${world.sensors[s.id]?.freshness ?? 'missing'}, reported ${world.sensors[s.id]?.lastValue ?? 'null'} ${s.unit}`).join('; ')}. Input quality is not field validation or a fault probability.` : 'No monitoring tags on this asset; numerical model output is not a field observation.',
    validation: 'Analytical/software fixtures only. No manufacturer curve or field calibration.',
    sensitivity: 'Run the intervention comparison with ±20% inflow; this is a parameter envelope, not a probability interval.',
    assumptions: ['Clean water approximately 20 °C, density 998.2 kg/m³, g = 9.80665 m/s².', 'Synthetic geometry and equipment; configured policies are not approved operating procedures.'],
    limitations: ['No transients, cavitation/NPSH, water hammer, slurry or specialist spatial flood routing.', 'No fault-current, relay-coordination or arc-flash calculation.'] };
  const pump = mine.pumps.find(p => p.id === id);
  if (id === 'site:quality') return { ...common, title: 'Input-quality heuristics', quantity: 'Reported freshness and modeled input-quality indices, not probabilities',
    equation: 'asset monitoring index = mean(tag quality); no tags ⇒ declared 0.85 fallback; upstream dependencies may bound the index',
    inputs: Object.entries(world.assets).map(([key, a]) => ({ name: `${key} input-quality index`, value: a.confidence, unit: 'heuristic index 0–1', source: 'sensors.ts assetMonitoringConfidence / propagation.ts dependency weighting' })),
    steps: ['These values are implementation heuristics. They are not calibrated confidence intervals, failure likelihoods or evidence that a conclusion is correct.'],
    limitations: [...common.limitations, 'The 0.85 no-tag fallback is a declared display heuristic, not observational assurance. Independent inspection is required.'] };
  if (id === 'site:dependencies') return { ...common, title: 'Conditional dependency consequences', quantity: 'Asset status and modeled functional fraction',
    equation: 'physical assets use hydraulic/electrical/storage/production results; generic dependency fractions are demonstration approximations, not equipment reliability',
    inputs: Object.entries(world.assets).map(([key, a]) => ({ name: `${key} modeled fraction`, value: a.effectiveness, unit: 'functional fraction', source: a.statusReason })),
    steps: Object.entries(world.assets).filter(([, a]) => a.causedBy.length > 0).map(([key, a]) => `${key}: ${a.status}; upstream ${a.causedBy.join(', ')}.`).concat('Water-induced zone restrictions require computed storage thresholds; loss of pump supply alone does not instantaneously flood a working area.'),
    limitations: [...common.limitations, 'Generic non-physical status propagation is not a calibrated mechanical or reliability model.'] };
  if (id === mine.plant.id || id === 'site:production') return { ...common, title: 'Processing and deferred production', quantity: 'Plant throughput, inventory, processed/deferred tonnes',
    equation: 'Tprocessed = min(planned × power fraction × Δt, routed ore + initial inventory); Tdeferred += planned − processed; Vnext = Vinitial + produced − processed',
    inputs: [
      { name: 'Plant design rate', value: mine.plant.designRateTph, unit: 't/h', source: 'Canonical plant definition' },
      { name: 'Modeled plant fraction', value: world.assets[mine.plant.id]?.effectiveness ?? 'Unavailable state', unit: 'fraction of design', source: 'engine.ts electrical service availability and finite ore inventory' },
      { name: 'Processed tonnes', value: world.plantProcessedTonnes ?? 0, unit: 't', source: 'Integrated canonical material ledger' },
      { name: 'Deferred tonnes', value: world.deferredTonnes ?? 0, unit: 't', source: 'Integrated planned minus actual processing' },
      { name: 'Ore inventory', value: world.oreBufferTonnes ?? 0, unit: 't', source: 'Finite inventory ledger' },
      { name: 'Permanent loss', value: 'Not determined', unit: 't', source: 'No calibrated permanent-loss model' },
    ], steps: [world.assets[mine.plant.id]?.statusReason ?? 'No recorded plant state.', ...Object.entries(world.materialLedger ?? {}).map(([k, v]) => `${k}: ${v} t.`)] };
  if (id === 'site:energy') return { ...common, title: 'Integrated pumping energy and tariff charges', quantity: 'Pumping energy and operating energy cost',
    equation: 'E = Σ Pinput,interval × Δt/3600; C = Σ ΔE × tariffinterval',
    inputs: mine.pumps.flatMap(p => [
      { name: `${p.id} energy`, value: world.pumps[p.id]?.energyKwh ?? 0, unit: 'kWh', source: 'engine.ts integrated actual wet-duty pump power' },
      { name: `${p.id} energy cost`, value: world.pumps[p.id]?.energyCostUSD ?? 0, unit: 'USD', source: 'Integrated interval tariff; not current power × elapsed time' },
    ]), steps: ['Sum pump counters for the selected scenario and time. Study comparisons subtract their common initial counters.', 'Production services and haulage energy are outside this pumping-cost total.'],
    limitations: [...common.limitations, 'Not a full mine electricity bill; no demand charges, off-cycle motor consumption or haulage load model.'] };
  if (id === 'site:power') return { ...common, title: 'Site power allocation and unsupplied demand', quantity: 'Requested, allocated and unsupplied active-power reservations',
    equation: 'ΣPallocated ≤ available source; Pmotor ≤ nameplate reservation; unsupplied = ΣPrequested − ΣPallocated',
    inputs: Object.entries(world.feeders).flatMap(([key, f]) => [
      { name: `${key} demand`, value: f.connectedLoadKw, unit: 'kW', source: 'Active motors plus configured services demand' },
      { name: `${key} allocation`, value: f.allocatedKw ?? 0, unit: 'kW', source: 'plant.ts source/path/critical-motor allocation' },
      { name: `${key} path capacity`, value: f.availableKw ?? 0, unit: 'kW', source: 'Source budget, feeder kVA × 0.9 PF, availability and reviewed bypass prerequisites' }]),
    steps: Object.entries(world.feeders).map(([key, f]) => `${key}: ${f.statusReason}`),
    limitations: [...common.limitations, 'Allocation is a conservative motor/services reservation, not actual AC load flow.'] };
  if (id === 'site:water') return { ...common, title: 'Site water conservation', quantity: 'Last-step and cumulative mass balance',
    equation: 'residual = initial storage + external inflow − external discharge − overflow − final storage',
    inputs: Object.entries(world.waterLedger ?? {}).filter(([, v]) => typeof v === 'number').map(([name, value]) => ({ name, value: value as number, unit: name === 'durationSec' ? 's' : 'm³', source: 'Recorded waterNetwork.ts ledger, not reconstructed from current capacities' })),
    steps: ['Each internal transfer is debited and credited once; advance the clock to populate an integration ledger.', ...Object.entries(world.waterTotals ?? {}).map(([name, v]) => `Cumulative ${name}: ${v} m³.`), ...(world.waterLedger?.transfers ?? []).map(t => `${t.from} → ${t.to}: ${t.volumeM3} m³ counted once at each storage boundary.`)],
    sensitivity: 'Residual is numerical closure, not measurement accuracy. Dry withdrawal and overflow are accounted explicitly.' };
  const sensor = mine.sensors.find(s => s.id === id);
  if (sensor) {
    const reported = world.sensors[id]; const expected = readSensorValue(mine, world, sensor);
    const sensorPump = world.pumps[sensor.assetId];
    const referenceEquation = {
      level: 'reference = canonical sump stage', flow: 'reference = last-interval actual delivery (instantaneous flow before first step)',
      power: 'reference = Σ actual pump input + services allocation', pressure: 'reference = 1000 × 9.81 × stage / 1000 kPa (declared hydrostatic approximation)',
      vibration: 'illustrative reference = (running ? 2.4 : 0.4) + (1 − condition) × 9.5 + dutyFactor × 0.8 mm/s',
      temperature: 'illustrative reference = (running ? 38 : 24) + (1 − condition) × 26 °C',
    }[sensor.kind];
    return { ...common, title: `${sensor.name} observation quality`, quantity: 'Reported measurement versus model value',
      equation: `residual = reported − modeled; missing reported value ⇒ residual indeterminate; ${referenceEquation}`,
      inputs: [
        { name: 'Reported value', value: reported?.lastValue ?? 'Missing — no substitution', unit: sensor.unit, source: `Canonical reported sensor sample; ${reported?.freshness ?? 'missing'}` },
        { name: 'Model value', value: expected ?? 'Unsupported', unit: sensor.unit, source: 'sensors.ts readSensorValue; explicitly synthetic reference, not recovered data' },
        { name: 'Reported sample age', value: reported && Number.isFinite(reported.ageSec) ? reported.ageSec : 'No finite sample age', unit: 's', source: 'Canonical sensor freshness record' },
        { name: 'Heuristic tag quality', value: reported?.confidence ?? 'Unavailable', unit: 'input-quality index, not probability', source: 'sensors.ts declared freshness/link-quality weighting' },
        { name: 'Residual', value: reported?.lastValue != null && expected != null ? reported.lastValue - expected : 'Indeterminate', unit: sensor.unit, source: 'Only calculated when both operands exist' },
        ...(sensorPump ? [
          { name: 'Pump condition input', value: sensorPump.condition ?? mine.pumps.find(p => p.id === sensor.assetId)!.health, unit: 'fraction', source: 'Canonical synthetic pump condition' },
          { name: 'Duty factor input', value: sensorPump.dutyFactor, unit: 'fraction', source: 'Canonical pump duty factor' },
          { name: 'Pump mode input', value: sensorPump.mode, unit: 'state', source: 'Canonical pump mode' },
        ] : [])],
      steps: [reported?.note ?? 'No additional observation note.', 'Inspect independent evidence, scaling and timestamps; reported freshness is not a calibration certificate.'] };
  }
  if (pump) {
    const state = world.pumps[id]; const h = state?.hydraulic;
    const pipe = effectivePipe(mine, scenario.overrides, pump.sumpId, world.sumps);
    const baseDiameter = scenario.overrides.engineering?.pipes?.[pump.sumpId]?.diameterM ?? defaultPipe(pump).diameterM;
    const variedFlow = [0.9, 1.1].map(scale => {
      const overrides = structuredClone(scenario.overrides);
      overrides.engineering = { ...overrides.engineering, pipes: { ...overrides.engineering?.pipes,
        [pump.sumpId]: { ...overrides.engineering?.pipes?.[pump.sumpId], diameterM: baseDiameter * scale } } };
      return computePumpStates(mine, overrides, world.feeders, world.sumps)[id].flowM3h;
    });
    return { ...common, title: `${pump.name} operating point`, quantity: 'Delivered flow, total head and power',
      sensitivity: `At displayed storage and electrical allocations, −10%/+10% pipe diameter yields ${variedFlow[0].toFixed(3)} / ${variedFlow[1].toFixed(3)} m³/h. Same solver; not a statistical confidence interval. A zero result may indicate an unavailable/unsupported duty.`,
      equation: 'Hsystem = Δz + p/(ρg) + f(L/D)v²/(2g) + K v²/(2g); Q = A v; Pwater = ρgQH; Pelectric = Pwater/η',
      inputs: [
        { name: 'Q', value: state?.flowM3h ?? 0, unit: 'm³/h', source: 'plant.ts / hydraulics.ts bounded operating-point solve' },
        { name: 'Rated characteristic Qr', value: pump.ratedFlowM3h, unit: 'm³/h', source: 'Canonical synthetic pump definition' },
        { name: 'Rated characteristic Hr', value: pump.ratedHeadM, unit: 'm', source: 'Canonical synthetic pump definition' },
        { name: 'Effective speed n', value: h?.effectiveSpeedRatio ?? 'Not running / not solved', unit: 'rated speed fraction', source: 'Recorded affinity-law speed after common VSD motor-budget limiting' },
        { name: 'Characteristic condition', value: state?.condition ?? pump.health, unit: 'fraction', source: 'Scenario pump health assumption, not a measured reliability probability' },
        { name: 'Characteristic flow scale', value: scenario.overrides.pumpOverrides[id]?.curveScale ?? 1, unit: 'fraction', source: 'Explicit hypothetical curve modification' },
        { name: 'Actual last-interval delivery', value: state?.deliveredFlowM3h ?? 'Not stepped yet', unit: 'm³/h', source: 'waterNetwork.ts finite withdrawal allocation; can be below wet-running operating-point capacity' },
        { name: 'H', value: h?.status === 'solved' ? h.headM : 'No solved head', unit: 'm', source: 'hydraulics.ts systemHead; standby values describe hypothetical available duty' },
        { name: 'L', value: pipe.lengthM, unit: 'm', source: 'Synthetic pipe definition / scenario override' },
        { name: 'D', value: pipe.diameterM, unit: 'm', source: 'Effective scenario pipe diameter' },
        { name: 'Absolute roughness ε', value: pipe.roughnessM, unit: 'm', source: 'Synthetic pipe definition / scenario override' },
        { name: 'Base minor K incl. suction', value: pipe.minorK, unit: 'dimensionless', source: 'Configured minor losses plus maximum station suction-loss coefficient' },
        { name: 'Valve opening', value: pipe.valveOpen, unit: 'fraction', source: 'Added valve coefficient = 20 × (1/opening − 1)²; zero opening means no supported running duty' },
        { name: 'Backpressure', value: pipe.backPressureKpa, unit: 'kPa', source: 'Configured receiving pressure; converted to head with ρg' },
        { name: 'Static lift at solve', value: h?.staticHeadM ?? 'No solve', unit: 'm', source: 'Recorded receiving-reservoir boundary minus suction water surface at calculation time' },
        { name: 'Selected unit head', value: h?.unitHeadM ?? h?.headM ?? 0, unit: 'm', source: 'Individual series unit head, or shared parallel head, used for selected motor power' },
        { name: 'Re', value: h?.reynolds ?? 0, unit: 'dimensionless', source: 'v D / ν, ν = 1.004e-6 m²/s' },
        { name: 'f', value: h?.frictionFactor ?? 0, unit: 'Darcy factor', source: '64/Re laminar; Haaland turbulent; transition final point rejected' },
        { name: 'η', value: h?.efficiency ?? 0, unit: 'wire-to-water fraction', source: 'Synthetic efficiency curve; no separate motor efficiency claim' },
        { name: 'Power', value: state?.powered && h?.status !== 'solved' ? 'Insufficient model capability at this duty' : state?.powerKw ?? 0, unit: 'kW', source: 'ρg(Q/3600)H / (1000η), only for a solved operating point' },
        { name: 'Closure residual', value: h?.residualM ?? 'No numerical solution', unit: 'm head', source: 'Actual solver residual' },
        { name: 'Integrated pump energy', value: state?.energyKwh ?? 0, unit: 'kWh', source: 'Recorded actual interval energy counter' },
        { name: 'Integrated pump energy cost', value: state?.energyCostUSD ?? 0, unit: 'USD', source: 'Recorded interval energy × interval tariff' },
      ], steps: [`Numerical status: ${h?.status ?? 'unsupported'}.`, `Friction ${h?.frictionHeadM ?? 0} m + minor losses ${h?.minorHeadM ?? 0} m.`,
        `Hydraulic power ${h?.hydraulicPowerKw ?? 0} kW; input ${state?.powerKw ?? 0} kW.`,
        `Root iterations ${h?.iterations ?? 0}; ${(h?.warnings ?? []).join(' ')}`],
      assumptions: [...common.assumptions, 'Quadratic synthetic curve: H = 1.25 Hr n² condition − 0.25 Hr [Q/(Qr curveScale)]².',
        'Shared main for each sump. Synthetic VSD regulation limits station motor demand.',
        'Default lift is to an abstract intermediate receiving reservoir, not the full lift to surface. Boundary outlet is explicitly outside the storage domain.',
        'Dry-sump duty cycling limits actual interval withdrawal and energy. Curve duty is wet-running capability, not a guarantee of continuous delivery. Off-cycle/idle motor demand is not modelled.'] };
  }
  const sump = mine.sumps.find(s => s.id === id);
  const feeder = mine.feeders.find(f => f.id === id);
  if (feeder) {
    const f = world.feeders[id];
    return { ...common, title: `${feeder.name} active-power allocation`, quantity: 'Available supply and load allocation',
      equation: 'Ppath,max = Srated × PF × availability; Pallocated ≤ min(Ppath,max, Psource,remaining); ΣPmotor ≤ Pallocated',
      inputs: [{ name: 'Feeder rating', value: feeder.capacityKva, unit: 'kVA', source: 'Synthetic electrical asset definition' },
        { name: 'Assumed power factor', value: 0.9, unit: 'dimensionless', source: 'plant.ts POWER_FACTOR' },
        { name: 'Available path capacity', value: f.availableKw ?? 0, unit: 'kW', source: 'Actual source/path allocation after outages and switching prerequisites' },
        { name: 'Allocated power budget', value: f.allocatedKw ?? 0, unit: 'kW', source: 'Priority motor reservations plus services' },
        { name: 'Generator capacity assumption', value: scenario.overrides.engineering?.backupCapacityKw ?? 250, unit: 'kW', source: 'Configured hypothetical source rating; available only when prerequisites pass' },
        { name: 'Independent backup path', value: String(Boolean(scenario.overrides.engineering?.electricalRedundancy)), unit: 'scenario prerequisite', source: 'Explicit infrastructure assumption' },
        { name: 'Services allocation', value: f.servicesAllocatedKw ?? 0, unit: 'kW', source: '160 kW synthetic service demand × selected production fraction' }],
      steps: [f.statusReason, ...Object.entries(f.pumpBudgetKw ?? {}).map(([id, kw]) => `${id}: ${kw} kW motor budget.`),
        'Utility budget 2000 kW. Generator default 250 kW, unless scenario override.',
        'A failed feeder can only be bypassed with an independent path, available generator and a scenario switching-approval prerequisite.'],
      limitations: [...common.limitations, 'Priority order is deterministic asset order; reserved nameplate motor budgets conservatively exceed actual calculated demand.'] };
  }
  if (sump) {
    const s = world.sumps[id]; const l = world.waterLedger;
    const geometry = effectiveSump(sump, scenario.overrides);
    return { ...common, title: `${sump.name} conservation and geometry`, quantity: 'Stored water volume and depth',
      sensitivity: `Local fixed-withdrawal sensitivity: ±20% total inflow gives net accumulation ${(s.inflowM3h * 0.8 - s.outflowM3h).toFixed(3)} to ${(s.inflowM3h * 1.2 - s.outflowM3h).toFixed(3)} m³/h. Coupled future thresholds must be read from the canonical forecast, not this local linearisation.`,
      equation: 'ΔV = (Qexternal + Qtransfer,in − Qpump) Δt/3600 − Voverflow; h = stageStorage⁻¹(V)',
      inputs: [{ name: 'Stored volume', value: s.volumeM3, unit: 'm³', source: 'Canonical world.sumps' },
        { name: 'Effective storage capacity', value: geometry.capacityM3, unit: 'm³', source: 'Canonical sump × configured storage scale' },
        { name: 'Stage-storage coordinates', value: geometry.stageStorage?.length ? geometry.stageStorage.map(point => `(${point.levelM}, ${point.volumeM3})`).join('; ') : `V = ${geometry.areaM2} × h`, unit: '(m, m³)', source: 'Synthetic piecewise-linear geometry, or explicitly rectangular fallback' },
        { name: 'Integration interval', value: l?.durationSec ?? world.clock.stepSec, unit: 's', source: l ? 'Recorded network ledger interval' : 'Configured timestep; no integrated ledger yet' },
        { name: 'Stage', value: s.levelM, unit: 'm above sump floor', source: 'water.ts stage-storage inverse (rectangular V/A fallback)' },
        { name: 'Inflow incl. transfers', value: s.inflowM3h, unit: 'm³/h', source: 'waterNetwork.ts explicit inflow ledger' },
        { name: l ? 'Actual withdrawal' : 'Pump outflow before first step', value: s.outflowM3h, unit: 'm³/h', source: l ? 'Finite available storage and calculated pumping' : 'Instantaneous modeled flow; no integrated withdrawal yet' },
        { name: 'Site residual', value: l?.residualM3 ?? 'Not stepped yet', unit: 'm³', source: 'Initial + external in − external out − overflow − final' }],
      steps: l ? [`Site initial ${l.initialM3} m³; external in ${l.externalInM3} m³.`,
        `External discharge ${l.externalOutM3} m³; overflow ${l.overflowM3} m³; final ${l.finalM3} m³.`,
        ...l.transfers.map(t => `${t.from} → ${t.to}: ${t.volumeM3} m³, counted once.`)] : ['Advance one model step to populate the conservation ledger.'] };
  }
  const zone = mine.zones.find(z => z.id === id);
  const material = mine.materialHandling;
  if (material && (id === 'mat-hoist' || material.routes.some(r => r.id === id))) {
    return { ...common, title: 'Capacity-constrained ore movement and finite inventory', quantity: 'Available transport throughput / buffered processing',
      equation: 'max Σqzone; qroute ≤ Croute × availability; Σqroute ≤ Choist; Vinventory,next = Vinventory + Tproduced − Tprocessed; 0 ≤ inventory ≤ configured capacity',
      inputs: [
        { name: 'Available mining source capacities', value: formatRates(world.materialFlow?.zonePotentialTph), unit: 't/h', source: 'Water/access, planned shift and restart-ramp evaluations before transport allocation' },
        { name: 'Allocated route flows', value: formatRates(world.materialFlow?.routeFlowsTph), unit: 't/h', source: 'materialHandling.ts bounded Edmonds–Karp maximum flow' },
        { name: 'Transported zone rates', value: formatRates(world.materialFlow?.zoneRatesTph), unit: 't/h', source: 'Flow from each zone node into available primary/alternate paths' },
        { name: 'Hoist capacity', value: scenario.overrides.engineering?.hoistAvailable === false ? 0 : scenario.overrides.engineering?.hoistCapacityTph ?? material.hoistCapacityTph, unit: 't/h', source: 'Synthetic common material-handling bottleneck / scenario override' },
        { name: 'Stored ore', value: world.oreBufferTonnes ?? 0, unit: 't', source: 'Canonical world inventory' },
        { name: 'Receiving capacity', value: scenario.overrides.engineering?.oreBufferCapacityTonnes ?? material.bufferCapacityTonnes, unit: 't', source: 'Finite synthetic buffer / scenario override' },
        { name: 'Last-step material residual', value: world.materialLedger?.residualTonnes ?? 'Not stepped yet', unit: 't', source: 'Initial inventory + actual received tonnes − actual processed tonnes − final inventory' },
      ], steps: [...material.routes.map(r => `${r.name}: ${world.materialFlow?.routeFlowsTph[r.id] ?? 0} t/h allocated; capacity ${scenario.overrides.engineering?.materialRoutes?.[r.id]?.capacityTph ?? r.capacityTph} t/h; available ${scenario.overrides.engineering?.materialRoutes?.[r.id]?.available ?? r.defaultAvailable}.`),
        ...(world.materialLedger ? [`Last step: ${world.materialLedger.initialBufferTonnes} t initial + ${world.materialLedger.producedTonnes} t mined/transported − ${world.materialLedger.processedTonnes} t processed = ${world.materialLedger.finalBufferTonnes} t stored.`,
          `${world.materialLedger.heldAtFaceTonnes} t held at face by receiving/transport limits; not treated as permanently lost.`] : ['Advance the clock to populate a material-conservation ledger.'])],
      assumptions: ['All route/hoist capacities and geometry are synthetic. Equal-value ore is allocated in deterministic graph order, not profit-priority order.',
        'Available mining is already constrained by water/access policy, shift and restart ramp. Alternate haulage does not make an inundated working zone operable.',
        'Finite inventory can delay processing effects; electrical service availability also limits processing.'],
      sensitivity: 'Change primary/alternate route capacities, common hoist capacity or finite buffer size in Production to re-run the same kernel.',
      limitations: ['No travel-time, queueing, truck cycle, shaft mechanics, haulage power or stockpile structural design.', 'No calibrated permanent-loss or profit-optimal production schedule.'],
      validation: 'Analytical capacity-flow and finite-inventory fixtures; software verification only.' };
  }
  if (zone) {
    const s = world.zones[id];
    return { ...common, title: `${zone.name} delayed production consequence`, quantity: 'Illustrative deferred production / access restriction',
      equation: 'haccess = zzone − zsump; ΔTdeferred = Qdesign (1 − availability) Δt/3600; bufferNext = buffer + oreProduced − oreProcessed',
       inputs: [{ name: 'Zone throughput', value: s.rateTph, unit: 't/h', source: 'production.ts computed storage/access policy' },
        { name: 'Design throughput', value: zone.designRateTph, unit: 't/h', source: 'Canonical production zone definition' },
        { name: 'Operating fraction', value: s.operatingRatio, unit: 'fraction', source: 'Water/access, schedule, restart ramp and material constraints' },
        { name: 'Recovery ceiling', value: s.recoveryRatio ?? s.operatingRatio, unit: 'fraction', source: 'Deterministic time-stepped recovery ramp' },
        { name: 'Foregone hours', value: s.lostHours, unit: 'h', source: 'Integrated fractional shortfall during planned work' },
        { name: 'Recorded zone value exposure', value: s.lostValueUSD, unit: 'USD', source: 'Integrated foregone tonnes × effective interval value per tonne' },
        { name: 'Current value per tonne', value: world.assumptionsSnapshot?.valuePerTonneUSD ?? 'Effective assumptions not recorded on legacy snapshot', unit: 'USD/t', source: 'Recorded effective assumptions; historical intervals may use different values' },
        { name: 'Foregone zone tonnes', value: s.lostTonnes, unit: 't', source: 'Left-endpoint integration of production shortfall; not confirmed permanent loss' },
        { name: 'Plant buffer', value: world.oreBufferTonnes ?? 0, unit: 't', source: 'Canonical material ledger; initial synthetic stockpile 560 t' },
        { name: 'Transported zone rate', value: world.materialFlow?.zoneRatesTph[id] ?? s.rateTph, unit: 't/h', source: 'Capacitated primary/alternative route and hoist maximum-flow evaluation' },
        { name: 'Deferred plant tonnes', value: world.deferredTonnes ?? 0, unit: 't', source: 'Planned throughput minus actual processing after buffer drawdown' },
        { name: 'Confirmed permanent loss', value: 'Not determined', unit: 't', source: 'No calibrated permanent-loss model' }],
      steps: [s.statusReason, 'Advisory/warning/critical retention policies = 90%/75%/50%; zone-floor exposure = 0%.',
        'Recovery increases only with simulated time, bounded by the configured restart-ramp duration and the physical/policy target.',
        'Primary and alternative ore routes share a bounded hoist and finite receiving buffer; process power and actual inventory bound processing.',
        'These are visible scenario policy assumptions. A power outage alone does not instantly flood access.',
        'Revenue exposure = deferred tonnes × configured value/tonne; recovery/permanent loss requires additional scheduling assumptions.'] };
  }
  return { ...common, title: 'Insufficient model capability', quantity: id, equation: 'Unsupported', inputs: [],
    steps: ['No traceable numerical analysis is registered for this quantity.'], validation: 'Unsupported; specialist model required.' };
}
