import React from 'react';
import { Zap, Plus } from 'lucide-react';
import { usePerformanceTests } from './usePerformanceTests';

// Test types this panel knows about today. `source: 'plyomat'` rows (once that importer
// exists) can carry a test_type not listed here - the leaderboard groups on whatever
// values actually show up in the data, not on this list, so a new type just appears
// rather than needing a code change.
const TEST_TYPES = [
  { key: '10yd_fly', label: '10yd Fly', unit: 'sec' },
  { key: 'laser_time', label: 'Laser Time', unit: 'sec' },
];

export default function SpeedPowerPanel({ athletes, sportFilter, openProfile, card, h3, eyebrow, grid: gridColor }) {
  const { performanceTests, addTest } = usePerformanceTests();
  const [athleteId, setAthleteId] = React.useState('');
  const [testType, setTestType] = React.useState(TEST_TYPES[0].key);
  const [time, setTime] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const roster = React.useMemo(
    () => (sportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sportFilter)),
    [athletes, sportFilter]
  );
  const rosterIds = React.useMemo(() => new Set(roster.map(a => a.id)), [roster]);

  // Best (lowest) time per athlete per test type. A sprint/jump time is a personal best
  // in a way a weigh-in never is - unlike weight, there's no "current" reading, just the
  // fastest one recorded, so the leaderboard ranks bests rather than latest values.
  const boards = React.useMemo(() => {
    const bestByTypeAthlete = new Map(); // testType -> athleteId -> row
    for (const t of performanceTests) {
      if (!t.athlete_id || !rosterIds.has(t.athlete_id)) continue;
      if (!bestByTypeAthlete.has(t.test_type)) bestByTypeAthlete.set(t.test_type, new Map());
      const byAthlete = bestByTypeAthlete.get(t.test_type);
      const existing = byAthlete.get(t.athlete_id);
      if (!existing || Number(t.metric) < Number(existing.metric)) byAthlete.set(t.athlete_id, t);
    }
    return TEST_TYPES.map(tt => {
      const byAthlete = bestByTypeAthlete.get(tt.key);
      const rows = byAthlete
        ? [...byAthlete.values()].sort((a, b) => Number(a.metric) - Number(b.metric)).slice(0, 8)
        : [];
      return { ...tt, rows };
    });
  }, [performanceTests, rosterIds]);

  const handleSave = async (e) => {
    e.preventDefault();
    const t = parseFloat(time);
    if (!athleteId || !isFinite(t) || t <= 0) return;
    const athlete = athletes.find(a => a.id === athleteId);
    setSaving(true);
    setMessage('');
    const result = await addTest({
      athlete_id: athleteId,
      athlete_name: athlete ? athlete.name : 'Unknown',
      sport: athlete ? athlete.sport : '',
      test_type: testType,
      metric: t,
      unit: 'sec',
    });
    setSaving(false);
    setMessage(result.ok
      ? `Saved ${t}s for ${athlete ? athlete.name : 'athlete'}.`
      : 'Saved locally — will sync once back online.');
    setTime('');
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
          <label htmlFor="sp-time" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Time (sec)</label>
          <input
            id="sp-time"
            type="text"
            inputMode="decimal"
            aria-label="Test time in seconds"
            className="input-glass"
            value={time}
            onChange={e => setTime(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="e.g. 1.62"
            style={{ height: '40px', width: '110px', padding: '0 10px', fontSize: '13px', borderRadius: '10px', textAlign: 'center' }}
            required
          />
        </div>
        <button
          type="submit"
          disabled={saving || !athleteId || !time}
          style={{
            height: '40px', padding: '0 18px', borderRadius: '10px', border: 'none',
            background: (!athleteId || !time) ? 'rgba(251, 191, 36, 0.25)' : 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
            color: '#1a1305', fontWeight: 800, fontSize: '13px', cursor: (!athleteId || !time) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={15} /> {saving ? 'SAVING…' : 'LOG TEST'}
        </button>
        {message && <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600, alignSelf: 'center' }}>{message}</span>}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', borderTop: `1px solid ${gridColor}`, paddingTop: '16px' }}>
        {boards.map(b => (
          <div key={b.key}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '10px' }}>
              {b.label} — Best Times
            </span>
            {b.rows.length === 0 ? (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                No {b.label.toLowerCase()} results logged yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {b.rows.map((r, i) => (
                  <div
                    key={r.athlete_id}
                    onClick={() => openProfile(r.athlete_id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800, color: 'var(--color-text-muted)', width: '18px', flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--white)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.athlete_name}</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: '#fbbf24' }}>{Number(r.metric).toFixed(2)}s</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
