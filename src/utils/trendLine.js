// Least-squares trend line for speed charts (v5.15.0, docs/HANDOFF.md §144). Speed is
// drawn as raw times, so faster sits lower, and this straight line over the points slopes
// down as an athlete gets faster. x is each point's place on the chart (0, 1, 2, ... in
// the order tested, the even spacing every chart here uses), so the line runs through the
// dots as drawn. Missing values are skipped; fewer than 2 points gives no line.
export function linearFit(values) {
  const pts = [];
  (values || []).forEach((v, i) => { if (v != null && Number.isFinite(+v)) pts.push([i, +v]); });
  if (pts.length < 2) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0;
  for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; }
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  return { slope, intercept, at: (x) => intercept + slope * x, from: pts[0][0], to: pts[n - 1][0] };
}

// The fitted value at every index from the first point to the last (null outside that
// span), ready to drop into chart rows as a dashed series.
export function trendSeries(values) {
  const f = linearFit(values);
  return (values || []).map((_, i) => (f && i >= f.from && i <= f.to ? +f.at(i).toFixed(4) : null));
}
