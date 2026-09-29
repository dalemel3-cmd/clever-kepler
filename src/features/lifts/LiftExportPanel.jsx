import React from 'react';
import { createPortal } from 'react-dom';
import { X, Download } from 'lucide-react';
import { estimate1RM, TIMEFRAMES, timeframeBounds, inBounds, describeBounds } from './liftRanking';

// Lift Tracker CSV export with a choice of who, which lift and what time frame.
// Styled to match the Bulk Edit panel on the same screen.
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const downloadCSV = (filename, headers, rows) => {
  const csv = [headers.map(csvCell).join(','), ...rows.map(r => r.map(csvCell).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const lastNameOf = (name) => (name || '').trim().split(/\s+/).pop().toLowerCase();
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

const label = 'block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2';
const field = 'w-full h-12 px-4 rounded-xl bg-surface-container-highest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary border border-transparent';
const chip = (on) => `px-4 py-2 rounded-xl font-label-md text-label-md transition-colors ${on ? 'bg-primary-container text-on-primary-container font-bold border-2 border-primary' : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface border-2 border-transparent'}`;

export default function LiftExportPanel({ liftLogs, athletes, sports, liftTypes, seasonStartDate, onClose }) {
  const [who, setWho] = React.useState('all');          // 'all' | 'sport' | 'athlete'
  const [sport, setSport] = React.useState(sports[0] || '');
  const [athleteId, setAthleteId] = React.useState('');
  const [lift, setLift] = React.useState('ALL');
  const [frame, setFrame] = React.useState('all');
  const [from, setFrom] = React.useState(seasonStartDate || '');
  const [to, setTo] = React.useState('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sortedAthletes = React.useMemo(() => [...athletes].sort((a, b) => a.name.localeCompare(b.name)), [athletes]);
  const bounds = timeframeBounds(frame, { seasonStartDate, from, to });
  const athleteById = React.useMemo(() => new Map(athletes.map(a => [a.id, a])), [athletes]);

  const matches = React.useMemo(() => (liftLogs || []).filter(l => {
    if (lift !== 'ALL' && l.lift_type !== lift) return false;
    if (who === 'athlete' && l.athlete_id !== athleteId) return false;
    if (who === 'sport') {
      const s = athleteById.get(l.athlete_id)?.sport || l.sport || 'General';
      if (s !== sport) return false;
    }
    return inBounds(l, bounds);
  }), [liftLogs, lift, who, athleteId, sport, athleteById, bounds.start, bounds.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalid = (who === 'athlete' && !athleteId) || (frame === 'custom' && from && to && from > to);

  const handleExport = () => {
    const sorted = [...matches].sort((a, b) =>
      lastNameOf(a.athlete_name).localeCompare(lastNameOf(b.athlete_name))
      || (a.athlete_name || '').localeCompare(b.athlete_name || '')
      || new Date(b.created_at) - new Date(a.created_at));
    const rows = sorted.map(l => [
      new Date(l.created_at).toLocaleDateString(),
      l.athlete_name || '',
      athleteById.get(l.athlete_id)?.sport || l.sport || '',
      l.lift_type, l.weight_lbs, l.reps,
      Math.round(estimate1RM(Number(l.weight_lbs), Number(l.reps))),
    ]);
    const whoPart = who === 'athlete' ? slug(athleteById.get(athleteId)?.name || 'Athlete') : who === 'sport' ? slug(sport) : 'All';
    const liftPart = lift === 'ALL' ? 'AllLifts' : slug(lift);
    const framePart = frame === 'all' ? `AllTime_${new Date().toISOString().slice(0, 10)}` : `${bounds.start || 'start'}_to_${bounds.end || 'today'}`;
    downloadCSV(`Shiloh_Lifts_${whoPart}_${liftPart}_${framePart}.csv`,
      ['Date', 'Athlete', 'Sport', 'Lift', 'Weight (lbs)', 'Reps', 'Est. 1RM'], rows);
    onClose();
  };

  return createPortal(
    <div
      className="modal-overlay animate-fade-in"
      style={{ position: 'fixed', inset: 0, zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.9)', overflowY: 'auto' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="lift-export-title" className="card-glass glow-card animate-slide-up bg-surface-container-low shadow-lg" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px', border: '1px solid rgba(255, 193, 116, 0.4)', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 id="lift-export-title" className="font-display text-2xl font-bold text-on-surface uppercase m-0">Export Lifts (CSV)</h3>
            <div className="font-label-sm text-label-sm text-on-surface-variant mt-1">Choose who, which lift and what dates to include.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="bg-transparent border-none text-on-surface-variant hover:text-on-surface cursor-pointer"><X size={22} /></button>
        </div>

        <div>
          <span className={label}>Who</span>
          <div className="flex gap-2 flex-wrap">
            {[['all', 'Everyone'], ['sport', 'One team'], ['athlete', 'One athlete']].map(([id, text]) => (
              <button key={id} type="button" aria-pressed={who === id} onClick={() => setWho(id)} className={chip(who === id)}>{text}</button>
            ))}
          </div>
          {who === 'sport' && (
            <select aria-label="Team" value={sport} onChange={e => setSport(e.target.value)} className={`${field} mt-3`}>
              {sports.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {who === 'athlete' && (
            <select aria-label="Athlete" value={athleteId} onChange={e => setAthleteId(e.target.value)} className={`${field} mt-3`}>
              <option value="">Select an athlete…</option>
              {sortedAthletes.map(a => <option key={a.id} value={a.id}>{a.name}{a.sport ? ` · ${a.sport}` : ''}</option>)}
            </select>
          )}
        </div>

        <div>
          <label className={label} htmlFor="lift-export-lift">Lift</label>
          <select id="lift-export-lift" value={lift} onChange={e => setLift(e.target.value)} className={field}>
            <option value="ALL">All lifts</option>
            {liftTypes.map(lt => <option key={lt} value={lt}>{lt}</option>)}
          </select>
        </div>

        <div>
          <span className={label}>Time frame</span>
          <div className="flex gap-2 flex-wrap">
            {TIMEFRAMES.map(t => (
              <button key={t.id} type="button" aria-pressed={frame === t.id} onClick={() => setFrame(t.id)} className={chip(frame === t.id)}>{t.label}</button>
            ))}
          </div>
          {frame === 'custom' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className={label} htmlFor="lift-export-from">From</label><input id="lift-export-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className={field} /></div>
              <div><label className={label} htmlFor="lift-export-to">To</label><input id="lift-export-to" type="date" value={to} onChange={e => setTo(e.target.value)} className={field} /></div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 rounded-xl bg-surface-container-highest text-on-surface-variant font-label-md text-label-md" aria-live="polite">
          {frame === 'custom' && from && to && from > to
            ? 'The start date is after the end date.'
            : who === 'athlete' && !athleteId
              ? 'Pick an athlete to see how many sets will export.'
              : `${matches.length} set${matches.length === 1 ? '' : 's'} · ${describeBounds(frame, bounds)}`}
        </div>

        <button
          type="button"
          onClick={handleExport}
          disabled={invalid || matches.length === 0}
          className={`h-12 rounded-xl font-headline-md text-headline-md uppercase flex items-center justify-center gap-2 transition-all ${invalid || matches.length === 0 ? 'bg-primary-container/50 text-on-primary-container/50 cursor-not-allowed' : 'bg-primary hover:bg-primary-fixed text-on-primary shadow-lg hover:shadow-xl hover:-translate-y-0.5'}`}
        >
          <Download size={18} /> Download CSV
        </button>
      </div>
    </div>,
    document.body
  );
}
