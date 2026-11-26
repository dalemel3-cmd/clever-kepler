// Smallest worthwhile change (SWC) and smallest effect size of interest (SESOI), v5.17.1
// (docs/HANDOFF.md §166). Owner's choice: SWC = 0.2 x the athlete's own standard deviation
// (Hopkins' "small" effect), worked out from their recent results; SESOI = a value the coach
// sets per number (shared by every device), blank = use the SWC. A change only counts as real
// when it is bigger than both.

export const SWC_FACTOR = 0.2;
export const MIN_BASELINE = 3; // results needed before a baseline means anything

const nums = (vals) => vals.map(Number).filter(v => Number.isFinite(v));
export const mean = (vals) => { const v = nums(vals); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
// Sample standard deviation (n - 1), or null under 2 values.
export function sd(vals) {
  const v = nums(vals);
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

// -> { mean, sd, swc, sesoi, threshold, n } from the baseline values, or null under MIN_BASELINE.
// `step`: the smallest difference the measure can show (1 count, 0.01 s, 0.5 in...). The threshold
// never drops below it, so identical baseline values (SD 0) don't make any change look real.
export function baselineOf(values, sesoi = null, step = 0) {
  const v = nums(values);
  if (v.length < MIN_BASELINE) return null;
  const m = mean(v), s = sd(v);
  const swc = SWC_FACTOR * s;
  const set = Number(sesoi) > 0 ? Number(sesoi) : null;
  return { mean: m, sd: s, swc, sesoi: set, threshold: Math.max(swc, set ?? 0, Number(step) || 0), n: v.length };
}

// Where `latest` sits against a baseline: 'up' | 'down' | 'trivial' (within the threshold), or
// null without a baseline. Up/down are raw directions; callers decide which is better.
export function changeVs(latest, base) {
  if (!base || latest == null || !Number.isFinite(Number(latest))) return null;
  const d = Number(latest) - base.mean;
  if (Math.abs(d) <= base.threshold) return { dir: 'trivial', diff: d };
  return { dir: d > 0 ? 'up' : 'down', diff: d };
}
