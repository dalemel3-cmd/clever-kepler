import React from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, AlertTriangle } from 'lucide-react';
import { cardCounts, cardGroups, weekCardPrograms, weekNo } from './programWeekCard';

// Upload preview for a workbook of weekly cards (v5.12.0, docs/HANDOFF.md §139): every
// tab is one week. Tabs are grouped by team (the name before the date, "SH_9.14.26"),
// each group gets a program name and team, each week a phase; past weeks can go in
// archived (still counted in Periodization, never shown on the rack tablets).
const btn = (primary) => ({ height: '44px', padding: '0 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', border: primary ? 'none' : '1px solid rgba(255,255,255,0.18)', background: primary ? 'var(--color-accent)' : 'transparent', color: primary ? '#030a14' : 'var(--color-text)' });
const fld = { height: '44px', padding: '0 10px', fontSize: '14px', borderRadius: '10px', minWidth: 0 };
const lbl = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' };
const optS = { background: 'var(--navy-900)', color: 'var(--color-text)' };
const td = { padding: '6px 8px', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' };
const weekOf = (ymd) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' }) : '?');

export default function WeekCardImportPanel({ fileName, cards, teams = [], liftTypes = [], existing = [], onImport, onClose }) {
  const groups = React.useMemo(() => cardGroups(cards), [cards]);
  // A name that matches an existing program (any case) keeps that program's spelling.
  const [opts, setOpts] = React.useState(() => Object.fromEntries(groups.map(g => {
    const same = existing.find(p => (p.name || '').toLowerCase() === g.name.toLowerCase());
    return [g.prefix, { name: same ? same.name : g.name, team: g.team }];
  })));
  const [phases, setPhases] = React.useState({});
  const [unpicked, setUnpicked] = React.useState(() => new Set());
  const thisMonday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA'); })();
  const [archive, setArchive] = React.useState(() => cards.every(c => c.weekStart && c.weekStart < thisMonday));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const picked = new Set(cards.map(c => c.tab).filter(t => !unpicked.has(t)));
  const programs = React.useMemo(() => weekCardPrograms(groups, { opts, phases, picked, archived: archive, liftTypes }), [groups, opts, phases, unpicked, archive, liftTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  const warnings = cards.flatMap(c => c.warnings.map(w => ({ ...w, tab: c.tab })));
  const setOpt = (prefix, patch) => setOpts(o => ({ ...o, [prefix]: { ...o[prefix], ...patch } }));
  const toggle = (tab) => setUnpicked(prev => { const n = new Set(prev); if (n.has(tab)) n.delete(tab); else n.add(tab); return n; });
  const go = async () => {
    if (!programs.length || busy) return;
    setBusy(true); setError('');
    const res = await onImport(programs);
    setBusy(false);
    if (!res?.ok) setError("Couldn't save the programs - check the connection and try again.");
  };
  React.useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Upload programs" data-testid="pb-import" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(3,10,20,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div className="card-glass" style={{ width: '100%', maxWidth: '860px', padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--navy-900, #0b1220)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, textTransform: 'uppercase' }}>Upload programs</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{fileName} · {cards.length} weekly tab{cards.length === 1 ? '' : 's'} - each tab becomes a program (one week)</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close upload" style={{ ...btn(false), width: '44px', padding: 0, justifyContent: 'center' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Sets, reps, % and tempo are read from each card. The weights on a card were worked out for the athlete named on it, so they aren't copied - written notes like "30 MIN" or "Add Wt" are kept.</div>

        {groups.map((g, gi) => (
          <div key={g.prefix} data-testid="pb-wc-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 220px' }}><span style={lbl}>Program name</span>
                <input data-testid={`pb-wc-name-${gi}`} className="input-glass" style={fld} value={opts[g.prefix]?.name ?? ''} onChange={e => setOpt(g.prefix, { name: e.target.value })} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><span style={lbl}>Team</span>
                <select data-testid={`pb-wc-team-${gi}`} className="input-glass" style={fld} value={opts[g.prefix]?.team ?? ''} onChange={e => setOpt(g.prefix, { team: e.target.value })}>
                  <option value="" style={optS}>No team</option>
                  {[...new Set([...teams, ...(opts[g.prefix]?.team ? [opts[g.prefix].team] : [])])].map(t => <option key={t} value={t} style={optS}>{t}</option>)}
                </select>
              </label>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', paddingBottom: '12px' }}>Tabs "{g.prefix}…"</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-text)' }}>
                <thead><tr>
                  <th style={{ ...lbl, textAlign: 'left', padding: '4px 8px' }}><span className="sr-only">Import</span></th>
                  <th style={{ ...lbl, textAlign: 'left', padding: '4px 8px' }}>Week</th>
                  <th style={{ ...lbl, textAlign: 'left', padding: '4px 8px' }}>Phase</th>
                  <th style={{ ...lbl, textAlign: 'left', padding: '4px 8px' }}>What's on it</th>
                  <th style={{ ...lbl, textAlign: 'left', padding: '4px 8px' }}>Tab</th>
                </tr></thead>
                <tbody>{g.cards.map(c => {
                  const k = cardCounts(c);
                  const n = weekNo(g.cards[0].weekStart, c.weekStart);
                  return (
                    <tr key={c.tab} data-testid="pb-wc-week" style={{ opacity: picked.has(c.tab) ? 1 : 0.5 }}>
                      <td style={td}><input type="checkbox" checked={picked.has(c.tab)} onChange={() => toggle(c.tab)} aria-label={`Import ${c.tab}`} style={{ width: '20px', height: '20px' }} /></td>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 700 }}>Week {n} · {weekOf(c.weekStart)}</td>
                      <td style={td}><input data-testid="pb-wc-phase" className="input-glass" style={{ ...fld, height: '40px', width: '150px' }} value={phases[c.tab] || ''} placeholder="optional" aria-label={`Phase for week ${n}`} onChange={e => setPhases(p => ({ ...p, [c.tab]: e.target.value }))} /></td>
                      <td style={{ ...td, fontSize: '12px', color: 'var(--color-text-muted)' }}>{k.days} day{k.days === 1 ? '' : 's'} ({c.days.map(d => (d.date ? new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : '?')).join(' ')}) · {k.ex} exercises · {k.sets} sets</td>
                      <td style={{ ...td, fontSize: '12px', color: 'var(--color-text-muted)' }}>{c.tab}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </div>
        ))}

        <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer', fontSize: '13px' }}>
          <input type="checkbox" data-testid="pb-wc-archive" checked={archive} onChange={e => setArchive(e.target.checked)} style={{ width: '20px', height: '20px', marginTop: '1px' }} />
          <span>Archive them - for past weeks. They still count in Periodization, but stay out of the Programs list and off the rack tablets.</span>
        </label>

        {warnings.length > 0 && (
          <div data-testid="pb-import-warnings" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(184,156,91,0.1)', border: '1px solid rgba(184,156,91,0.35)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-accent)' }}><AlertTriangle size={14} /> {warnings.length} thing{warnings.length === 1 ? '' : 's'} to check</span>
            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {warnings.slice(0, 100).map((w, i) => <span key={i} style={{ fontSize: '12px' }}>{w.tab}: {w.message}</span>)}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: '13px', color: '#f87171' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" data-testid="pb-import-go" style={{ ...btn(true), opacity: programs.length && !busy ? 1 : 0.5 }} disabled={!programs.length || busy} onClick={go}>
            <Upload size={16} /> {busy ? 'Saving…' : `Import ${programs.length} program${programs.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
