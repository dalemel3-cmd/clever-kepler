import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { buildCard, maxesFor, MAX_KEYS, MAX_WINDOWS } from './programData';
import { displayName } from '../reports/readinessData';

// Weight Room Card (design handoff "HPD Athlete Reports" #3, docs/HANDOFF.md §120).
// US Letter landscape, 0.4in page margin: each card is a fixed 976 x 732px box (10.17 x
// 7.63in) so one athlete is always exactly one page. Printing a team = one page each.
const C = {
  navy900: '#061c41', navy50: '#f2f5fa', gold300: '#d3bf8c', gold500: '#b89c5b', gold700: '#93783f', gold50: '#f7f0e0', gold900: '#6f5c33', white: '#fff',
  text: 'oklch(0.19 0.014 258)', muted: 'oklch(0.38 0.012 258)', border: 'oklch(0.88 0.006 258)', borderStrong: 'oklch(0.79 0.008 258)',
};
const DISPLAY = "'Oswald', Impact, sans-serif";
const BODY = "'Manrope', 'Inter', system-ui, sans-serif";
const W = 976, H = 732;
const upper = { textTransform: 'uppercase' };

function Day({ d, wide, showRecord }) {
  const cols = wide ? (showRecord ? '52px 34px 30px 34px 54px' : '52px 34px 30px 34px') : (showRecord ? 'minmax(0,1fr) 32px 28px 30px minmax(0,1.2fr)' : 'minmax(0,1fr) 32px 28px 30px');
  const list = (items, n) => (
    <div style={{ display: 'grid', gridTemplateColumns: wide ? `repeat(${n},minmax(0,1fr))` : 'minmax(0,1fr)', columnGap: 12, fontSize: 10.5, lineHeight: 1.45, color: C.text }}>
      {items.map((w, i) => <span key={i}>{w}</span>)}
    </div>
  );
  const SetRow = ({ st, h, fs }) => (
    <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: wide ? 6 : 4, alignItems: 'center', height: h, fontSize: fs }}>
      <span style={{ textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap', color: C.navy900 }}>{st.reps}</span>
      <span data-testid="wr-wt" style={{ textAlign: 'right', fontWeight: 700, color: C.navy900 }}>{st.wt}</span>
      <span style={{ textAlign: 'right', fontSize: fs - 1, color: C.muted }}>{st.pct}</span>
      <span style={{ textAlign: 'center', fontSize: fs - 1, color: C.muted }}>{st.tempo}</span>
      {showRecord && <span style={{ height: h - 4, borderBottom: `1px solid ${C.borderStrong}` }} />}
    </div>
  );
  const Vel = ({ b, ml = 0 }) => b.hasVel && <span style={{ alignSelf: 'flex-start', margin: `${wide ? 2 : 1}px 0 0 ${ml}px`, padding: '0 6px', borderRadius: 999, fontWeight: 700, fontSize: wide ? 9 : 8.5, letterSpacing: '0.04em', background: C.gold50, color: C.gold900 }}>Target {b.velocity} m/s</span>;
  return (
    <div data-testid="wr-day" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, border: `1px solid ${C.borderStrong}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, padding: '6px 8px', background: C.navy900 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, letterSpacing: '0.02em', ...upper, color: C.white }}>{d.dateLabel || d.focus || 'Session'}</span>
        <span style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', ...upper, color: C.gold300 }}>{d.dateLabel ? d.focus : ''}</span>
      </div>
      {d.warm?.length > 0 && (
        <div style={{ padding: '5px 8px', background: C.navy50, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', ...upper, color: C.gold700 }}>Pre-Lift · {d.warmTitle}</div>
          {list(d.warm, 2)}
        </div>
      )}
      {wide ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', columnGap: 6, padding: '4px 8px', borderBottom: `1px solid ${C.borderStrong}`, fontWeight: 700, fontSize: 9, letterSpacing: '0.08em', ...upper, color: C.muted }}>
            <span /><span>Exercise</span>
            <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 6 }}><span style={{ textAlign: 'center' }}>Reps</span><span style={{ textAlign: 'right' }}>WT</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'center' }}>Tempo</span>{showRecord && <span style={{ textAlign: 'center' }}>Record</span>}</div>
          </div>
          {d.blocks.map(b => (
            <div key={b.id || b.code + b.name} data-testid="wr-block" style={{ display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', columnGap: 6, padding: '3px 8px', borderBottom: `1px solid ${C.border}`, borderTop: b.newGroup ? `1px solid ${C.borderStrong}` : 0 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 13, lineHeight: '18px', color: C.gold700 }}>{b.code}</span>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 12, lineHeight: '18px', color: C.navy900 }}>{b.name}</span>
                {b.note && <span style={{ fontSize: 10, lineHeight: 1.3, color: C.muted }}>{b.note}</span>}
                <Vel b={b} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {b.isRx ? <SetRow st={{ reps: b.rx, wt: '', pct: '', tempo: '' }} h={18} fs={12} /> : b.rows.map((st, i) => <SetRow key={i} st={st} h={18} fs={12} />)}
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 4, padding: '3px 8px 3px 30px', borderBottom: `1px solid ${C.borderStrong}`, fontWeight: 700, fontSize: 8, letterSpacing: '0.08em', ...upper, color: C.muted }}>
            <span style={{ textAlign: 'center' }}>Reps</span><span style={{ textAlign: 'right' }}>WT</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'center' }}>Tempo</span>{showRecord && <span style={{ textAlign: 'center' }}>Rec.</span>}
          </div>
          {d.blocks.map(b => (
            <div key={b.id || b.code + b.name} data-testid="wr-block" style={{ display: 'flex', flexDirection: 'column', padding: '2px 10px', borderBottom: `1px solid ${C.border}`, borderTop: b.newGroup ? `1px solid ${C.borderStrong}` : 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <span style={{ flex: 'none', width: 18, fontFamily: DISPLAY, fontWeight: 600, fontSize: 12, lineHeight: '16px', color: C.gold700 }}>{b.code}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 11, lineHeight: '16px', color: C.navy900 }}>{b.name}</span>
                {b.isRx && <span style={{ flex: 'none', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', color: C.navy900 }}>{b.rx}</span>}
              </div>
              {b.note && <span style={{ paddingLeft: 24, fontSize: 9.5, lineHeight: 1.3, color: C.muted }}>{b.note}</span>}
              <Vel b={b} ml={24} />
              {!b.isRx && <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 22 }}>{b.rows.map((st, i) => <SetRow key={i} st={st} h={16} fs={11} />)}</div>}
            </div>
          ))}
        </>
      )}
      {d.fin?.length > 0 && (
        <div style={{ marginTop: 'auto', padding: '5px 8px', background: C.navy50, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', ...upper, color: C.gold700 }}>{d.finTitle}</div>
          {list(d.fin, 3)}
        </div>
      )}
    </div>
  );
}

const Card = React.memo(function Card({ programMeta, maxMapBase, athleteOverrides, athlete, liftLogs, showVelocity, seasonStartDate, showRecord }) {
  const programForCard = React.useMemo(() => ({
    ...programMeta,
    max_map: athleteOverrides ? { ...maxMapBase, overrides: { [athlete.id]: athleteOverrides } } : maxMapBase,
  }), [programMeta, maxMapBase, athleteOverrides, athlete.id]);
  const card = React.useMemo(
    () => buildCard(programForCard, athlete, liftLogs, { showVelocity, seasonStartDate }),
    [programForCard, athlete, liftLogs, showVelocity, seasonStartDate]
  );
  const n = card.days.length || 1;
  const wide = n <= 2;
  return (
    <div className="wr-page" data-testid="wr-card" style={{ width: W, height: H, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: C.white, color: C.text, fontFamily: BODY, overflow: 'hidden', breakAfter: 'page', pageBreakAfter: 'always', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderTop: `8px solid ${C.navy900}`, borderBottom: `3px solid ${C.gold500}` }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, padding: '8px 0' }}>
          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '0.14em', ...upper, color: C.gold700 }}>{[programMeta.week_label, programMeta.phase, `${n}-Day`].filter(Boolean).join(' · ')}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 32, lineHeight: 1.05, ...upper, color: C.navy900 }}>{displayName(card.athlete.name)}</span>
            <span style={{ fontSize: 13, color: C.muted }}>{[card.athlete.sport, card.athlete.position].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 1, padding: '8px 14px 8px 0' }}>
          <div style={{ fontWeight: 700, fontSize: 8, letterSpacing: '0.12em', ...upper, color: C.muted, paddingRight: 8 }}>Maxes</div>
          {MAX_KEYS.filter(([k]) => maxMapBase?.[k]).map(([k, l]) => (
            <div key={k} data-testid="wr-max" style={{ background: C.navy900, padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 44 }}>
              <span style={{ fontWeight: 700, fontSize: 7.5, letterSpacing: '0.08em', ...upper, color: C.gold300 }}>{l}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: 1.1, color: C.white }}>{card.maxes[k] ?? '—'}{card.maxes.entered?.[k] ? '*' : ''}</span>
            </div>
          ))}
        </div>
        <img src="/hp-logo.png" alt="Shiloh Christian Human Performance" style={{ height: 58, flexShrink: 0, alignSelf: 'center', marginRight: -8 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${n},minmax(0,1fr))`, gap: wide ? 16 : 8, marginTop: 10 }}>
        {card.days.map((d, i) => <Day key={d.id || i} d={d} wide={wide} showRecord={showRecord} />)}
      </div>
    </div>
  );
});

