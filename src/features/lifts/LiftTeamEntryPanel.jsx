import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getCentralDateString, centralWallTimeToISO, parseWeightInput } from '../../utils/athleteData';
import { estimate1RM } from './liftRanking';

// Lift Tracker "Team log": one lift + one date for a whole group, one weight × reps row
// per athlete, one save. Same idea as Speed & Power's Team Entry - a testing day is
// "the whole team maxed bench today", not 30 trips through the single-athlete form.
// Styled to match the Export and Bulk Edit panels on the same screen.
const label = 'block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2';
const field = 'w-full h-12 px-4 rounded-xl bg-surface-container-highest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary border border-transparent';
const cell = 'h-10 px-2 rounded-lg bg-surface-container-highest text-on-surface text-center focus:outline-none focus:ring-2 focus:ring-primary border border-transparent';
const lastNameOf = (name) => (name || '').trim().split(/\s+/).pop().toLowerCase();

export default function LiftTeamEntryPanel({ athletes, liftLogs, sports, liftTypes, addLifts, onClose }) {
  const today = getCentralDateString();
  const [lift, setLift] = React.useState(liftTypes[0] || '');
  const [date, setDate] = React.useState(today);
  const [sport, setSport] = React.useState(sports[0] || 'ALL');
  const [defaultReps, setDefaultReps] = React.useState('1');
  const [values, setValues] = React.useState({}); // { [athleteId]: { w, r } }
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roster = React.useMemo(() => athletes
    .filter(a => sport === 'ALL' || (a.sport || 'General') === sport)
    .sort((a, b) => lastNameOf(a.name).localeCompare(lastNameOf(b.name)) || a.name.localeCompare(b.name)), [athletes, sport]);

  // Current best est. 1RM per athlete for this lift, shown as a reference and used to
  // mark a row that would set a new PR.
  const prBy = React.useMemo(() => {
    const m = new Map();
    for (const l of (liftLogs || [])) {
      if (l.lift_type !== lift) continue;
      const v = estimate1RM(Number(l.weight_lbs), Number(l.reps));
      if (!m.has(l.athlete_id) || v > m.get(l.athlete_id)) m.set(l.athlete_id, v);
    }
    return m;
  }, [liftLogs, lift]);

  const repsFor = (id) => (values[id]?.r ?? '') !== '' ? values[id].r : defaultReps;
  const rowState = (a) => {
    const raw = values[a.id]?.w ?? '';
    if (raw === '') return { empty: true };
    const w = parseWeightInput(raw);
    const r = parseInt(repsFor(a.id), 10);
    if (!(w > 0) || w > 1500 || !(r >= 1) || r > 50) return { invalid: true };
    const est = estimate1RM(w, r);
    const pr = prBy.get(a.id);
    return { w, r, est, isPr: pr == null || est > pr };
  };
  const states = roster.map(a => [a, rowState(a)]);
  const ready = states.filter(([, s]) => s.w);
  const invalidCount = states.filter(([, s]) => s.invalid).length;
  const canSave = !saving && ready.length > 0 && invalidCount === 0 && lift && date && date <= today;

  const set = (id, key, v) => setValues(prev => ({ ...prev, [id]: { ...prev[id], [key]: v } }));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setMessage('');
    // Today keeps the real time (so sets stay in logging order); a past date lands at
    // noon Central, same as Speed & Power's Team Entry.
    const created_at = date === today ? new Date().toISOString() : centralWallTimeToISO(date, '12:00');
    // One request for the whole sheet (see addLifts).
    const res = await addLifts(ready.map(([a, s]) => ({
      athlete_id: a.id, athlete_name: a.name, sport: a.sport || '',
      lift_type: lift, weight_lbs: s.w, reps: s.r, created_at,
    })));
    setSaving(false);
    setMessage(!res.ok
      ? `The server refused these sets, so they weren't saved. Check the numbers and try again.`
      : res.queued
        ? `No connection. ${ready.length} ${lift} set${ready.length === 1 ? ' is' : 's are'} saved on this device and will upload automatically.`
        : `Saved ${ready.length} ${lift} set${ready.length === 1 ? '' : 's'} for ${date}.`);
    setValues(prev => {
      const next = { ...prev };
      ready.forEach(([a]) => delete next[a.id]);
      return next;
    });
  };

  return createPortal(
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lift-team-title"
        onClick={e => e.stopPropagation()}
        className="card-glass animate-slide-up bg-surface-container-low shadow-lg"
        style={{ width: '100%', maxWidth: '620px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', border: '1px solid rgba(255, 193, 116, 0.4)', padding: '24px', gap: '16px' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="lift-team-title" className="font-headline-md text-headline-md text-on-surface uppercase">Team Log</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">One lift and date, one set per athlete. Leave anyone blank to skip them.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close team log" className="w-10 h-10 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
          <div>
            <label htmlFor="lt-lift" className={label}>Lift</label>
            <select id="lt-lift" className={field} value={lift} onChange={e => setLift(e.target.value)}>
              {liftTypes.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lt-date" className={label}>Date</label>
            <input id="lt-date" type="date" className={field} value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="lt-sport" className={label}>Team</label>
            <select id="lt-sport" className={field} value={sport} onChange={e => setSport(e.target.value)}>
              <option value="ALL">All sports</option>
              {sports.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="lt-reps" className={label}>Default reps</label>
            <input id="lt-reps" type="text" inputMode="numeric" className={field} value={defaultReps} onChange={e => setDefaultReps(e.target.value.replace(/[^0-9]/g, ''))} />
          </div>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
          {roster.length === 0 ? (
            <div className="p-4 font-body-sm text-body-sm text-on-surface-variant">No athletes on this team.</div>
          ) : states.map(([a, s]) => {
            const pr = prBy.get(a.id);
            return (
              <div key={a.id} data-testid="team-lift-row" className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: s.invalid ? 'rgba(239,68,68,0.08)' : undefined }}>
                <div className="flex-1 min-w-0">
                  <div className="font-label-md text-label-md text-on-surface truncate">{a.name}</div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant">
                    {pr ? `Best est. ${Math.round(pr)}` : 'No ' + lift + ' yet'}
                    {s.est && <span style={{ marginLeft: '8px', color: s.isPr ? '#10b981' : undefined, fontWeight: s.isPr ? 700 : undefined }}>→ est. {Math.round(s.est)}{s.isPr ? ' · PR' : ''}</span>}
                    {s.invalid && <span style={{ marginLeft: '8px', color: '#ef4444', fontWeight: 700 }}>Check weight / reps</span>}
                  </div>
                </div>
                <input
                  type="text" inputMode="decimal" className={cell} style={{ width: '84px' }}
                  aria-label={`${a.name} weight (lbs)`} placeholder="lbs"
                  value={values[a.id]?.w ?? ''}
                  onChange={e => set(a.id, 'w', e.target.value.replace(/[^0-9.]/g, ''))}
                />
                <span aria-hidden="true" className="text-on-surface-variant">×</span>
                <input
                  type="text" inputMode="numeric" className={cell} style={{ width: '56px' }}
                  aria-label={`${a.name} reps`} placeholder={defaultReps || 'reps'}
                  value={values[a.id]?.r ?? ''}
                  onChange={e => set(a.id, 'r', e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="font-body-sm text-body-sm" role="status" style={{ color: message ? '#10b981' : 'var(--color-text-muted)' }}>
            {message || (invalidCount ? `${invalidCount} row${invalidCount === 1 ? '' : 's'} need fixing.` : `${ready.length} ready to save.`)}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl bg-surface-container-highest text-on-surface font-label-md text-label-md uppercase">Done</button>
            <button type="button" onClick={handleSave} disabled={!canSave} className="h-12 px-5 rounded-xl bg-primary text-on-primary font-label-md text-label-md uppercase font-bold disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : `Save ${ready.length || ''} set${ready.length === 1 ? '' : 's'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
