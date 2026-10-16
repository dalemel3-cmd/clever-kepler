import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { buildProgressCard, CARD_METRICS } from './progressCardData';

// Athlete Progress Card (design handoff "HPD Athlete Reports" #1, docs/HANDOFF.md §119).
// One US Letter page, portrait, 0.5in margins: the 7.5 x 10in content box is a fixed
// 720 x 960px flex column so the footer always lands at the bottom of the one page.
const C = {
  navy900: '#061c41', navy700: '#133b78', navy100: '#e4eaf3', navy50: '#f2f5fa',
  gold500: '#b89c5b', gold700: '#93783f', white: '#ffffff',
  text: 'oklch(0.19 0.014 258)', muted: 'oklch(0.38 0.012 258)', border: 'oklch(0.88 0.006 258)',
  danger: 'oklch(0.55 0.16 25)', positive: 'oklch(0.42 0.09 152)',
};
const DISPLAY = "'Oswald', Impact, sans-serif";
const BODY = "'Manrope', 'Inter', system-ui, sans-serif";
const W = 720, H = 956; // a hair under 10in so rounding never spills onto a 2nd page

function SectionHead({ n, title, right }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingBottom: 6, borderBottom: `2px solid ${C.navy900}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.gold700 }}>{n}</span>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 22, textTransform: 'uppercase', color: C.navy900 }}>{title}</span>
      </div>
      {right}
    </div>
  );
}

function Spark({ m }) {
  const fill = (k) => (k === 'best' ? C.gold500 : k === 'last' ? C.navy900 : C.white);
  return (
    <div style={{ flex: 'none', width: 130, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <svg width="130" height="42" viewBox="0 0 130 44" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
        <line x1="6" y1="40" x2="124" y2="40" style={{ stroke: C.border }} strokeWidth="1" />
        {m.dots.length > 1 && <polyline points={m.pts} fill="none" style={{ stroke: C.navy900 }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {m.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} style={{ fill: fill(d.kind), stroke: C.navy900 }} strokeWidth="1.5" />)}
        {m.kind !== 'mass' && (() => {
          // Most recent result labelled at the latest dot (above it, or below if near the top).
          const d = m.dots[m.dots.length - 1];
          const above = d.y > 14;
          return <text data-testid="pc-recent" x={Math.min(d.x, 124)} y={above ? d.y - 7 : d.y + 14} textAnchor={m.dots.length > 1 ? 'end' : 'middle'} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 9.5, fill: C.navy900, stroke: C.white, strokeWidth: 3, paintOrder: 'stroke', strokeLinejoin: 'round' }}>{m.latestText}</text>;
        })()}
      </svg>
      <div style={{ position: 'relative', height: 11, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted }}>
        {m.months.map((mo, i) => <span key={i} style={{ position: 'absolute', left: Math.min(124, Math.max(0, mo.x)), transform: mo.x <= 8 ? 'none' : mo.x >= 120 ? 'translateX(-100%)' : 'translateX(-50%)', whiteSpace: 'nowrap' }}>{mo.text}</span>)}
      </div>
    </div>
  );
}

function Card({ card, showNote, showFocus = true, showTraining = true, showXbw = true, note, nextTest, today }) {
  // Shrink-to-fit: if everything switched on runs past one page, scale the content down
  // (never up) so the card is always exactly one Letter page.
  const innerRef = React.useRef(null);
  const [fit, setFit] = React.useState(1);
  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    // Measure the content's own height at zoom 1, then pick the zoom that fits H.
    const prevZoom = el.style.zoom, prevMin = el.style.minHeight, prevW = el.style.width;
    el.style.zoom = '1'; el.style.minHeight = '0px'; el.style.width = `${W}px`;
    const natural = el.offsetHeight;
    el.style.zoom = prevZoom; el.style.minHeight = prevMin; el.style.width = prevW;
    const next = natural > H ? Math.max(0.7, Math.floor((H / natural) * 1000) / 1000) : 1;
    if (Math.abs(next - fit) > 0.002) setFit(next);
  });
  const t = card.tiles;
  const tiles = [
    { n: t.prs, label: 'New PRs', sub: 'Best result came from the latest test', color: C.gold700 },
    { n: `${t.improved} / ${t.scored}`, label: `Improved since ${card.firstMonth || 'first test'}`, sub: 'First test to latest', color: C.navy900 },
    { n: t.top, label: `Top 5 in ${card.groupLabel}`, sub: `Rank on the ${card.groupLabel} team by best result`, color: C.navy900 },
  ];
  const tone = (m) => (m.deltaTone === 'up' ? C.positive : m.deltaTone === 'down' ? C.danger : C.navy900);
  return (
    <div className="pc-page" data-testid="progress-card" data-fit={fit} style={{ width: W, height: H, boxSizing: 'border-box', background: C.white, color: C.text, fontFamily: BODY, overflow: 'hidden', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
    <div ref={innerRef} style={{ width: W / fit, minHeight: H / fit, display: 'flex', flexDirection: 'column', zoom: fit < 1 ? fit : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, padding: '4px 0 12px', borderTop: `10px solid ${C.navy900}`, borderBottom: `3px solid ${C.gold500}` }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold700 }}>Human Performance · Progress Card</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 48, lineHeight: 1.02, textTransform: 'uppercase', color: C.navy900 }}>{card.name}</div>
          <div style={{ fontSize: 14, color: C.muted }}>{[card.sport, card.pos, card.classYear && `Class of ${card.classYear}`, card.span && `Testing ${card.span}`].filter(Boolean).join(' · ')}</div>
        </div>
        <img src="/hp-logo.png" alt="Shiloh Christian Human Performance" style={{ height: 88, flexShrink: 0, margin: '6px -12px 0 0' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: C.border, border: `1px solid ${C.border}`, marginTop: 12 }}>
        {tiles.map(tl => (
          <div key={tl.label} data-testid="pc-tile" style={{ background: C.white, padding: '7px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, lineHeight: 1, color: tl.color }}>{tl.n}</div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.navy900 }}>{tl.label}</div>
          </div>
        ))}
      </div>

      {showTraining && (() => {
        const t = card.training;
        const cells = t.sessions ? [
          ['Sessions', String(t.sessions), 'Last 4 weeks'],
          ['Avg RPE', t.avgRpe.toFixed(1), 'Session effort, 1–10'],
          ['Logged', t.rate != null ? `${t.loggedDays} / ${t.teamDays}` : String(t.loggedDays), t.rate != null ? `${t.rate}% of team session days` : 'Days with a session RPE'],
          ['Last', t.last, 'Most recent session'],
        ] : null;
        return (
          <div data-testid="pc-training" style={{ marginTop: 10, display: 'flex', alignItems: 'stretch', border: `1px solid ${C.border}`, background: C.navy50 }}>
            <div style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0 12px', background: C.navy900, color: C.white, fontFamily: DISPLAY, fontWeight: 600, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Training</div>
            {cells ? cells.map(([l, v, sub]) => (
              <div key={l} style={{ flex: 1, minWidth: 0, padding: '6px 12px', borderLeft: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, lineHeight: 1.1, color: C.navy900, whiteSpace: 'nowrap' }}>{v}</span>
                  <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.navy900, whiteSpace: 'nowrap' }}>{l}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
              </div>
            )) : <div style={{ padding: '8px 12px', fontSize: 12, color: C.muted }}>No session RPE logged in the last 4 weeks.</div>}
          </div>
        );
      })()}

      <div style={{ marginTop: 14 }}>
        <SectionHead n="01" title="Your Numbers" right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: C.muted }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: C.gold500 }} />Personal best</span>
            <span>Big number = personal best · Chart label = most recent · up = better</span>
          </div>
        )} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 24 }}>
        {card.metrics.length === 0 && <p style={{ gridColumn: '1 / -1', color: C.muted, fontSize: 13 }}>No results logged for this athlete yet.</p>}
        {card.metrics.map(m => m.na ? (
          <div key={m.key} data-testid="pc-metric" data-na="1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, lineHeight: 1, color: C.border }}>N/A</span>
                <span style={{ fontSize: 12, color: C.muted }}>{m.kind === 'mass' ? 'No weigh-ins yet' : 'Not tested yet'}</span>
              </div>
            </div>
            <svg width="130" height="44" viewBox="0 0 130 44" aria-hidden="true"><line x1="6" y1="40" x2="124" y2="40" style={{ stroke: C.border }} strokeWidth="1" strokeDasharray="3 3" /></svg>
          </div>
        ) : (
          <div key={m.key} data-testid="pc-metric" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: '1 1 auto' }}>
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span data-testid="pc-best" style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: m.kind === 'lift' ? 21 : 26, lineHeight: 1, color: C.navy900, whiteSpace: 'nowrap' }}>{m.bestText}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{m.unit}</span>
                {m.kind !== 'mass' && m.bestDay && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.gold700, whiteSpace: 'nowrap' }}>Best · {new Date(`${m.bestDay}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                {m.isPR && <span data-testid="pc-pr" style={{ padding: '2px 7px', borderRadius: 999, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', background: C.gold500, color: C.navy900 }}>PR</span>}
              </div>
              {m.showE1rm && m.bestE1rm != null && <div style={{ fontSize: 11, color: C.muted }}>Est. 1RM {m.bestE1rm} lb</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 8, rowGap: 0, fontSize: 11 }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: m.delta ? tone(m) : C.muted }}>{m.delta ? `${m.delta} since ${m.since}` : m.tests > 1 ? `No change since ${m.since}` : 'First test'}</span>
                {m.rankText && <span style={{ whiteSpace: 'nowrap', color: C.muted }}>{m.rankText}</span>}
                {showXbw && m.xbw && <span data-testid="pc-xbw" style={{ whiteSpace: 'nowrap', fontWeight: 700, color: C.navy700 }}>{m.xbw}</span>}
              </div>
            </div>
            <Spark m={m} />
          </div>
        ))}
      </div>

      {(showNote || showFocus) && <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: showNote && showFocus ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 24 }}>
        {showFocus && <div data-testid="pc-focus-section" style={{ display: 'flex', flexDirection: 'column' }}>
          <SectionHead n="02" title="Focus Next Block" />
          {card.focus.length ? card.focus.map(f => (
            <div key={f.label} data-testid="pc-focus" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.navy900 }}>{f.label}</span>
              <span style={{ fontSize: 12, lineHeight: 1.45, color: C.muted }}>{f.note}</span>
            </div>
          )) : (
            <div data-testid="pc-focus" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: C.navy900 }}>Keep building</span>
              <span style={{ fontSize: 12, lineHeight: 1.45, color: C.muted }}>Every latest result is within 3% of your best. Stay consistent and retest after the next block.</span>
            </div>
          )}
        </div>}
        {showNote && (
          <div data-testid="pc-note" style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionHead n={showFocus ? '03' : '02'} title="Coach's Note" />
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: note ? C.text : C.muted, whiteSpace: 'pre-wrap' }}>{note || 'Write a note in the toolbar above to add it here.'}</p>
            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}>
              <span>Human Performance Staff</span>{nextTest && <span>Next test · {new Date(`${nextTest}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            </div>
          </div>
        )}
      </div>}

      <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
        <span>Shiloh Christian Human Performance · Progress Card · {today}</span>
      </div>
    </div>
    </div>
  );
}

const MemoCard = React.memo(Card);

const label = { fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const field = { height: 40, padding: '0 10px', fontSize: 13, fontWeight: 700, borderRadius: 10 };
const toggleBtn = (on) => ({ ...field, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`, background: on ? 'rgba(184,156,91,0.18)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-muted)' });
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export default function ProgressCard({ athlete, athletes = [], liftLogs = [], performanceTests = [], reportData = [], settings: _settings, initialWho, onClose }) {
  const sports = React.useMemo(() => {
    const set = new Set();
    athletes.forEach(a => { if (a.sport) set.add(a.sport); });
    return Array.from(set).sort();
  }, [athletes]);

  const athleteCounts = React.useMemo(() => {
    const counts = {};
    athletes.forEach(a => {
      if (!a.archived_at) {
        const s = a.sport || 'General';
        counts[s] = (counts[s] || 0) + 1;
      }
    });
    return counts;
  }, [athletes]);

  const athletesSorted = React.useMemo(() => {
    return [...athletes]
      .filter(a => !a.archived_at)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [athletes]);

  const [who, setWho] = React.useState(() => {
    if (initialWho) return initialWho;
    if (athlete?.id) return athlete.id;
    if (athlete?.sport) return `sport:${athlete.sport}`;
    return sports[0] ? `sport:${sports[0]}` : (athletesSorted[0]?.id || '');
  });

  const roster = React.useMemo(() => {
    if (who.startsWith('sport:')) {
      const s = who.slice(6);
      return athletes
        .filter(a => !a.archived_at && (a.sport || 'General') === s)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    const a = athletes.find(x => x.id === who) || athlete;
    return a ? [a] : [];
  }, [who, athletes, athlete]);

  const isTeam = who.startsWith('sport:');
  const teamSport = isTeam ? who.slice(6) : null;
  const activeAthlete = isTeam ? null : (athletes.find(x => x.id === who) || athlete);

  const [showNote, setShowNote] = React.useState(() => load('hpd_pc_shownote', true));
  const [showE1rm, setShowE1rm] = React.useState(() => load('hpd_pc_e1rm', false));
  const [showTraining, setShowTraining] = React.useState(() => load('hpd_pc_training', true));
  const [showXbw, setShowXbw] = React.useState(() => load('hpd_pc_xbw', true));
  // Metrics toggled off (by CARD_METRICS key), remembered on this device.
  const [hidden, setHidden] = React.useState(() => load('hpd_pc_hidden', {}));
  const setHide = (next) => { setHidden(next); save('hpd_pc_hidden', next); };
  const liftKeys = CARD_METRICS.filter(m => m.kind === 'lift').map(m => m.key);
  const liftsOn = liftKeys.some(k => !hidden[k]);
  const [showFocus, setShowFocus] = React.useState(() => load('hpd_pc_focus', true));

  // Coach's note: if team, team note is stored at `hpd_pc_teamnote_${teamSport}`
  // If individual, stored at `hpd_pc_note_${activeAthlete.id}`
  const noteKey = activeAthlete ? `hpd_pc_note_${activeAthlete.id}` : (teamSport ? `hpd_pc_teamnote_${teamSport}` : 'hpd_pc_note_common');
  const [note, setNote] = React.useState(() => load(noteKey, ''));
  React.useEffect(() => { setNote(load(noteKey, '')); }, [noteKey]);
  const [nextTest, setNextTest] = React.useState(() => load('hpd_pc_nexttest', ''));

  const getNoteFor = (a) => {
    const individual = load(`hpd_pc_note_${a.id}`, '');
    if (individual) return individual;
    if (isTeam) return note;
    return note;
  };

  const cardsByAthlete = React.useMemo(() => {
    const map = new Map();
    for (const a of roster) {
      map.set(a.id, buildProgressCard({ athlete: a, athletes, liftLogs, performanceTests, reportData, showE1rm, hidden }));
    }
    return map;
  }, [roster, athletes, liftLogs, performanceTests, reportData, showE1rm, hidden]);

  const [scale, setScale] = React.useState(1);
  const today = new Date().toLocaleDateString('en-US');

  React.useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / (W + 96)));
    fit(); window.addEventListener('resize', fit);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('pc-printing');
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); document.body.classList.remove('pc-printing'); };
  }, [onClose]);

  return createPortal(
    <div className="pc-print-root" role="dialog" aria-modal="true" aria-label="Progress card" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0b1220', overflowY: 'auto' }}>
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          html body.pc-printing > *:not(.pc-print-root), html body.pc-printing > #root { display: none !important; }
          .pc-print-root { position: static !important; background: #fff !important; overflow: visible !important; }
          .pc-controls { display: none !important; }
          .pc-sheets-wrap { height: auto !important; padding: 0 !important; display: block !important; }
          .pc-sheets { transform: none !important; padding: 0 !important; box-shadow: none !important; width: auto !important; gap: 0 !important; display: block !important; }
          .pc-sheet { transform: none !important; padding: 0 !important; box-shadow: none !important; width: auto !important; height: auto !important; break-after: page; page-break-after: always; }
          .pc-sheet:last-child { break-after: auto !important; page-break-after: auto !important; }
          .pc-page { overflow: hidden !important; }
        }
      `}</style>
      <div className="pc-controls" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(3,10,20,0.96)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="pc-who" style={label}>Print for</label>
          <select id="pc-who" data-testid="pc-who" className="input-glass" style={field} value={who} onChange={e => setWho(e.target.value)}>
            <option value="" style={{ background: '#061c41', color: '#fff' }}>Choose team or athlete…</option>
            <optgroup label="Whole team (one page each)" style={{ background: '#061c41', color: '#fff' }}>
              {sports.map(s => (
                <option key={s} value={`sport:${s}`} style={{ background: '#061c41', color: '#fff' }}>
                  {s} Team ({athleteCounts[s] || 0} {athleteCounts[s] === 1 ? 'card' : 'cards'})
                </option>
              ))}
            </optgroup>
            <optgroup label="Individual athlete" style={{ background: '#061c41', color: '#fff' }}>
              {athletesSorted.map(a => (
                <option key={a.id} value={a.id} style={{ background: '#061c41', color: '#fff' }}>
                  {a.name} ({a.sport || 'General'})
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Show</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" data-testid="pc-toggle-lifts" aria-pressed={liftsOn} onClick={() => setHide({ ...hidden, ...Object.fromEntries(liftKeys.map(k => [k, liftsOn])) })} style={toggleBtn(liftsOn)}>All lifts</button>
            <button type="button" data-testid="pc-toggle-focus" aria-pressed={showFocus} onClick={() => { setShowFocus(!showFocus); save('hpd_pc_focus', !showFocus); }} style={toggleBtn(showFocus)}>Focus next block</button>
            <button type="button" data-testid="pc-toggle-note" aria-pressed={showNote} onClick={() => { setShowNote(!showNote); save('hpd_pc_shownote', !showNote); }} style={toggleBtn(showNote)}>Coach's note</button>
            <button type="button" data-testid="pc-toggle-training" aria-pressed={showTraining} onClick={() => { setShowTraining(!showTraining); save('hpd_pc_training', !showTraining); }} style={toggleBtn(showTraining)}>Training</button>
            <button type="button" data-testid="pc-toggle-xbw" aria-pressed={showXbw} onClick={() => { setShowXbw(!showXbw); save('hpd_pc_xbw', !showXbw); }} style={toggleBtn(showXbw)}>× BW</button>
            <button type="button" data-testid="pc-toggle-e1rm" aria-pressed={showE1rm} onClick={() => { setShowE1rm(!showE1rm); save('hpd_pc_e1rm', !showE1rm); }} style={toggleBtn(showE1rm)}>Est. 1RM</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexBasis: '100%' }}>
          <span style={label}>Metrics</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CARD_METRICS.map(m => (
              <button key={m.key} type="button" data-testid={`pc-metric-toggle-${m.key}`} aria-pressed={!hidden[m.key]} onClick={() => setHide({ ...hidden, [m.key]: !hidden[m.key] })} style={{ ...toggleBtn(!hidden[m.key]), height: 32, fontSize: 12 }}>{m.label}</button>
            ))}
          </div>
        </div>
        {showNote && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 280px' }}>
              <label htmlFor="pc-note" style={label}>Coach's note {isTeam ? `(${teamSport} team)` : (activeAthlete ? `(${activeAthlete.name})` : '')}</label>
              <textarea id="pc-note" data-testid="pc-note-input" className="input-glass" rows={2} maxLength={420} value={note} onChange={e => { setNote(e.target.value); save(noteKey, e.target.value); }}
                placeholder={isTeam ? `e.g. Strong block across ${teamSport}. Retest after the next cycle.` : "e.g. Strong block. Add contrast sets on lower days."} style={{ ...field, height: 'auto', minHeight: 40, padding: '8px 10px', fontWeight: 500, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="pc-next" style={label}>Next test</label>
              <input id="pc-next" type="date" className="input-glass" style={field} value={nextTest} onChange={e => { setNextTest(e.target.value); save('hpd_pc_nexttest', e.target.value); }} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <button type="button" data-testid="pc-print" onClick={() => window.print()} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: '#030a14', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
            <Printer size={16} aria-hidden="true" /> {roster.length > 1 ? `PDF / Print (${roster.length} cards)` : 'PDF / Print'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close progress card" style={{ ...field, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {!roster.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Pick a team or an athlete to build progress cards.</div>
      ) : (
        <div className="pc-sheets-wrap" style={{ height: ((H + 96) * roster.length + 32 * (roster.length - 1)) * scale + 48, display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <div className="pc-sheets" style={{ width: W + 96, display: 'flex', flexDirection: 'column', gap: 32, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            {roster.map(a => {
              const c = cardsByAthlete.get(a.id);
              if (!c) return null;
              return (
                <div key={a.id} className="pc-sheet" style={{ width: W + 96, padding: 48, boxSizing: 'border-box', background: '#fff', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', height: H + 96 }}>
                  <MemoCard card={c} showNote={showNote} showFocus={showFocus} showTraining={showTraining} showXbw={showXbw} note={getNoteFor(a)} nextTest={nextTest} today={today} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