const label = { fontSize: 11, fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const field = { height: 40, padding: '0 10px', fontSize: 13, fontWeight: 700, borderRadius: 10 };
const opt = { background: 'var(--navy-900)', color: 'var(--color-text)' };
const toggleBtn = (on) => ({ ...field, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? 'var(--color-accent)' : 'rgba(255,255,255,0.2)'}`, background: on ? 'rgba(184,156,91,0.18)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-muted)' });

export default function WeightRoomCard({ program: programIn, athletes, liftLogs, settings = {}, onSaveProgram, onClose }) {
  const [program, setProgram] = React.useState(programIn);
  const [editMaxes, setEditMaxes] = React.useState(false);
  const seasonStartDate = settings.seasonStartDate;
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const [who, setWho] = React.useState(program.sport && sports.includes(program.sport) ? `sport:${program.sport}` : '');
  const [showVelocity, setShowVelocity] = React.useState(true);
  const [showRecord, setShowRecord] = React.useState(true);
  const [scale, setScale] = React.useState(1);
  const roster = React.useMemo(() => {
    if (who.startsWith('sport:')) return athletes.filter(a => (a.sport || 'General') === who.slice(6)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const a = athletes.find(x => x.id === who);
    return a ? [a] : [];
  }, [who, athletes]);

  // Separate base max_map (lift keys + window) from overrides so editing one athlete's
  // override only re-renders that athlete's Card instead of all 70+ cards on the team.
  const maxMapBase = React.useMemo(() => {
    const { overrides: _ov, ...rest } = program.max_map || {};
    return rest;
  }, [program.max_map]);
  const programMeta = React.useMemo(
    () => ({ id: program.id, name: program.name, week_label: program.week_label, phase: program.phase, sport: program.sport, days: program.days }),
    [program.id, program.name, program.week_label, program.phase, program.sport, program.days]
  );
  const fromLogsByAthlete = React.useMemo(() => {
    const m = new Map();
    for (const a of roster) m.set(a.id, maxesFor(a.id, liftLogs, maxMapBase, { seasonStartDate }));
    return m;
  }, [roster, liftLogs, maxMapBase, seasonStartDate]);

  const usedKeys = MAX_KEYS.filter(([k]) => maxMapBase?.[k]);
  // Overrides live on the program (max_map.overrides) so a reprint keeps them.
  const progRef = React.useRef(program);
  progRef.current = program;
  const ovDirtyRef = React.useRef(false);
  const setOverride = (athleteId, key, raw) => {
    const v = raw.replace(/[^0-9.]/g, '');
    ovDirtyRef.current = true;
    setProgram(p => {
      const all = { ...(p.max_map?.overrides || {}) };
      const mine = { ...(all[athleteId] || {}) };
      if (v) mine[key] = v; else delete mine[key];
      if (Object.keys(mine).length) all[athleteId] = mine; else delete all[athleteId];
      const next = { ...p, max_map: { ...p.max_map, overrides: all } };
      progRef.current = next;
      return next;
    });
  };
  const persist = () => {
    if (!ovDirtyRef.current) return;
    ovDirtyRef.current = false;
    onSaveProgram?.(progRef.current);
  };
  const handleClose = React.useCallback(() => {
    if (ovDirtyRef.current) {
      ovDirtyRef.current = false;
      onSaveProgram?.(progRef.current);
    }
    onClose();
  }, [onClose, onSaveProgram]);

  React.useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / W));
    fit(); window.addEventListener('resize', fit);
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('wr-printing');
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('keydown', onKey); document.body.classList.remove('wr-printing'); };
  }, [handleClose]);

  return createPortal(
    <div className="wr-print-root" role="dialog" aria-modal="true" aria-label="Weight room cards" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#0b1220', overflowY: 'auto' }}>
      <style>{`
        @media print {
          @page { size: letter landscape; margin: 0.4in; }
          html body.wr-printing > *:not(.wr-print-root), html body.wr-printing > #root { display: none !important; }
          .wr-print-root { position: static !important; background: #fff !important; overflow: visible !important; }
          .wr-controls { display: none !important; }
          .wr-sheets-wrap { height: auto !important; display: block !important; }
          .wr-sheets { transform: none !important; padding: 0 !important; gap: 0 !important; }
          .wr-page { overflow: hidden !important; }
          .wr-page:last-child { break-after: auto !important; page-break-after: auto !important; }
        }
      `}</style>
      <div className="wr-controls" style={{ position: 'sticky', top: 0, zIndex: 1, background: 'rgba(3,10,20,0.96)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 16px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="wr-who" style={label}>Print for</label>
          <select id="wr-who" data-testid="wr-who" className="input-glass" style={field} value={who} onChange={e => setWho(e.target.value)}>
            <option value="" style={opt}>Choose a team or athlete…</option>
            <optgroup label="Whole team (one page each)">{sports.map(s => <option key={s} value={`sport:${s}`} style={opt}>{s}</option>)}</optgroup>
            <optgroup label="One athlete">{[...athletes].sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(a => <option key={a.id} value={a.id} style={opt}>{a.name}</option>)}</optgroup>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>Show</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" data-testid="wr-toggle-vel" aria-pressed={showVelocity} onClick={() => setShowVelocity(!showVelocity)} style={toggleBtn(showVelocity)}>Velocity targets</button>
            <button type="button" data-testid="wr-toggle-rec" aria-pressed={showRecord} onClick={() => setShowRecord(!showRecord)} style={toggleBtn(showRecord)}>Record column</button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label htmlFor="wr-window" style={label}>Max window</label>
          <select id="wr-window" data-testid="wr-window" className="input-glass" style={field} value={program.max_map?.window || 'all'} onChange={e => { const next = { ...program, max_map: { ...program.max_map, window: e.target.value } }; setProgram(next); onSaveProgram?.(next); }}>
            {MAX_WINDOWS.map(([k, l]) => <option key={k} value={k} style={opt}>{l}</option>)}
          </select>
        </div>
        <button type="button" data-testid="wr-edit-maxes" aria-pressed={editMaxes} disabled={!roster.length} onClick={() => { if (editMaxes) persist(); setEditMaxes(!editMaxes); }} style={{ ...toggleBtn(editMaxes), alignSelf: 'flex-end' }}>{editMaxes ? 'Done editing maxes' : 'Edit maxes'}</button>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{roster.length} card{roster.length === 1 ? '' : 's'}</span>
          <button type="button" data-testid="wr-print" disabled={!roster.length} onClick={() => window.print()} style={{ ...field, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-accent)', color: '#030a14', border: 'none', cursor: 'pointer', textTransform: 'uppercase', opacity: roster.length ? 1 : 0.5 }}>
            <Printer size={16} aria-hidden="true" /> PDF / Print
          </button>
          <button type="button" onClick={handleClose} aria-label="Close weight room cards" style={{ ...field, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer' }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      {editMaxes && roster.length > 0 && (
        <div className="wr-controls" data-testid="wr-max-editor" style={{ margin: '16px auto 0', maxWidth: 900, padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 10 }}>Type a max to use it on the card instead of the Lift Tracker number (the athlete's logs aren't changed). Leave blank to use the Lift Tracker max shown in grey.</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13, width: '100%' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: '4px 8px', ...label }}>Athlete</th>{usedKeys.map(([k, l]) => <th key={k} style={{ padding: '4px 8px', ...label }}>{l}</th>)}</tr></thead>
              <tbody>{roster.map(a => {
                const fromLogs = fromLogsByAthlete.get(a.id) || {};
                const ov = program.max_map?.overrides?.[a.id] || {};
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <td style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{a.name}</td>
                    {usedKeys.map(([k, l]) => (
                      <td key={k} style={{ padding: '4px 8px' }}>
                        <input data-testid={`wr-ov-${k}`} aria-label={`${a.name} ${l} max`} className="input-glass" inputMode="decimal" value={ov[k] ?? ''} placeholder={fromLogs[k] ? String(fromLogs[k]) : '—'}
                          onChange={e => setOverride(a.id, k, e.target.value)} onBlur={persist} style={{ ...field, height: 34, width: 80, fontWeight: ov[k] ? 800 : 500 }} />
                      </td>
                    ))}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}
      {!roster.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Pick a team or an athlete to build their cards.</div>
      ) : (
        <div className="wr-sheets-wrap" style={{ height: (H * roster.length + 24 * (roster.length - 1)) * scale + 48, display: 'flex', justifyContent: 'center' }}>
          <div className="wr-sheets" style={{ width: W, padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 24, transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            {roster.map(a => (
              <Card
                key={a.id}
                programMeta={programMeta}
                maxMapBase={maxMapBase}
                athleteOverrides={program.max_map?.overrides?.[a.id]}
                athlete={a}
                liftLogs={liftLogs}
                showVelocity={showVelocity}
                seasonStartDate={seasonStartDate}
                showRecord={showRecord}
              />
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
