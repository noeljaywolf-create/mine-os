// Gate A: shared engineering core boundary.
// Current authoritative implementation lives in the web app at src/domain and src/simulation.
// Migration: extract/move these modules here and update imports; until then, consumers in-repo can
// depend on this package contract while web app remains source during transition.
export const ENGINEERING_CORE_VERSION = '0.1.0';
export const NOTE = 'Wraps existing deterministic simulation/domain logic; no calculation rewrites.';