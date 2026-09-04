import React from 'react';
import { GitCompare, Search, X } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TEST_TYPES, TEST_TYPE_BY_KEY, formatMetric } from './SpeedPowerPanel';

// Distinct enough at a glance, and consistent for a given selection order - the same
// athlete keeps the same color as long as they stay in the same selection slot.
const LINE_COLORS = ['#fbbf24', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#f472b6'];
const MAX_ATHLETES = 6;

/**
 * Compares selected athletes' Speed & Power results over time, one test type at a
 * time. Unlike the leaderboards (best result only), this plots every attempt so a
 * coach can see the actual trajectory - and unlike weigh-ins, there is no fixed
 * cadence to bucket by day/week, so every real data point is shown rather than
 * averaged into a bucket that would either sit empty or blend two different athletes'
 * unrelated test days together.
 */
export default function AthleteComparisonPanel({ athletes, performanceTests, sportFilter, card, h3, eyebrow, grid: gridColor }) {
  const [testType, setTestType] = React.useState(TEST_TYPES[0].key);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [search, setSearch] = React.useState('');

  const activeTest = TEST_TYPE_BY_KEY[testType] || TEST_TYPES[0];

  const roster = React.useMemo(
    () => (sportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sportFilter)),
    [athletes, sportFilter]
  );

  const pickable = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter(a => !q || a.name.toLowerCase().includes(q));
  }, [roster, search]);

  const toggleAthlete = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_ATHLETES) return prev; // stays readable as a chart, not a haystack
      return [...prev, id];
    });
  };

  const selectedAthletes = React.useMemo(
    () => selectedIds.map(id => roster.find(a => a.id === id)).filter(Boolean),
    [selectedIds, roster]
  );

  // Every attempt for the selected athletes at the selected test type, in chronological
  // order. Two athletes testing on the same calendar day share one row (so the tooltip
  // reads as "this day, these results") - two attempts by the SAME athlete on different
  // days stay as separate points, since collapsing those would hide real improvement.
  const { chartData, perAthleteStats } = React.useMemo(() => {
    const rows = new Map(); // date -> { date, [athleteName]: value }
    const stats = new Map(); // athleteId -> { attempts: [...], best, latest }

    for (const t of performanceTests) {
      if (t.test_type !== testType || !selectedIds.includes(t.athlete_id)) continue;
      const day = String(t.created_at || '').slice(0, 10);
      if (!day) continue;
      if (!rows.has(day)) rows.set(day, { date: day });
      rows.get(day)[t.athlete_name] = Number(t.metric);

      if (!stats.has(t.athlete_id)) stats.set(t.athlete_id, { attempts: [] });
      stats.get(t.athlete_id).attempts.push({ date: day, value: Number(t.metric) });
    }

    for (const [id, s] of stats) {
      s.attempts.sort((a, b) => a.date.localeCompare(b.date));
      s.latest = s.attempts[s.attempts.length - 1];
      s.best = s.attempts.reduce((best, a) => {
        if (!best) return a;
        return activeTest.better === 'desc' ? (a.value > best.value ? a : best) : (a.value < best.value ? a : best);
      }, null);
      s.trend = s.attempts.length >= 2 ? s.latest.value - s.attempts[s.attempts.length - 2].value : null;
    }

    return {
      chartData: [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)),
      perAthleteStats: stats,
    };
  }, [performanceTests, testType, selectedIds, activeTest.better]);

  const axis = { stroke: 'var(--color-text-muted)', fontSize: 11 };

  return (
    <div className="card-glass glow-card" style={card}>
      <div>
        <span style={eyebrow('#fbbf24')}><GitCompare size={14} /> ATHLETE COMPARISON</span>
        <h3 style={h3}>SPEED &amp; POWER PROGRESSION OVER TIME</h3>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
          Pick up to {MAX_ATHLETES} athletes and a test to see every logged attempt plotted side by side.
        </div>
      </div>

      {/* Test type picker */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {TEST_TYPES.map(tt => (
          <button
            key={tt.key}
            type="button"
            onClick={() => setTestType(tt.key)}
            style={{
              padding: '8px 16px', borderRadius: '10px', fontSize: '12px', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer',
              border: testType === tt.key ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.12)',
              background: testType === tt.key ? 'rgba(251,191,36,0.15)' : 'transparent',
              color: testType === tt.key ? '#fbbf24' : 'var(--color-text-muted)',
            }}
          >
            {tt.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Athlete picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="input-glass"
              placeholder="Search roster..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: '36px', padding: '0 10px 0 30px', fontSize: '13px', borderRadius: '9px' }}
            />
          </div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {selectedIds.length} of {MAX_ATHLETES} selected
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto', border: `1px solid ${gridColor}`, borderRadius: '10px', padding: '6px' }}>
            {pickable.length === 0 && (
              <div style={{ padding: '10px', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>No athletes match.</div>
            )}
            {pickable.map(a => {
              const checked = selectedIds.includes(a.id);
              const disabled = !checked && selectedIds.length >= MAX_ATHLETES;
              return (
                <label
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 9px', borderRadius: '8px',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: checked ? 'rgba(251,191,36,0.1)' : 'transparent',
                    opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleAthlete(a.id)} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {a.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Chart + summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
          {selectedAthletes.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600, border: `1px dashed ${gridColor}`, borderRadius: '14px' }}>
              Select at least one athlete on the left to see their {activeTest.label} history.
            </div>
          ) : chartData.length === 0 ? (
            <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600, border: `1px dashed ${gridColor}`, borderRadius: '14px' }}>
              No {activeTest.label} results logged yet for {selectedAthletes.length === 1 ? selectedAthletes[0].name : 'these athletes'}.
            </div>
          ) : (
            <>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} width={44} unit={activeTest.unit === 'sec' ? 's' : '"'} />
                    <RechartsTooltip
                      contentStyle={{ background: 'var(--navy-900)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', fontSize: '12px' }}
                      labelStyle={{ color: 'var(--color-text-muted)', fontWeight: 700 }}
                      formatter={(value) => formatMetric(value, activeTest.unit)}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
                    {selectedAthletes.map((a, i) => (
                      <Line
                        key={a.id}
                        type="monotone"
                        dataKey={a.name}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Per-athlete best / latest / trend, so the chart's exact numbers don't
                  need to be read off the axis. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                {selectedAthletes.map((a, i) => {
                  const s = perAthleteStats.get(a.id);
                  if (!s) {
                    return (
                      <div key={a.id} style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: LINE_COLORS[i % LINE_COLORS.length] }}>{a.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>No {activeTest.label} results yet</div>
                      </div>
                    );
                  }
                  const improving = s.trend != null && (activeTest.better === 'desc' ? s.trend > 0 : s.trend < 0);
                  const declining = s.trend != null && !improving;
                  return (
                    <div key={a.id} style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: LINE_COLORS[i % LINE_COLORS.length], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                        <button
                          type="button"
                          onClick={() => toggleAthlete(a.id)}
                          aria-label={`Remove ${a.name} from comparison`}
                          style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>
                        Best {formatMetric(s.best.value, activeTest.unit)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Latest {formatMetric(s.latest.value, activeTest.unit)} ({s.latest.date})
                        {s.trend != null && (
                          <span style={{ marginLeft: '6px', fontWeight: 700, color: improving ? '#34d399' : declining ? '#f87171' : 'var(--color-text-muted)' }}>
                            {s.trend > 0 ? '+' : ''}{s.trend.toFixed(activeTest.unit === 'sec' ? 2 : 1)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{s.attempts.length} attempt{s.attempts.length !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
