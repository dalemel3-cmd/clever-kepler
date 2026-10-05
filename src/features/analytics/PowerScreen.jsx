import React from 'react';
import { Zap, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { initialsFor } from '../../utils/athleteData';
import { card, h3, label, optionStyle, selectStyle, axis, grid, th, td, tooltipStyle, pct, shortDate, Chip, Tile, Sparkline, useVisibleWidth, useMoreColumns, MoreColumnsToggle } from '../../components/DeepDiveUi';
import { TEST_TYPES, TEST_TYPE_BY_KEY, VARIANT_LABEL, UNTAGGED_VARIANT_LABEL, formatMetric } from './testVariants';
import { buildPowerRows, powerFlags, variantsFor, variantOf, pbHistory, isAsc } from './powerMetrics';

// Performance > Jumps & Sprints: the in-depth, per-athlete view of Speed & Power
// results (vertical, board jump, 10yd fly). Analytics keeps its leaderboard for quick
// looks; this shows each athlete's PB, where they are against it, and their history.
// Results are only ever compared within one test *and* technique (variant) - an arm
// swing vertical and a hands-on-hips vertical are different tests.
const GREEN = '#34d399';
const variantName = (k) => (k === 'untagged' ? UNTAGGED_VARIANT_LABEL : VARIANT_LABEL[k] || k);
const dec = (unit) => (unit === 'sec' ? 2 : 1);

function AthleteDetail({ row, testKey, variant, allTests, onOpenProfile }) {
  const tt = TEST_TYPE_BY_KEY[testKey];
  const unit = tt?.unit || '';
  const chart = row.results.map(r => ({ date: shortDate(r.created_at), value: Number(r.metric) }));
  const pbIds = new Set(row.pbs.map(p => p.id));
  // PBs across every test/technique this athlete has results for.
  const groups = new Map();
  for (const r of allTests) {
    if (r.athlete_id !== row.athlete.id || !(Number(r.metric) > 0)) continue;
    const k = `${r.test_type}|${variantOf(r)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const allPbs = [...groups.entries()].map(([k, rs]) => {
    const [type, v] = k.split('|');
    const h = pbHistory(rs, isAsc(type));
    return { key: k, type, v, pb: h[h.length - 1], n: rs.length };
  }).sort((a, b) => a.type.localeCompare(b.type));
  const recent = [...row.results].reverse().slice(0, 12);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: '16px', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <span style={label}>{tt?.label || testKey} ({variantName(variant)}): every result (PB {formatMetric(row.pb, unit)})</span>
        <div style={{ width: '100%', height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={axis} tickLine={false} axisLine={false} width={44} domain={['auto', 'auto']} reversed={isAsc(testKey)} tickFormatter={v => Number(v).toFixed(dec(unit))} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v) => [formatMetric(v, unit), tt?.label || 'Result']} />
              <ReferenceLine y={row.pb} stroke="#b89c5b" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="value" stroke={GREEN} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <span style={{ ...label, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
          Dashed line: PB.{isAsc(testKey) ? ' Axis is flipped so faster times sit higher.' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
        <span style={label}>All tests: PBs</span>
        {allPbs.map(x => {
          const u = TEST_TYPE_BY_KEY[x.type]?.unit || '';
          const current = x.type === testKey && x.v === variant;
          return (
            <div key={x.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '13px' }}>
              <span style={{ fontWeight: 700, color: current ? '#b89c5b' : undefined }}>{TEST_TYPE_BY_KEY[x.type]?.label || x.type}{TEST_TYPE_BY_KEY[x.type]?.variants.length > 1 || x.v === 'untagged' ? ` · ${variantName(x.v)}` : ''}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>{formatMetric(x.pb.metric, u)} · {shortDate(x.pb.created_at)} · {x.n} result{x.n === 1 ? '' : 's'}</span>
            </div>
          );
        })}
        <span style={{ ...label, marginTop: '8px' }}>Recent results</span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ color: 'var(--color-text-muted)', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Date</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Result</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>vs PB</th>
                <th style={{ padding: '4px 6px', fontWeight: 700 }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(r => {
                const v = Number(r.metric);
                const off = isAsc(testKey) ? (v - row.pb) / row.pb : (row.pb - v) / row.pb;
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '6px', color: 'var(--color-text-muted)' }}>{shortDate(r.created_at)}</td>
                    <td style={{ padding: '6px', fontWeight: 700 }}>{formatMetric(v, unit)}{pbIds.has(r.id) && <span style={{ marginLeft: '6px', color: '#b89c5b', fontSize: '11px', fontWeight: 800 }}>PB</span>}</td>
                    <td style={{ padding: '6px', color: 'var(--color-text-muted)' }}>{off <= 0 ? 'PB' : `-${(off * 100).toFixed(1)}%`}</td>
                    <td style={{ padding: '6px', color: 'var(--color-text-muted)' }}>{r.source === 'plyomat' ? 'Plyomat' : 'Manual'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={onOpenProfile} style={{ alignSelf: 'flex-start', marginTop: '4px', background: 'transparent', border: '1px solid var(--color-accent)', color: 'var(--color-accent)', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer' }}>
          Open full profile
        </button>
      </div>
    </div>
  );
}

const SORTS = [
  { id: 'pb', label: 'PB (best first)', key: r => -r.rank },
  { id: 'offpb', label: 'Latest vs PB (furthest off first)', key: r => r.offPb ?? -1 },
  { id: 'change', label: 'Improvement in window', key: r => r.change ?? -Infinity },
  { id: 'recent', label: 'Most recently tested', key: r => -r.daysSince },
  { id: 'name', label: 'Name (A–Z)', key: null },
];

const PrintLeaderboard = React.lazy(() => import('../leaderboard/PrintLeaderboard'));

export default function PowerScreen({ athletes, performanceTests, liftLogs = [], settings = {}, setSelectedProfileId, fetchProfileData, setScreen, setProfileEntryScreen }) {
  const tests = React.useMemo(() => performanceTests || [], [performanceTests]);
  const [testKey, setTestKey] = React.useState(TEST_TYPES[1]?.key || TEST_TYPES[0].key);
  const variants = React.useMemo(() => variantsFor(tests, testKey), [tests, testKey]);
  const [variantPick, setVariantPick] = React.useState(null);
  // Default to the technique most results were tested under; reset when the test changes.
  const variant = variants.some(v => v.key === variantPick) ? variantPick : variants[0]?.key || 'untagged';
  const [sport, setSport] = React.useState('ALL');
  const [windowWeeks, setWindowWeeks] = React.useState(26);
  const [sortBy, setSortBy] = React.useState('pb');
  const [query, setQuery] = React.useState('');
  const [openId, setOpenId] = React.useState(null);
  const [scrollRef, visibleWidth] = useVisibleWidth();
  const [printLbOpen, setPrintLbOpen] = React.useState(false);
  const [more, toggleMore] = useMoreColumns('power');
  const tt = TEST_TYPE_BY_KEY[testKey];
  const unit = tt?.unit || '';

  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const roster = React.useMemo(() => athletes.filter(a => (sport === 'ALL' || (a.sport || 'General') === sport)), [athletes, sport]);
  const allRows = React.useMemo(() => buildPowerRows(roster, tests, { testKey, variant, windowWeeks }), [roster, tests, testKey, variant, windowWeeks]);
  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const r = q ? allRows.filter(x => x.athlete.name.toLowerCase().includes(q)) : [...allRows];
    const s = SORTS.find(x => x.id === sortBy) || SORTS[0];
    return s.key ? r.sort((a, b) => s.key(b) - s.key(a) || a.athlete.name.localeCompare(b.athlete.name)) : r.sort((a, b) => a.athlete.name.localeCompare(b.athlete.name));
  }, [allRows, query, sortBy]);

  const openProfile = (id) => {
    setSelectedProfileId(id);
    if (fetchProfileData) fetchProfileData(id);
    if (setProfileEntryScreen) setProfileEntryScreen('power');
    setScreen('profiles');
  };

  const testedInWindow = allRows.filter(r => r.testsInWindow > 0).length;
  const pbsInWindow = allRows.reduce((s, r) => s + r.pbsInWindow, 0);
  const offCount = allRows.filter(r => powerFlags(r, testKey).some(f => f.key === 'down')).length;
  const groupAvg = allRows.length ? allRows.reduce((s, r) => s + r.pb, 0) / allRows.length : null;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>PERFORMANCE &middot; JUMPS &amp; SPRINTS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>JUMPS &amp; SPRINTS</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            {tt?.label} · {variantName(variant)} · last {windowWeeks} weeks{sport !== 'ALL' ? ` · ${sport}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Test" value={testKey} onChange={e => { setTestKey(e.target.value); setVariantPick(null); setOpenId(null); }} className="input-glass" style={selectStyle}>
            {TEST_TYPES.map(x => <option key={x.key} value={x.key} style={optionStyle}>{x.label}</option>)}
          </select>
          {variants.length > 1 && (
            <select aria-label="Technique" value={variant} onChange={e => { setVariantPick(e.target.value); setOpenId(null); }} className="input-glass" style={selectStyle}>
              {variants.map(v => <option key={v.key} value={v.key} style={optionStyle}>{variantName(v.key)} ({v.count})</option>)}
            </select>
          )}
          <select aria-label="Sport filter" value={sport} onChange={e => setSport(e.target.value)} className="input-glass" style={selectStyle}>
            <option value="ALL" style={optionStyle}>All Sports</option>
            {sports.map(s => <option key={s} value={s} style={optionStyle}>{s}</option>)}
          </select>
          <select aria-label="Window" value={windowWeeks} onChange={e => setWindowWeeks(Number(e.target.value))} className="input-glass" style={selectStyle}>
            {[8, 12, 26, 52].map(w => <option key={w} value={w} style={optionStyle}>Last {w} weeks</option>)}
          </select>
          <select aria-label="Sort" value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-glass" style={selectStyle}>
            {SORTS.map(s => <option key={s.id} value={s.id} style={optionStyle}>Sort: {s.label}</option>)}
          </select>
          <button type="button" onClick={() => setPrintLbOpen(true)} className="input-glass" style={{ ...selectStyle, cursor: 'pointer', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
            Printable leaderboard
          </button>
        </div>
        {printLbOpen && (
          <React.Suspense fallback={null}>
            <PrintLeaderboard
              athletes={athletes}
              liftLogs={liftLogs}
              performanceTests={tests}
              settings={settings}
              initialMetricKey={`test:${testKey}:${variant}`}
              initialSport={sport}
              onClose={() => setPrintLbOpen(false)}
            />
          </React.Suspense>
        )}
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Tile value={`${testedInWindow}/${roster.length}`} text={`Tested (${windowWeeks} wk)`} />
        <Tile value={pbsInWindow} text={`PBs (${windowWeeks} wk)`} tone={pbsInWindow ? 'ok' : null} />
        <Tile value={offCount} text="Latest well off PB" tone={offCount ? 'warn' : null} />
        <Tile value={groupAvg == null ? '—' : formatMetric(groupAvg, unit)} text="Avg PB" />
      </div>

      <div className="card-glass" style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={h3}><Zap size={16} style={{ verticalAlign: '-2px', marginRight: '6px', color: GREEN }} />{tt?.label} results table</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: '0 1 420px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <MoreColumnsToggle more={more} onToggle={toggleMore} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input type="search" aria-label="Search athletes" placeholder="Search athletes" value={query} onChange={e => setQuery(e.target.value)} className="input-glass" style={{ ...selectStyle, width: '100%', paddingLeft: '34px' }} />
          </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {query ? `No athletes match "${query}".` : `No ${tt?.label || ''} results for this group yet.`}
          </div>
        ) : (
          <div ref={scrollRef} style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                  <th style={th}>Athlete</th>
                  <th style={th} title="Rank by PB within the athletes shown">Rank</th>
                  <th style={th}>PB</th>
                  <th style={th}>Latest</th>
                  <th style={th} title="How far the latest result is from the PB">Off PB</th>
                  {more && <th style={th} title="Best result in the window vs the first result in the window">Improved</th>}
                  {more && <th style={th} title="PB vs the average PB of their sport">vs Sport avg</th>}
                  {more && <th style={th}>PBs</th>}
                  {more && <th style={th} title="Results in the window / all time">Results</th>}
                  <th style={th}>Last 8</th>
                  <th style={th}>Flags</th>
                  <th style={th} aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const open = openId === r.athlete.id;
                  const flags = powerFlags(r, testKey);
                  return (
                    <React.Fragment key={r.athlete.id}>
                      <tr
                        data-testid="power-row"
                        onClick={() => setOpenId(open ? null : r.athlete.id)}
                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: open ? 'rgba(52, 211, 153, 0.08)' : 'transparent' }}
                      >
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.18)', color: '#6ee7b7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px', flex: 'none' }}>{initialsFor(r.athlete.name)}</span>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 700, color: 'var(--white)' }}>{r.athlete.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.athlete.sport || 'No sport'} · last {shortDate(r.latestResult.created_at)}</span>
                            </div>
                          </div>
                        </td>
                        <td style={td}>#{r.rank}</td>
                        <td style={{ ...td, fontWeight: 800, color: '#b89c5b' }}>{formatMetric(r.pb, unit)} <span style={{ color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 600 }}>{shortDate(r.pbResult.created_at)}</span></td>
                        <td style={td}>{formatMetric(r.latest, unit)}</td>
                        <td style={{ ...td, color: flags.some(f => f.key === 'down') ? '#ef4444' : undefined }}>{r.offPb > 0 ? `-${(r.offPb * 100).toFixed(1)}%` : 'At PB'}</td>
                        {more && <td style={{ ...td, color: r.change > 0 ? '#10b981' : undefined }}>{pct(r.change)}</td>}
                        {more && <td style={{ ...td, color: r.vsSport == null ? undefined : r.vsSport > 0 ? '#10b981' : '#f59e0b' }}>{pct(r.vsSport)}</td>}
                        {more && <td style={td}>{r.pbsInWindow}</td>}
                        {more && <td style={td}>{r.testsInWindow} / {r.tests}</td>}
                        <td style={td}><Sparkline values={isAsc(testKey) ? r.recent.map(v => -v) : r.recent} color={GREEN} ariaLabel={`Last ${r.recent.length} ${tt?.label} results`} /></td>
                        <td style={td}><div style={{ display: 'flex', gap: '4px' }}>{flags.map(f => <Chip key={f.key} tone={f.tone}>{f.label}</Chip>)}</div></td>
                        <td style={td} aria-hidden="true">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={more ? 12 : 8} style={{ padding: '0 0 12px' }}>
                            <div style={{ position: 'sticky', left: 0, width: visibleWidth || '100%' }}>
                              <AthleteDetail row={r} testKey={testKey} variant={variant} allTests={tests} onOpenProfile={() => openProfile(r.athlete.id)} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
          PB = best result ever for this test and technique ({isAsc(testKey) ? 'lowest time' : 'highest'}), the same number the Speed &amp; Power leaderboard and Profile show.
          Techniques are never mixed. "Off PB" flags a latest result more than {isAsc(testKey) ? '3' : '5'}% from the PB. Rank and sport averages use the athletes currently shown.
        </div>
      </div>
    </div>
  );
}
