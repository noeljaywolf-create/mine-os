import type { MineDefinition } from '../domain/mine';
import type { EngineeringOverrides } from '../domain/engineering';
import type { WorldState } from '../domain/types';
import { productionIsScheduled } from './production';

export const RECOVERY_CRITERIA = { throughputFraction: 0.95, sustainSec: 900, maxSampleGapSec: 300, storageToleranceM3: 0.01 };
/** Sampled achieved performance, not a configured repair/response delay.
 * Recovery must persist for 15 minutes and storage must not grow over that window. */
export function achievedRecovery(mine: MineDefinition, frames: readonly WorldState[], settings: EngineeringOverrides = {}) {
  const first = frames[0]?.clock.elapsedSec ?? 0;
  let startIndex = -1;
  for (let i = 0; i < frames.length; i++) {
    const w = frames[i];
    if (!Number.isFinite(w.clock.elapsedSec) || w.clock.elapsedSec < 0 || i > 0 && w.clock.elapsedSec <= frames[i - 1].clock.elapsedSec)
      throw new Error('Recovery assessment requires finite, nonnegative, strictly increasing frame times.');
    if (i > 0 && w.clock.elapsedSec - frames[i - 1].clock.elapsedSec > RECOVERY_CRITERIA.maxSampleGapSec) startIndex = -1;
    const e = w.scenarioSnapshot?.engineering ?? settings;
    const operating = productionIsScheduled(w.clock.elapsedSec, e) &&
      mine.zones.every(z => (w.zones[z.id]?.operatingRatio ?? 0) >= RECOVERY_CRITERIA.throughputFraction) &&
      (w.assets[mine.plant.id]?.effectiveness ?? 0) >= RECOVERY_CRITERIA.throughputFraction &&
      mine.sumps.every(s => {
        const limit = s.thresholds.find(t => t.severity === 'warning')?.levelM ?? s.thresholds.find(t => t.severity === 'critical')?.levelM ?? Infinity;
        const storage = w.sumps[s.id];
        return !!storage && Number.isFinite(storage.volumeM3) && storage.volumeM3 >= 0 && storage.levelM < limit;
      });
    if (!operating) { startIndex = -1; continue; }
    if (startIndex < 0) startIndex = i;
    // Slide the candidate start until each storage node is stable or drawing down.
    while (startIndex < i && mine.sumps.some(s => w.sumps[s.id].volumeM3 > frames[startIndex].sumps[s.id].volumeM3 + RECOVERY_CRITERIA.storageToleranceM3)) startIndex++;
    if (w.clock.elapsedSec - frames[startIndex].clock.elapsedSec >= RECOVERY_CRITERIA.sustainSec) {
      return { recovered: true, achievedAtHours: (frames[startIndex].clock.elapsedSec - first) / 3600,
        confirmedAtHours: (w.clock.elapsedSec - first) / 3600,
        resolutionSec: Math.max(0, ...frames.slice(1, i + 1).map((f, j) => f.clock.elapsedSec - frames[j].clock.elapsedSec)),
        criteria: RECOVERY_CRITERIA, reason: 'At least 95% zone and plant throughput, storage below warning and non-growing per-sump inventory, sustained for at least 15 minutes.' };
    }
  }
  return { recovered: false, achievedAtHours: null, confirmedAtHours: null,
    resolutionSec: Math.max(0, ...frames.slice(1).map((w, i) => w.clock.elapsedSec - frames[i].clock.elapsedSec)),
    criteria: RECOVERY_CRITERIA, reason: 'Recovery was not confirmed within the modeled horizon. Off-shift or a window shorter than 15 minutes cannot establish recovery; this is a censored result, not an infinite recovery estimate.' };
}
