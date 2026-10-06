import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { getCentralDateString, centralWallTimeToISO, isRpeLog } from '../../utils/athleteData';

// Session RPE "Team log": one date + session for a whole group, one RPE (and minutes)
// per athlete, one save. For days the kiosk iPads were down and the RPEs were collected
// on paper. Same layout as the Lift Tracker Team Log.
const label = 'block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-2';
const field = 'w-full h-12 px-4 rounded-xl bg-surface-container-highest text-on-surface font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary border border-transparent';
const cell = 'h-10 px-2 rounded-lg bg-surface-container-highest text-on-surface text-center focus:outline-none focus:ring-2 focus:ring-primary border border-transparent';
const digits = (v) => v.replace(/[^0-9]/g, '');

export default function RpeTeamEntryPanel({ athletes, reportData, settings, addRpeSessions, onClose }) {
  const today = getCentralDateString();
  const yesterday = getCentralDateString(new Date(Date.now() - 86400000));
  const labels = settings.rpeSessionLabels?.length ? settings.rpeSessionLabels : ['Practice'];
  const track = settings.rpeTrackDuration !== false;
  const maxRpe = settings.rpeScaleMax || 10;
  const maxMin = settings.rpeMaxMinutes || 240;
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);

  const [date, setDate] = React.useState(yesterday);
  const [time, setTime] = React.useState('15:30');
  const [session, setSession] = React.useState(labels[0]);
  const [sport, setSport] = React.useState(sports[0] || 'ALL');
  const [defaultMin, setDefaultMin] = React.useState('90');
  const [values, setValues] = React.useState({}); // { [athleteId]: { rpe, min } }
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const roster = React.useMemo(() => athletes
    .filter(a => sport === 'ALL' || (a.sport || 'General') === sport)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })), [athletes, sport]);

  // Athletes who already have this session logged on this date (from the kiosk) - shown
  // so the coach doesn't type a duplicate.
  const already = React.useMemo(() => {
    const m = new Map();
    for (const r of reportData || []) {
      if (!isRpeLog(r) || (r.session_label || '') !== session) continue;
      if (getCentralDateString(new Date(r.created_at)) !== date) continue;
      m.set(r.athlete_id, r);
    }
    return m;
  }, [reportData, session, date]);

  const minFor = (id) => (values[id]?.min ?? '') !== '' ? values[id].min : defaultMin;
  const rowState = (a) => {
    const raw = values[a.id]?.rpe ?? '';
    if (raw === '') return { empty: true };
    const rpe = Number(raw);
    const min = track ? Number(minFor(a.id)) : null;
    if (!(rpe >= 1) || rpe > maxRpe || (track && (!(min > 0) || min > maxMin))) return { invalid: true };
    return { rpe, min };
  };
  const states = roster.map(a => [a, rowState(a)]);
  const ready = states.filter(([, s]) => s.rpe);
  const invalidCount = states.filter(([, s]) => s.invalid).length;
  const canSave = !saving && ready.length > 0 && invalidCount === 0 && date && date <= today && session;
  const set = (id, key, v) => setValues(prev => ({ ...prev, [id]: { ...prev[id], [key]: v } }));

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setMessage('');
    const created_at = centralWallTimeToISO(date, time || '12:00');
    const res = await addRpeSessions(ready.map(([a, s]) => ({
      athlete_id: a.id, athlete_name: a.name, sport: a.sport || '',
      rpe: s.rpe, session_minutes: track ? s.min : null, session_label: session, created_at,
    })));
    setSaving(false);
    const n = ready.length;
    setMessage(!res.ok
      ? `The server refused these sessions, so they weren't saved. Check the numbers and try again.`
      : res.queued
        ? `No connection. ${n} session${n === 1 ? ' is' : 's are'} saved on this device and will upload automatically.`
        : `Saved ${n} ${session} session${n === 1 ? '' : 's'} for ${date}.`);
    if (res.ok) setValues(prev => { const next = { ...prev }; ready.forEach(([a]) => delete next[a.id]); return next; });
  };

  return createPortal(
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="rpe-team-title" onClick={e => e.stopPropagation()}
        className="card-glass animate-slide-up bg-surface-container-low shadow-lg"
        style={{ width: '100%', maxWidth: '640px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', borderRadius: '16px', border: '1px solid rgba(167, 139, 250, 0.45)', padding: '24px', gap: '16px' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="rpe-team-title" className="font-headline-md text-headline-md text-on-surface uppercase">RPE Team Log</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">One session and date, one RPE per athlete. Leave anyone blank to skip them.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close RPE team log" className="w-10 h-10 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high">
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
          <div>
            <label htmlFor="rt-date" className={label}>Date</label>
            <input id="rt-date" type="date" className={field} value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rt-time" className={label}>Time</label>
            <input id="rt-time" type="time" className={field} value={time} onChange={e => setTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor="rt-session" className={label}>Session</label>
            <select id="rt-session" className={field} value={session} onChange={e => setSession(e.target.value)}>
              {labels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rt-sport" className={label}>Team</label>
            <select id="rt-sport" className={field} value={sport} onChange={e => setSport(e.target.value)}>
              <option value="ALL">All sports</option>
              {sports.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {track && (
            <div>
              <label htmlFor="rt-min" className={label}>Default min</label>
              <input id="rt-min" type="text" inputMode="numeric" className={field} value={defaultMin} onChange={e => setDefaultMin(digits(e.target.value))} />
            </div>
          )}
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px' }}>
          {roster.length === 0 ? (
            <div className="p-4 font-body-sm text-body-sm text-on-surface-variant">No athletes on this team.</div>
          ) : states.map(([a, s]) => {
            const prior = already.get(a.id);
            return (
              <div key={a.id} data-testid="team-rpe-row" className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: s.invalid ? 'rgba(239,68,68,0.08)' : undefined }}>
                <div className="flex-1 min-w-0">
                  <div className="font-label-md text-label-md text-on-surface truncate">{a.name}</div>
                  <div className="font-label-sm text-label-sm text-on-surface-variant">
                    {prior ? <span style={{ color: '#f59e0b', fontWeight: 700 }}>Already logged: RPE {prior.rpe}{prior.session_minutes ? ` · ${prior.session_minutes} min` : ''}</span> : (a.sport || 'No sport')}
                    {s.invalid && <span style={{ marginLeft: '8px', color: '#ef4444', fontWeight: 700 }}>RPE 1–{maxRpe}{track ? `, 1–${maxMin} min` : ''}</span>}
                  </div>
                </div>
                <input type="text" inputMode="numeric" className={cell} style={{ width: '64px' }}
                  aria-label={`${a.name} RPE`} placeholder="RPE"
                  value={values[a.id]?.rpe ?? ''} onChange={e => set(a.id, 'rpe', digits(e.target.value).slice(0, 2))} />
                {track && (
                  <input type="text" inputMode="numeric" className={cell} style={{ width: '64px' }}
                    aria-label={`${a.name} minutes`} placeholder={defaultMin || 'min'}
                    value={values[a.id]?.min ?? ''} onChange={e => set(a.id, 'min', digits(e.target.value).slice(0, 3))} />
                )}
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
            <button type="button" data-testid="rpe-team-save" onClick={handleSave} disabled={!canSave} className="h-12 px-5 rounded-xl bg-primary text-on-primary font-label-md text-label-md uppercase font-bold disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : `Save ${ready.length || ''} session${ready.length === 1 ? '' : 's'}`.replace('  ', ' ')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
