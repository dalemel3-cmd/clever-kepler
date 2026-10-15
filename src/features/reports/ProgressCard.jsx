import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { buildProgressCard } from './progressCardData';

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
      <svg width="130" height="44" viewBox="0 0 130 44" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
        <line x1="6" y1="40" x2="124" y2="40" style={{ stroke: C.border }} strokeWidth="1" />
        {m.dots.length > 1 && <polyline points={m.pts} fill="none" style={{ stroke: C.navy900 }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {m.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} style={{ fill: fill(d.kind), stroke: C.navy900 }} strokeWidth="1.5" />)}
      </svg>
      <div style={{ position: 'relative', height: 11, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.muted }}>
        {m.months.map((mo, i) => <span key={i} style={{ position: 'absolute', left: Math.min(124, Math.max(0, mo.x)), transform: mo.x <= 8 ? 'none' : mo.x >= 120 ? 'translateX(-100%)' : 'translateX(-50%)', whiteSpace: 'nowrap' }}>{mo.text}</span>)}
      </div>
    </div>
  );
}

function Card({ card, showNote, note, nextTest, today }) {
  const t = card.tiles;
  const tiles = [
    { n: t.prs, label: 'New PRs', sub: 'Best result came from the latest test', color: C.gold700 },
    { n: `${t.improved} / ${t.scored}`, label: `Improved since ${card.firstMonth || 'first test'}`, sub: 'First test to latest', color: C.navy900 },
    { n: t.top, label: `Top 5 in ${card.groupLabel}`, sub: `Rank among ${card.groupLabel}s by best result`, color: C.navy900 },
  ];
  const tone = (m) => (m.deltaTone === 'up' ? C.positive : m.deltaTone === 'down' ? C.danger : C.navy900);
  return (
    <div className="pc-page" data-testid="progress-card" style={{ width: W, height: H, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: C.white, color: C.text, fontFamily: BODY, overflow: 'hidden', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, padding: '6px 0 16px', borderTop: `10px solid ${C.navy900}`, borderBottom: `3px solid ${C.gold500}` }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold700 }}>Human Performance · Progress Card</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 48, lineHeight: 1.02, textTransform: 'uppercase', color: C.navy900 }}>{card.name}</div>
          <div style={{ fontSize: 14, color: C.muted }}>{[card.sport, card.pos, card.classYear && `Class of ${card.classYear}`, card.span && `Testing ${card.span}`].filter(Boolean).join(' · ')}</div>
        </div>
        <img src="/hp-logo.png" alt="Shiloh Christian Human Performance" style={{ height: 88, flexShrink: 0, margin: '6px -12px 0 0' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: C.border, border: `1px solid ${C.border}`, marginTop: 16 }}>
        {tiles.map(tl => (
          <div key={tl.label} data-testid="pc-tile" style={{ background: C.white, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 34, lineHeight: 1, color: tl.color }}>{tl.n}</div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.navy900 }}>{tl.label}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{tl.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <SectionHead n="01" title="Your Numbers" right={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: C.muted }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: C.gold500 }} />Personal best</span>
            <span>Charts: up = better</span>
          </div>
        )} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 24 }}>
        {card.metrics.length === 0 && <p style={{ gridColumn: '1 / -1', color: C.muted, fontSize: 13 }}>No results logged for this athlete yet.</p>}
        {card.metrics.map(m => (
          <div key={m.key} data-testid="pc-metric" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 auto' }}>
              <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: m.kind === 'lift' ? 24 : 30, lineHeight: 1, color: C.navy900, whiteSpace: 'nowrap' }}>{m.latestText}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{m.unit}</span>
                {m.isPR && <span data-testid="pc-pr" style={{ padding: '2px 7px', borderRadius: 999, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', background: C.gold500, color: C.navy900 }}>PR</span>}
              </div>
              {m.showE1rm && m.latestE1rm != null && <div style={{ fontSize: 11, color: C.muted }}>Est. 1RM {m.latestE1rm} lb</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 10, rowGap: 1, fontSize: 12 }}>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: m.delta ? tone(m) : C.muted }}>{m.delta ? `${m.delta} since ${m.since}` : m.tests > 1 ? `No change since ${m.since}` : 'First test'}</span>
                {m.rankText && <span style={{ whiteSpace: 'nowrap', color: C.muted }}>{m.rankText}</span>}
              </div>
            </div>
            <Spark m={m} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: showNote ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
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
        </div>
        {showNote && (
          <div data-testid="pc-note" style={{ display: 'flex', flexDirection: 'column' }}>
            <SectionHead n="03" title="Coach's Note" />
            <p style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.55, color: note ? C.text : C.muted, whiteSpace: 'pre-wrap' }}>{note || 'Write a note in the toolbar above to add it here.'}</p>
            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.muted }}>
              <span>Human Performance Staff</span>{nextTest && <span>Next test · {new Date(`${nextTest}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', justifyContent: 'space-between', gap: 16, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
        <span>Shiloh Christian Human Performance · Progress Card · {today}</span>
        <span>Champions for Life</span>
      </div>
    </div>
  );
}

const label = { fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const field = { height: 40, padding: '0 10px', fontSize: 13, fontWeight: 700, borderRadius: 10 };
const toggleBtn = (on) => ({ ...field, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`, background: on ? 'rgba(184,156,91,0.18)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-muted)' });
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export default function ProgressCard({ athlete, athletes, liftLogs, performanceTests, reportData, settings, onClose }) {
  const [showNote, setShowNote] = React.useState(() => load('hpd_pc_shownote', true));
  const [showE1rm, setShowE1rm] = React.useState(() => load('hpd_pc_e1rm', false));
  // Coach's note and next test date are kept per athlete on this device.
  const noteKey = `hpd_pc_note_${athlete.id}`;
  const [note, setNote] = React.useState(() => load(noteKey, ''));
  const [nextTest, setNextTest] = React.useState(() => load('hpd_pc_nexttest', ''));
  const card = React.useMemo(() => buildProgressCard({ athlete, athletes, liftLogs, performanceTests, reportData, settings, showE1rm }),
    [athlete, athletes, liftLogs, performanceTests, reportData, settings, showE1rm]);
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
          .pc-sheet-wrap { height: auto !important; padding: 0 !important; display: block !important; }
          .pc-sheet { transform: none !important; padding: 0 !important; box-shadow: none !important; width: auto !important; height: auto !important; }
        }
      `}</style>
      <div className="pc-controls" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(3,10,20,0.96)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Show</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" data-testid="pc-toggle-note" aria-pressed={showNote} onClick={() => { setShowNote(!showNote); save('hpd_pc_shownote', !showNote); }} style={toggleBtn(showNote)}>Coach's note</button>
            <button type="button" data-testid="pc-toggle-e1rm" aria-pressed={showE1rm} onClick={() => { setShowE1rm(!showE1rm); save('hpd_pc_e1rm', !showE1rm); }} style={toggleBtn(showE1rm)}>Est. 1RM</button>
          </div>
        </div>
        {showNote && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 280px' }}>
              <label htmlFor="pc-note" style={label}>Coach's note</label>
              <textarea id="pc-note" data-testid="pc-note-input" className="input-glass" rows={2} maxLength={420} value={note} onChange={e => { setNote(e.target.value); save(noteKey, e.target.value); }}
                placeholder="e.g. Strong block. Add contrast sets on lower days." style={{ ...field, height: 'auto', minHeight: 40, padding: '8px 10px', fontWeight: 500, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="pc-next" style={label}>Next test</label>
              <input id="pc-next" type="date" className="input-glass" style={field} value={nextTest} onChange={e => { setNextTest(e.target.value); save('hpd_pc_nexttest', e.target.value); }} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          {card?.hiddenCount > 0 && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{card.hiddenCount} more metric{card.hiddenCount === 1 ? '' : 's'} not shown (8 fit on one page)</span>}
          <button type="button" data-testid="pc-print" onClick={() => window.print()} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: '#030a14', border: 'none', cursor: 'pointer', textTransform: 'uppercase' }}>
            <Printer size={16} aria-hidden="true" /> PDF / Print
          </button>
          <button type="button" onClick={onClose} aria-label="Close progress card" style={{ ...field, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="pc-sheet-wrap" style={{ height: (H + 96) * scale + 48, display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
        <div className="pc-sheet" style={{ width: W + 96, padding: 48, boxSizing: 'border-box', background: '#fff', boxShadow: '0 10px 40px rgba(0,0,0,0.4)', transform: `scale(${scale})`, transformOrigin: 'top center', height: H + 96 }}>
          {card && <Card card={card} showNote={showNote} note={note} nextTest={nextTest} today={today} />}
        </div>
      </div>
    </div>,
    document.body
  );
}
