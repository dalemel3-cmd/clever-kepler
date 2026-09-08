import React from 'react';
import { Zap, Plus, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';
import { getCentralDateString, centralWallTimeToISO } from '../../utils/athleteData';
// Test type/variant definitions live in a plain-data module (no React) so the Plyomat
// importer can share them without pulling a component file into its pure-logic layer.
// Re-exported here so existing `from './SpeedPowerPanel'` imports elsewhere keep working.
import {
  TEST_TYPES, TEST_TYPE_BY_KEY, JUMP_VARIANTS, FLY_VARIANTS,
  VARIANT_LABEL, UNTAGGED_VARIANT_LABEL, TEAM_VARIANT_DEFAULTS, formatMetric,
} from './testVariants';
export { TEST_TYPES, TEST_TYPE_BY_KEY, JUMP_VARIANTS, FLY_VARIANTS, VARIANT_LABEL, UNTAGGED_VARIANT_LABEL, TEAM_VARIANT_DEFAULTS, formatMetric };

const PAGE_SIZE = 8;

// `performanceTests` defaults to [] rather than being assumed present. These rows are now
// fetched once in App.jsx and threaded down, and a missing prop anywhere on that path threw
// inside the boards reduce - which the error boundary turned into a blank *entire Analytics
// screen*, every chart with it, over one absent side panel. An empty board is the right
// failure mode for this card.
export default function SpeedPowerPanel({ athletes, sportFilter, openProfile, card, h3, eyebrow, grid: gridColor, performanceTests = [], addTest }) {
  const [athleteId, setAthleteId] = React.useState('');
  const [testType, setTestType] = React.useState(TEST_TYPES[0].key);
  // Which protocol/technique this result was measured under (see TEST_TYPES.variants).
  // A test type with only one variant never shows a picker - the value is set silently
  // so old and new rows still carry the tag once a second protocol shows up.
  const [variant, setVariant] = React.useState(TEST_TYPES[0].variants[0]?.key || '');
  const [value, setValue] = React.useState('');
  // Defaults to today but is editable, so a result from a test day that already
  // happened (a Plyomat session logged late, a fly time jotted on paper two weeks ago)
  // lands on the day it was actually run rather than the day someone got around to
  // typing it in - which matters for the trend badges and the comparison chart, both
  // of which read the timeline.
  const [testDate, setTestDate] = React.useState(() => getCentralDateString());
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');
  // Team Entry: one test type + one date shared across the whole roster, one input per
  // athlete, one submit - built because a real testing day is "everyone ran a fly 10
  // today", not "log one athlete, re-pick the type and date, log the next one" 20+ times.
  const [entryMode, setEntryMode] = React.useState('single');
  const [teamValues, setTeamValues] = React.useState({}); // { [athleteId]: string }
  const [teamVariant, setTeamVariant] = React.useState('');
  const [teamSaving, setTeamSaving] = React.useState(false);
  const [teamMessage, setTeamMessage] = React.useState('');
  // Which boards are expanded past the first page. A coach with a full roster needs to
  // see everyone eventually, but a wall of 50 rows by default drowns the "who's fastest
  // right now" glance this panel exists for - so start collapsed, let it open per board.
  const [expanded, setExpanded] = React.useState({});

  const activeTest = TEST_TYPE_BY_KEY[testType] || TEST_TYPES[0];
  const needsVariantPicker = activeTest.variants.length > 1;

  // Switching test type resets the variant: a single-variant type (Fly 10 today)
  // silently takes its one value; a multi-variant type (jump) defaults from the already-
  // selected athlete's team (if picking the athlete happened first, as it usually does)
  // or clears to blank otherwise - either way, a wrong technique never carries over from
  // whatever was picked last.
  React.useEffect(() => {
    if (activeTest.variants.length === 1) { setVariant(activeTest.variants[0].key); return; }
    const a = athletes.find(x => x.id === athleteId);
    setVariant((a && TEAM_VARIANT_DEFAULTS[a.sport]) || '');
  }, [testType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Team Entry applies one technique to the whole batch, so it defaults from the sport
  // filter (a single sport's team default) rather than per-athlete - a coach batch-tests
  // one team at a time in practice. Blank when the filter is ALL sports or the sport has
  // no default on file, requiring an explicit pick rather than guessing across teams.
  React.useEffect(() => {
    if (activeTest.variants.length === 1) { setTeamVariant(activeTest.variants[0].key); return; }
    setTeamVariant(TEAM_VARIANT_DEFAULTS[sportFilter] || '');
  }, [testType, sportFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const roster = React.useMemo(
    () => (sportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sportFilter)),
    [athletes, sportFilter]
  );
  const rosterIds = React.useMemo(() => new Set(roster.map(a => a.id)), [roster]);

  // Best result per athlete per test type *and variant*. Hands-on-hips and arm-swing
  // jumps aren't the same test - mixing them into one board would rank a technique
  // difference as an athletic one, so every group below is keyed on test_type + variant,
  // not test_type alone. A test type with only one variant (Fly 10 today) still groups
  // by it, which costs nothing since there's only one group to find.
  //
  // Separately, the two-most-recent-attempts trend (not best-vs-best) - the leaderboard
  // ranks on PBs, but a coach scanning it also wants "is this person trending up right
  // now", same framing as Profiles' weight/Fly-10 trends. A PB-only board would only
  // ever show green on the day a record falls; this shows it every session. Trend is
  // computed within a variant group too - a switch in technique between two attempts
  // would otherwise register as an athlete suddenly jumping 4 inches higher or lower.
  const groupKey = (testType, variantKey) => `${testType}::${variantKey}`;
  const { boards, trendByTypeAthlete } = React.useMemo(() => {
    const bestByGroupAthlete = new Map(); // groupKey -> athleteId -> row
    const attemptsByGroupAthlete = new Map(); // groupKey -> athleteId -> [rows]
    for (const t of performanceTests) {
      if (!t.athlete_id || !rosterIds.has(t.athlete_id)) continue;
      const tt = TEST_TYPE_BY_KEY[t.test_type];
      // A single-variant type (Fly 10 today) never splits by variant, regardless of
      // whether this particular row happens to carry the tag - an older row saved
      // before variants existed still belongs to the one protocol that type has.
      // Only a genuinely multi-variant type (jump) groups on the row's actual tag.
      const vk = (tt && tt.variants.length > 1) ? (t.test_variant || 'untagged') : ((tt && tt.variants[0]?.key) || 'untagged');
      const gk = groupKey(t.test_type, vk);
      if (!bestByGroupAthlete.has(gk)) bestByGroupAthlete.set(gk, new Map());
      const byAthlete = bestByGroupAthlete.get(gk);
      const existing = byAthlete.get(t.athlete_id);
      const better = tt ? tt.better : 'asc';
      const isBetter = !existing || (better === 'desc'
        ? Number(t.metric) > Number(existing.metric)
        : Number(t.metric) < Number(existing.metric));
      if (isBetter) byAthlete.set(t.athlete_id, t);

      if (!attemptsByGroupAthlete.has(gk)) attemptsByGroupAthlete.set(gk, new Map());
      const attempts = attemptsByGroupAthlete.get(gk);
      if (!attempts.has(t.athlete_id)) attempts.set(t.athlete_id, []);
      attempts.get(t.athlete_id).push(t);
    }

    const trend = new Map(); // `${groupKey}:${athleteId}` -> { delta, improving }
    for (const [gk, byAthlete] of attemptsByGroupAthlete) {
      const tt = TEST_TYPE_BY_KEY[gk.split('::')[0]];
      for (const [athleteId, list] of byAthlete) {
        if (list.length < 2) continue;
        const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        const latest = Number(sorted[sorted.length - 1].metric);
        const prev = Number(sorted[sorted.length - 2].metric);
        const delta = latest - prev;
        const better = tt ? tt.better : 'asc';
        const improving = better === 'desc' ? delta > 0 : delta < 0;
        trend.set(`${gk}:${athleteId}`, { delta, improving, latest, prev });
      }
    }

    const boards = [];
    for (const tt of TEST_TYPES) {
      const variantKeys = tt.variants.length > 1
        ? [...tt.variants.map(v => v.key), 'untagged']
        : [tt.variants[0]?.key || 'untagged'];
      const withData = variantKeys.filter(vk => {
        const byAthlete = bestByGroupAthlete.get(groupKey(tt.key, vk));
        return byAthlete && byAthlete.size > 0;
      });
      // A test type with zero results anywhere still gets one board, so "no results
      // logged yet" has somewhere to render - only an empty *variant* (one technique
      // with no data while another has some) is skipped as noise.
      const keysToRender = withData.length > 0 ? withData : [variantKeys[0]];
      for (const vk of keysToRender) {
        const gk = groupKey(tt.key, vk);
        const byAthlete = bestByGroupAthlete.get(gk);
        const all = byAthlete
          ? [...byAthlete.values()].sort((a, b) => tt.better === 'desc'
              ? Number(b.metric) - Number(a.metric)
              : Number(a.metric) - Number(b.metric))
          : [];
        const variantLabel = vk === 'untagged' ? UNTAGGED_VARIANT_LABEL : VARIANT_LABEL[vk];
        boards.push({
          ...tt,
          key: gk,
          variantKey: vk,
          label: (tt.variants.length > 1 && all.length > 0) ? `${tt.label} — ${variantLabel}` : tt.label,
          all,
        });
      }
    }
    return { boards, trendByTypeAthlete: trend };
  }, [performanceTests, rosterIds]);

  const handleSave = async (e) => {
    e.preventDefault();
    const v = parseFloat(value);
    if (!athleteId || !isFinite(v) || v <= 0 || (needsVariantPicker && !variant)) return;
    const athlete = athletes.find(a => a.id === athleteId);
    setSaving(true);
    setMessage('');
    const result = await addTest({
      athlete_id: athleteId,
      athlete_name: athlete ? athlete.name : 'Unknown',
      sport: athlete ? athlete.sport : '',
      test_type: testType,
      test_variant: variant || null,
      metric: v,
      unit: activeTest.unit,
      // Noon on the chosen day, same convention EntryScreen uses for a date-only log -
      // there's no real time-of-day for a test session, so an arbitrary time inside
      // that day avoids a timezone rollover pushing it onto the wrong calendar date.
      created_at: centralWallTimeToISO(testDate, '12:00'),
    });
    setSaving(false);
    setMessage(result.ok
      ? `Saved ${formatMetric(v, activeTest.unit)} for ${athlete ? athlete.name : 'athlete'} on ${testDate}.`
      : 'Saved locally — will sync once back online.');
    setValue('');
    setTimeout(() => setMessage(''), 3500);
  };

  const handleTeamSave = async (e) => {
    e.preventDefault();
    if (needsVariantPicker && !teamVariant) return;
    const entries = roster
      .map(a => ({ athlete: a, raw: teamValues[a.id] }))
      .filter(({ raw }) => raw != null && raw !== '' && isFinite(parseFloat(raw)) && parseFloat(raw) > 0);
    if (entries.length === 0) return;
    setTeamSaving(true);
    setTeamMessage('');
    const created_at = centralWallTimeToISO(testDate, '12:00');
    const results = await Promise.all(entries.map(({ athlete, raw }) => addTest({
      athlete_id: athlete.id,
      athlete_name: athlete.name,
      sport: athlete.sport,
      test_type: testType,
      test_variant: teamVariant || null,
      metric: parseFloat(raw),
      unit: activeTest.unit,
      created_at,
    })));
    setTeamSaving(false);
    const failed = results.filter(r => !r.ok).length;
    setTeamMessage(failed === 0
      ? `Saved ${entries.length} result${entries.length !== 1 ? 's' : ''} for ${testDate}.`
      : `Saved ${entries.length - failed} of ${entries.length} — the rest are queued to sync.`);
    // Clear only the rows that were actually submitted, leaving anything left blank
    // untouched in case the coach comes back to finish the sheet.
    setTeamValues(prev => {
      const next = { ...prev };
      entries.forEach(({ athlete }) => delete next[athlete.id]);
      return next;
    });
    setTimeout(() => setTeamMessage(''), 4000);
  };

  return (
    <div className="card-glass glow-card" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <span style={eyebrow('#fbbf24')}><Zap size={14} /> SPEED &amp; POWER</span>
          <h3 style={h3}>SPRINT & JUMP TESTING</h3>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {entryMode === 'single' ? 'Log a result for any past test date — not just today.' : 'Test the whole roster at once: one type and date, one input per athlete.'}
          </div>
        </div>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button type="button" onClick={() => setEntryMode('single')} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: entryMode === 'single' ? '#fbbf24' : 'transparent', color: entryMode === 'single' ? '#1a1305' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}>SINGLE ENTRY</button>
          <button type="button" onClick={() => setEntryMode('team')} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: entryMode === 'team' ? '#fbbf24' : 'transparent', color: entryMode === 'team' ? '#1a1305' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}>TEAM ENTRY</button>
        </div>
      </div>

      {entryMode === 'team' ? (
        <form onSubmit={handleTeamSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="sp-team-type" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Test</label>
              <select id="sp-team-type" className="input-glass" value={testType} onChange={e => setTestType(e.target.value)} style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }}>
                {TEST_TYPES.map(tt => <option key={tt.key} value={tt.key} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{tt.label}</option>)}
              </select>
            </div>
            {needsVariantPicker && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label htmlFor="sp-team-variant" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Technique</label>
                <select id="sp-team-variant" className="input-glass" value={teamVariant} onChange={e => setTeamVariant(e.target.value)} style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }} required>
                  <option value="" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>Select…</option>
                  {activeTest.variants.map(v => <option key={v.key} value={v.key} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{v.label}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="sp-team-date" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Test Date</label>
              <input
                id="sp-team-date"
                type="date"
                className="input-glass"
                value={testDate}
                max={getCentralDateString()}
                onChange={e => e.target.value && setTestDate(e.target.value)}
                style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }}
                required
              />
            </div>
            <button
              type="submit"
              disabled={teamSaving || roster.every(a => !teamValues[a.id]) || (needsVariantPicker && !teamVariant)}
              style={{
                height: '40px', padding: '0 18px', borderRadius: '10px', border: 'none',
                background: (roster.every(a => !teamValues[a.id]) || (needsVariantPicker && !teamVariant)) ? 'rgba(251, 191, 36, 0.25)' : 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
                color: '#1a1305', fontWeight: 800, fontSize: '13px', cursor: (roster.every(a => !teamValues[a.id]) || (needsVariantPicker && !teamVariant)) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <Plus size={15} /> {teamSaving ? 'SAVING…' : `SAVE ALL (${roster.filter(a => teamValues[a.id]).length})`}
            </button>
            {teamMessage && <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600, alignSelf: 'center' }}>{teamMessage}</span>}
          </div>
          {needsVariantPicker && !teamVariant && (
            <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>
              Filter to a single sport, or pick a technique above, before saving jump results as a batch.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', maxHeight: '360px', overflowY: 'auto', padding: '4px', border: `1px solid ${gridColor}`, borderRadius: '10px' }}>
            {roster.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', padding: '10px' }}>No athletes in this sport filter.</div>
            ) : roster.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${a.name} result in ${activeTest.unit === 'sec' ? 'seconds' : 'inches'}`}
                  className="input-glass"
                  value={teamValues[a.id] || ''}
                  onChange={e => {
                    const v = e.target.value.replace(/[^0-9.]/g, '');
                    setTeamValues(prev => ({ ...prev, [a.id]: v }));
                  }}
                  placeholder={activeTest.placeholder}
                  style={{ height: '32px', width: '80px', padding: '0 8px', fontSize: '12px', borderRadius: '8px', textAlign: 'center', flex: '0 0 auto' }}
                />
              </div>
            ))}
          </div>
        </form>
      ) : (
      <form onSubmit={handleSave} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px', minWidth: 0 }}>
          <label htmlFor="sp-athlete" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Athlete</label>
          {/* Native <option> popups don't inherit .input-glass's dark background on most
              platforms - they render on the OS's own white/light popup, so light
              --color-text on that light background was invisible until the browser's
              hover highlight happened to add contrast. Same fix EntryScreen's roster
              filters already use: color every option explicitly. */}
          <select
            id="sp-athlete"
            className="input-glass"
            value={athleteId}
            onChange={e => {
              const id = e.target.value;
              setAthleteId(id);
              // Default the variant from this athlete's team, if this test type has more
              // than one and nothing's been picked yet - still overridable below.
              if (needsVariantPicker && !variant) {
                const a = roster.find(x => x.id === id);
                const def = a && TEAM_VARIANT_DEFAULTS[a.sport];
                if (def) setVariant(def);
              }
            }}
            style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }}
            required
          >
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
        {needsVariantPicker && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label htmlFor="sp-variant" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Technique</label>
            <select id="sp-variant" className="input-glass" value={variant} onChange={e => setVariant(e.target.value)} style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }} required>
              <option value="" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>Select…</option>
              {activeTest.variants.map(v => <option key={v.key} value={v.key} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{v.label}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label htmlFor="sp-date" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Test Date</label>
          <input
            id="sp-date"
            type="date"
            className="input-glass"
            value={testDate}
            max={getCentralDateString()}
            onChange={e => e.target.value && setTestDate(e.target.value)}
            style={{ height: '40px', padding: '0 10px', fontSize: '13px', borderRadius: '10px' }}
            required
          />
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
          disabled={saving || !athleteId || !value || (needsVariantPicker && !variant)}
          style={{
            height: '40px', padding: '0 18px', borderRadius: '10px', border: 'none',
            background: (!athleteId || !value || (needsVariantPicker && !variant)) ? 'rgba(251, 191, 36, 0.25)' : 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
            color: '#1a1305', fontWeight: 800, fontSize: '13px', cursor: (!athleteId || !value || (needsVariantPicker && !variant)) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={15} /> {saving ? 'SAVING…' : 'LOG TEST'}
        </button>
        {message && <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600, alignSelf: 'center' }}>{message}</span>}
      </form>
      )}

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
