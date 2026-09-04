import React from 'react';
import { Zap, Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';

// Test types this panel knows about today. `source: 'plyomat'` rows (once that importer
// exists) can carry a test_type not listed here - the leaderboard groups on whatever
// values actually show up in the data, not on this list, so a new type just appears
// rather than needing a code change.
//
// `better` says which direction counts as a personal best: 'asc' for a sprint time
// (lower is faster), 'desc' for a jump (higher is farther/taller). Getting this backwards
// would rank an athlete's worst jump as their best.
//
// Exported so Profiles (which shows "Best Fly 10", "Best Vertical", "Best Broad Jump"
// per athlete) can reduce the same performance_tests rows the same way, rather than
// re-deriving the better:'asc'|'desc' rule and risking the two screens disagreeing on
// what counts as a personal best.
export const TEST_TYPES = [
  { key: '10yd_fly', label: '10yd Fly', unit: 'sec', better: 'asc', placeholder: 'e.g. 1.62' },
  { key: 'vertical_jump', label: 'Vertical Jump', unit: 'in', better: 'desc', placeholder: 'e.g. 24.5' },
  { key: 'board_jump', label: 'Board Jump', unit: 'in', better: 'desc', placeholder: 'e.g. 96' },
];
export const TEST_TYPE_BY_KEY = Object.fromEntries(TEST_TYPES.map(t => [t.key, t]));
const PAGE_SIZE = 8;

export const formatMetric = (value, unit) => `${Number(value).toFixed(unit === 'sec' ? 2 : 1)} ${unit}`;

// `performanceTests` defaults to [] rather than being assumed present. These rows are now
// fetched once in App.jsx and threaded down, and a missing prop anywhere on that path threw
// inside the boards reduce - which the error boundary turned into a blank *entire Analytics
// screen*, every chart with it, over one absent side panel. An empty board is the right
// failure mode for this card.
export default function SpeedPowerPanel({ athletes, sportFilter, openProfile, card, h3, eyebrow, grid: gridColor, performanceTests = [], addTest }) {
  const [athleteId, setAthleteId] = React.useState('');
  const [testType, setTestType] = React.useState(TEST_TYPES[0].key);
  const [value, setValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  // Which boards are expanded past the first page. A coach with a full roster needs to
  // see everyone eventually, but a wall of 50 rows by default drowns the "who's fastest
  // right now" glance this panel exists for - so start collapsed, let it open per board.
  const [expanded, setExpanded] = React.useState({});

  const activeTest = TEST_TYPE_BY_KEY[testType] || TEST_TYPES[0];

  const roster = React.useMemo(
    () => (sportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sportFilter)),
    [athletes, sportFilter]
  );
  const rosterIds = React.useMemo(() => new Set(roster.map(a => a.id)), [roster]);

  // Best result per athlete per test type. A sprint/jump result is a personal best in a
  // way a weigh-in never is - unlike weight, there's no "current" reading, just the best
  // one recorded, so the leaderboard ranks bests rather than latest values.
  //
  // Separately, the two-most-recent-attempts trend (not best-vs-best) - the leaderboard
  // ranks on PBs, but a coach scanning it also wants "is this person trending up right
  // now", same framing as Profiles' weight/Fly-10 trends. A PB-only board would only
  // ever show green on the day a record falls; this shows it every session.
  const { boards, trendByTypeAthlete } = React.useMemo(() => {
    const bestByTypeAthlete = new Map(); // testType -> athleteId -> row
    const attemptsByTypeAthlete = new Map(); // testType -> athleteId -> [{metric, created_at}]
    for (const t of performanceTests) {
      if (!t.athlete_id || !rosterIds.has(t.athlete_id)) continue;
      const tt = TEST_TYPE_BY_KEY[t.test_type];
      if (!bestByTypeAthlete.has(t.test_type)) bestByTypeAthlete.set(t.test_type, new Map());
      const byAthlete = bestByTypeAthlete.get(t.test_type);
      const existing = byAthlete.get(t.athlete_id);
      const better = tt ? tt.better : 'asc';
      const isBetter = !existing || (better === 'desc'
        ? Number(t.metric) > Number(existing.metric)
        : Number(t.metric) < Number(existing.metric));
      if (isBetter) byAthlete.set(t.athlete_id, t);

      if (!attemptsByTypeAthlete.has(t.test_type)) attemptsByTypeAthlete.set(t.test_type, new Map());
      const attempts = attemptsByTypeAthlete.get(t.test_type);
      if (!attempts.has(t.athlete_id)) attempts.set(t.athlete_id, []);
      attempts.get(t.athlete_id).push(t);
    }

    const trend = new Map(); // `${testType}:${athleteId}` -> { delta, improving }
    for (const [key, byAthlete] of attemptsByTypeAthlete) {
      const tt = TEST_TYPE_BY_KEY[key];
      for (const [athleteId, list] of byAthlete) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const latest = Number(sorted[sorted.length - 1].metric);
        const prev = Number(sorted[sorted.length - 2].metric);
        const delta = latest - prev;
        const better = tt ? tt.better : 'asc';
        const improving = better === 'desc' ? delta > 0 : delta < 0;
        trend.set(`${key}:${athleteId}`, { delta, improving, latest, prev });
      }
    }

    const boards = TEST_TYPES.map(tt => {
      const byAthlete = bestByTypeAthlete.get(tt.key);
      const all = byAthlete
        ? [...byAthlete.values()].sort((a, b) => tt.better === 'desc'
            ? Number(b.metric) - Number(a.metric)
            : Number(a.metric) - Number(b.metric))
        : [];
      return { ...tt, all };
    });
    return { boards, trendByTypeAthlete: trend };
  }, [performanceTests, rosterIds]);

  const handleSave = async (e) => {
    e.preventDefault();
    const v = parseFloat(value);
    if (!athleteId || !isFinite(v) || v <= 0) return;
    const athlete = athletes.find(a => a.id === athleteId);
    setSaving(true);
    setMessage('');
    const result = await addTest({
      athlete_id: athleteId,
      athlete_name: athlete ? athlete.name : 'Unknown',
      sport: athlete ? athlete.sport : '',
      test_type: testType,
      metric: v,
      unit: activeTest.unit,
    });
    setSaving(false);
    setMessage(result.ok
      ? `Saved ${formatMetric(v, activeTest.unit)} for ${athlete ? athlete.name : 'athlete'}.`
      : 'Saved locally — will sync once back online.');
    setValue('');
    setTimeout(() => setMessage(''), 3500);
  };

  return (
    <div className="card-glass glow-card" style={card}>
      <div>
        <span style={eyebrow('#fbbf24')}><Zap size={14} /> SPEED &amp; POWER</span>
        <h3 style={h3}>SPRINT & JUMP TESTING</h3>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
          Manual entry today. Plyomat CSV import is planned but not built — see docs/HANDOFF.md §9.
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px', minWidth: 0 }}>
          <label htmlFor="sp-athlete" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Athlete</label>
          {/* Native <option> popups don't inherit .input-glass's dark background on most
              platforms - they render on the OS's own white/light popup, so light
              --color-text on that light background was invisible until the browser's
              hover highlight happened to add contrast. Same fix EntryScreen's roster
              filters already use: color every option explicitly. */}
          <select id="sp-athlete" className="input-glass" value={athleteId} onChange={e => setAthleteId(e.target.value)} style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }} required>
            <option value="" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>Select athlete…</option>
            {roster.map(a => <option key={a.id} value={a.id} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{a.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="sp-type" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Test</label>
          <select id="sp-type" className="input-glass" value={testType} onChange={e => setTestType(e.target.value)} style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }}>
            {TEST_TYPES.map(tt => <option key={tt.key} value={tt.key} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{tt.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="sp-value" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Result ({activeTest.unit})</label>
          <input
            id="sp-value"
            type="text"
            inputMode="decimal"
            aria-label={`Test result in ${activeTest.unit === 'sec' ? 'seconds' : 'inches'}`}
            className="input-glass"
            value={value}
            onChange={e => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder={activeTest.placeholder}
            style={{ height: '40px', width: '110px', padding: '0 10px', fontSize: '13px', borderRadius: '10px', textAlign: 'center' }}
            required
          />
        </div>
        <button
          type="submit"
          disabled={saving || !athleteId || !value}
          style={{
            height: '40px', padding: '0 18px', borderRadius: '10px', border: 'none',
            background: (!athleteId || !value) ? 'rgba(251, 191, 36, 0.25)' : 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
            color: '#1a1305', fontWeight: 800, fontSize: '13px', cursor: (!athleteId || !value) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={15} /> {saving ? 'SAVING…' : 'LOG TEST'}
        </button>
        {message && <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600, alignSelf: 'center' }}>{message}</span>}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', borderTop: `1px solid ${gridColor}`, paddingTop: '16px' }}>
        {boards.map(b => {
          const isOpen = !!expanded[b.key];
          const visible = isOpen ? b.all : b.all.slice(0, PAGE_SIZE);
          const hiddenCount = b.all.length - visible.length;
          return (
            <div key={b.key}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>{b.label} — Best {b.unit === 'sec' ? 'Times' : 'Results'}</span>
                {b.all.length > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>{b.all.length}</span>}
              </span>
              {b.all.length === 0 ? (
                <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  No {b.label.toLowerCase()} results logged yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {visible.map((r, i) => {
                    const trend = trendByTypeAthlete.get(`${b.key}:${r.athlete_id}`);
                    // % change between this athlete's two most recent attempts - not
                    // best-vs-best (the number shown is still their PB), so the badge
                    // moves every session instead of only on a new record.
                    const pct = trend && trend.prev ? (trend.delta / trend.prev) * 100 : null;
                    return (
                      <div
                        key={r.athlete_id}
                        onClick={() => openProfile(r.athlete_id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
                      >
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800, color: 'var(--color-text-muted)', width: '22px', flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--white)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.athlete_name}</span>
                        {pct != null && isFinite(pct) && Math.abs(pct) >= 0.1 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px', fontSize: '11px', fontWeight: 800, color: trend.improving ? '#34d399' : '#f87171' }}>
                            {/* Arrow reflects the raw number's direction (time/inches up
                                or down); color reflects whether that direction is good -
                                a faster (lower) fly time is an ArrowDown colored green,
                                a shorter (lower) jump is an ArrowDown colored red. */}
                            {trend.delta < 0 ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
                            {Math.abs(pct).toFixed(1)}%
                          </span>
                        )}
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: '#fbbf24' }}>{formatMetric(r.metric, b.unit)}</span>
                      </div>
                    );
                  })}
                  {b.all.length > PAGE_SIZE && (
                    <button
                      type="button"
                      onClick={() => setExpanded(prev => ({ ...prev, [b.key]: !prev[b.key] }))}
                      className="glow-card"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '8px', borderRadius: '10px', background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em' }}
                    >
                      {isOpen ? <><ChevronUp size={13} /> Show fewer</> : <><ChevronDown size={13} /> Show all {b.all.length} ({hiddenCount} more)</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
