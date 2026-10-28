import React from 'react';
import { Check, Minus, Plus, Undo2, Timer, ChevronDown, ChevronUp } from 'lucide-react';
import { estimate1RM } from './liftRanking';
import { buildWorkoutDay, doneItems, elapsedMinutes, readSession, startSession, totalItems, writeSession } from '../programs/workoutSession';

// Today's workout on the rack tablet (v5.10.0, docs/HANDOFF.md §134). Shows the athlete's
// program day with their own working weights; each set logs to Lift Tracker with one tap
// (adjust weight/reps first if needed); Finish asks for session RPE with the duration
// timed from when they opened the workout. Lives in Lift Kiosk Mode's pinned card.
const RPE_WORDS = { 1: 'Very easy', 2: 'Easy', 3: 'Moderate', 4: 'Somewhat hard', 5: 'Hard', 6: 'Hard', 7: 'Very hard', 8: 'Very hard', 9: 'Near max', 10: 'Max effort' };
const chip = 'px-2 py-0.5 rounded font-label-sm text-label-sm uppercase tracking-wider';
const stepBtn = 'w-11 h-11 shrink-0 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-on-surface-variant flex items-center justify-center';
const num = (v) => (v === '' || v == null ? '' : String(v));

function Stepper({ value, onChange, step, label, unit, testid }) {
  const n = parseFloat(value);
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={stepBtn} aria-label={`Less ${label}`} onClick={() => onChange(String(Math.max(0, (Number.isFinite(n) ? n : 0) - step)))}><Minus size={16} /></button>
      <input data-testid={testid} type="text" inputMode="decimal" aria-label={label} value={value} onChange={e => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        className="w-16 h-11 rounded-lg bg-surface-container-highest text-on-surface font-display text-xl font-bold text-center border border-transparent focus:border-primary focus:outline-none" />
      <button type="button" className={stepBtn} aria-label={`More ${label}`} onClick={() => onChange(String((Number.isFinite(n) ? n : 0) + step))}><Plus size={16} /></button>
      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase w-8">{unit}</span>
    </div>
  );
}

export default function WorkoutPanel({ athlete, workouts, liftLogs, settings, addLift, deleteLift, addRpeSessions, today, onFreeLog, onChange }) {
  // An athlete normally has one workout today; if a team has two programs dated today, tabs.
  const [pick, setPick] = React.useState(() => {
    const s = readSession(athlete.id, today);
    const i = s ? workouts.findIndex(w => w.program.id === s.programId && (w.day.id || null) === s.dayId) : -1;
    return i >= 0 ? i : 0;
  });
  const cur = workouts[Math.min(pick, workouts.length - 1)];
  const [session, setSession] = React.useState(() => readSession(athlete.id, today));
  const [vals, setVals] = React.useState({});
  const [busy, setBusy] = React.useState({});
  const [msg, setMsg] = React.useState('');
  const [step, setStep] = React.useState('workout'); // 'workout' | 'rpe'
  const [rpe, setRpe] = React.useState(null);
  const [minutes, setMinutes] = React.useState(null);
  const [savingRpe, setSavingRpe] = React.useState(false);
  const [showWarm, setShowWarm] = React.useState(true);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  // The timer starts the first time the athlete opens today's workout on this tablet.
  React.useEffect(() => {
    if (!cur) return;
    const s = readSession(athlete.id, today);
    if (s && s.programId === cur.program.id && s.dayId === (cur.day.id || null)) { setSession(s); return; }
    const fresh = { ...startSession({ athlete, program: cur.program, day: cur.day, liftLogs, seasonStartDate: settings.seasonStartDate }), ...(s ? { startedAt: s.startedAt } : {}) };
    writeSession(athlete.id, today, fresh);
    setSession(fresh);
  }, [athlete.id, today, cur?.program.id, cur?.day.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opened before Lift Tracker history had loaded (first start of the day): fill the maxes
  // in once it arrives, as long as nothing has been logged against the empty ones.
  React.useEffect(() => {
    if (!cur || !session || !(liftLogs || []).length) return;
    const empty = Object.entries(session.maxes || {}).every(([k, v]) => k === 'entered' || v == null);
    if (!empty || Object.keys(session.sets || {}).length) return;
    const again = startSession({ athlete, program: cur.program, day: cur.day, liftLogs, seasonStartDate: settings.seasonStartDate });
    if (Object.entries(again.maxes).some(([k, v]) => k !== 'entered' && v != null)) {
      const next = { ...session, maxes: again.maxes };
      writeSession(athlete.id, today, next);
      setSession(next);
    }
  }, [liftLogs, session?.maxes]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocks = React.useMemo(() => (cur && session ? buildWorkoutDay(cur.program, cur.day, session.maxes || {}) : []), [cur, session?.maxes]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur || !session) return null;
  const total = totalItems(blocks);
  const done = doneItems(blocks, session);
  const finished = !!session.finishedAt;
  const mins = finished ? session.minutes : elapsedMinutes(session.startedAt, now);

  const update = (fn) => setSession(prev => {
    const next = fn(JSON.parse(JSON.stringify(prev)));
    next.progress = { done: doneItems(blocks, next), total };
    writeSession(athlete.id, today, next);
    if (onChange) setTimeout(onChange, 0);
    return next;
  });
  const valFor = (b, s) => vals[`${b.id}_${s.k}`] || { w: num(s.wt), r: num(s.repsNum) };
  const setVal = (b, s, patch) => setVals(v => ({ ...v, [`${b.id}_${s.k}`]: { ...valFor(b, s), ...patch } }));

  const logSet = async (b, s) => {
    const key = `${b.id}_${s.k}`;
    const { w, r } = valFor(b, s);
    const wn = parseFloat(w), rn = parseInt(r, 10);
    if (!(wn > 0) || !(rn > 0) || busy[key]) return;
    setBusy(x => ({ ...x, [key]: true }));
    // PR check against everything logged before this set (same rule as Lift Tracker).
    let prevBest = 0;
    for (const l of liftLogs || []) if (l.athlete_id === athlete.id && l.lift_type === b.lift) prevBest = Math.max(prevBest, estimate1RM(Number(l.weight_lbs), Number(l.reps)));
    const res = await addLift({ athlete_id: athlete.id, athlete_name: athlete.name, sport: athlete.sport || '', lift_type: b.lift, weight_lbs: wn, reps: rn, source: 'kiosk', notes: `Workout: ${cur.program.name} · ${b.code} set ${s.k + 1}` });
    setBusy(x => ({ ...x, [key]: false }));
    if (!res?.ok) { setMsg("That set wasn't saved. Check the numbers and try again."); return; }
    update(n => { n.sets[b.id] = { ...(n.sets[b.id] || {}), [s.k]: { w: wn, r: rn, liftId: res.ids?.[0] || null } }; return n; });
    const est = Math.round(estimate1RM(wn, rn));
    setMsg(prevBest && est > Math.round(prevBest) ? `New PR! ${b.lift} est. 1RM ${est} (was ${Math.round(prevBest)}).` : res.queued ? 'Saved on this tablet. It uploads when the signal is back.' : '');
  };
  const undoSet = async (b, s) => {
    const key = `${b.id}_${s.k}`;
    const logged = session.sets?.[b.id]?.[s.k];
    if (!logged || busy[key]) return;
    setBusy(x => ({ ...x, [key]: true }));
    const res = logged.liftId ? await deleteLift(logged.liftId) : { ok: true };
    setBusy(x => ({ ...x, [key]: false }));
    if (!res?.ok) { setMsg("Couldn't undo that set. Try again."); return; }
    update(n => { if (n.sets[b.id]) delete n.sets[b.id][s.k]; return n; });
    setMsg('');
  };
  const toggleDone = (k) => update(n => { if (n.done[k]) delete n.done[k]; else n.done[k] = true; return n; });

  const openFinish = () => { setMinutes(elapsedMinutes(session.startedAt)); setRpe(null); setStep(settings.enableRpe && addRpeSessions ? 'rpe' : 'workout'); if (!(settings.enableRpe && addRpeSessions)) update(n => { n.finishedAt = Date.now(); n.minutes = elapsedMinutes(n.startedAt); return n; }); };
  const labels = settings.rpeSessionLabels?.length ? settings.rpeSessionLabels : ['Lift'];
  const sessionLabel = labels.includes('Lift') ? 'Lift' : labels[0];
  const saveRpe = async () => {
    if (!rpe || savingRpe) return;
    setSavingRpe(true);
    const m = Math.max(1, Math.round(Number(minutes) || 1));
    const res = await addRpeSessions([{ athlete_id: athlete.id, athlete_name: athlete.name, sport: athlete.sport || '', rpe, session_minutes: settings.rpeTrackDuration !== false ? m : null, session_label: sessionLabel, created_at: new Date().toISOString() }]);
    setSavingRpe(false);
    if (!res?.ok) { setMsg("The RPE wasn't saved. Try again."); return; }
    update(n => { n.finishedAt = Date.now(); n.rpe = rpe; n.minutes = m; return n; });
    setStep('workout');
    setMsg(res.queued ? 'Saved on this tablet. It uploads when the signal is back.' : '');
  };

  const scaleMax = Number(settings.rpeScaleMax) || 10;
  if (step === 'rpe') {
    return (
      <div data-testid="wo-rpe" className="flex flex-col gap-space-md">
        <div>
          <div className="font-headline-md text-headline-md uppercase text-on-surface">How hard was today's workout?</div>
          <div className="font-body-md text-body-md text-on-surface-variant">Session RPE, 1 (very easy) to {scaleMax} (max effort).</div>
        </div>
        {scaleMax <= 10 ? (
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: scaleMax }, (_, i) => i + 1).map(v => (
              <button key={v} type="button" data-testid={`wo-rpe-${v}`} aria-pressed={rpe === v} onClick={() => setRpe(v)}
                className={`h-14 rounded-xl font-display text-2xl font-bold ${rpe === v ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-on-surface hover:bg-surface-container-high'}`}>{v}</button>
            ))}
          </div>
        ) : (
          <Stepper value={rpe == null ? '' : String(rpe)} onChange={v => setRpe(Math.min(scaleMax, Math.max(1, parseInt(v, 10) || 0)) || null)} step={1} label="RPE" unit="" testid="wo-rpe-input" />
        )}
        <div className="font-label-md text-label-md text-on-surface-variant h-5">{rpe && scaleMax === 10 ? RPE_WORDS[rpe] : ''}</div>
        {settings.rpeTrackDuration !== false && (
          <div className="flex flex-wrap items-center gap-space-sm">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Time (timed)</span>
            <Stepper value={String(minutes ?? '')} onChange={v => setMinutes(v)} step={5} label="minutes" unit="min" testid="wo-minutes" />
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep('workout')} className="h-12 px-space-md rounded-xl bg-surface-container-highest text-on-surface font-label-md uppercase font-bold">Back</button>
          <button type="button" data-testid="wo-rpe-save" disabled={!rpe || savingRpe} onClick={saveRpe}
            className={`flex-1 h-12 rounded-xl font-headline-md text-headline-md uppercase flex items-center justify-center gap-2 ${!rpe || savingRpe ? 'bg-primary-container/50 text-on-primary-container/50' : 'bg-primary text-on-primary hover:bg-primary-fixed'}`}>
            <Check size={18} /> {savingRpe ? 'Saving...' : 'Save & finish'}
          </button>
        </div>
      </div>
    );
  }

  const list = (title, items, testid) => items && items.length > 0 && (
    <div data-testid={testid} className="flex flex-col gap-1">
      <button type="button" onClick={() => setShowWarm(v => !v)} className="flex items-center gap-1 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant self-start min-h-[44px]">
        {title} {showWarm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {showWarm && <div className="flex flex-wrap gap-x-space-md gap-y-1 font-body-md text-body-md text-on-surface">{items.map((t, i) => <span key={i}>{t}</span>)}</div>}
    </div>
  );

  return (
    <div data-testid="workout-panel" className="flex flex-col gap-space-md">
      <div className="flex flex-wrap items-start justify-between gap-space-sm">
        <div className="min-w-0">
          <div className="font-label-sm text-label-sm uppercase tracking-wider text-primary">Today's workout</div>
          <div data-testid="wo-title" className="font-headline-md text-headline-md uppercase text-on-surface">{cur.day.focus || cur.program.name}</div>
          <div className="font-label-sm text-label-sm text-on-surface-variant">{[cur.program.name, cur.program.week_label, cur.program.phase].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="flex items-center gap-2">
          <span data-testid="wo-timer" className={`${chip} bg-surface-container-highest text-on-surface flex items-center gap-1`}><Timer size={13} /> {mins} min</span>
          <span data-testid="wo-progress" className={`${chip} ${done >= total ? 'bg-secondary-container/30 text-secondary' : 'bg-surface-container-highest text-on-surface'}`}>{done}/{total}</span>
        </div>
      </div>

      {workouts.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {workouts.map((w, i) => (
            <button key={`${w.program.id}_${w.day.id}`} type="button" aria-pressed={i === pick} onClick={() => setPick(i)} disabled={i !== pick && Object.keys(session.sets || {}).length > 0}
              className={`min-h-[44px] px-space-sm rounded-lg font-label-md uppercase ${i === pick ? 'bg-primary-container text-on-primary-container border-2 border-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
              {w.day.focus || w.program.name}
            </button>
          ))}
        </div>
      )}

      {finished && (
        <div data-testid="wo-complete" className="px-4 py-3 rounded-xl bg-secondary-container/20 border border-secondary-container/40 text-secondary font-label-md">
          Workout complete{session.rpe ? ` · RPE ${session.rpe}` : ''} · {session.minutes} min. Nice work.
        </div>
      )}
      {msg && <div data-testid="wo-msg" className="px-4 py-3 rounded-xl bg-primary-container/20 border border-primary/30 text-on-surface font-label-md">{msg}</div>}

      {list(cur.day.warmTitle || 'Warm-up', cur.day.warm, 'wo-warm')}

      <div className="flex flex-col gap-space-sm">
        {blocks.map(b => (
          <div key={b.id} data-testid="wo-block" className={`p-space-sm rounded-xl bg-surface-container ${b.newGroup ? 'mt-space-sm' : ''}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`${chip} bg-primary-container text-on-primary-container font-bold`}>{b.code}</span>
              <span className="font-headline-md text-headline-md text-on-surface">{b.name}</span>
              {b.lift && b.max ? <span className="font-label-sm text-label-sm text-on-surface-variant">Max {b.max}</span> : null}
              {b.velocity ? <span className="font-label-sm text-label-sm text-on-surface-variant">Velocity {b.velocity} m/s</span> : null}
            </div>
            {b.note && <div className="font-body-md text-body-md text-on-surface-variant mt-1">{b.note}</div>}
            {!b.sets.length ? (
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="font-display text-xl font-bold text-on-surface">{b.rx}</span>
                <button type="button" data-testid="wo-done" aria-pressed={!!session.done?.[b.id]} onClick={() => toggleDone(b.id)}
                  className={`min-h-[44px] min-w-[88px] px-space-sm rounded-lg font-label-md uppercase font-bold flex items-center justify-center gap-1 ${session.done?.[b.id] ? 'bg-secondary-container/40 text-secondary' : 'bg-surface-container-highest text-on-surface'}`}>
                  <Check size={16} /> {session.done?.[b.id] ? 'Done' : 'Mark done'}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 mt-2">
                {b.sets.map(s => {
                  const key = `${b.id}_${s.k}`;
                  const logged = session.sets?.[b.id]?.[s.k];
                  const v = valFor(b, s);
                  const head = (
                    <div className="flex flex-col min-w-[96px]">
                      <span className="font-label-md text-label-md font-bold text-on-surface uppercase">Set {s.k + 1}</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">{[s.reps && `${s.reps} reps`, s.pct && `${s.pct}%`, s.wt && `${s.wt} lb`, s.tempo].filter(Boolean).join(' · ')}</span>
                    </div>
                  );
                  if (logged) {
                    return (
                      <div key={key} data-testid="wo-set" data-logged="1" className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-secondary-container/20">
                        {head}
                        <span className="font-display text-xl font-bold text-secondary flex items-center gap-1"><Check size={18} /> {logged.w} × {logged.r}</span>
                        <button type="button" onClick={() => undoSet(b, s)} disabled={!!busy[key]} aria-label={`Undo set ${s.k + 1}`} className="min-h-[44px] min-w-[44px] px-2 rounded-lg text-on-surface-variant hover:text-on-surface flex items-center gap-1 font-label-sm uppercase"><Undo2 size={16} /> Undo</button>
                      </div>
                    );
                  }
                  if (!b.loggable) {
                    const k2 = `${b.id}_${s.k}`;
                    return (
                      <div key={key} data-testid="wo-set" className="flex items-center justify-between gap-2 p-2 rounded-lg bg-surface-container-high">
                        {head}
                        <button type="button" data-testid="wo-done" aria-pressed={!!session.done?.[k2]} onClick={() => toggleDone(k2)}
                          className={`min-h-[44px] min-w-[88px] px-space-sm rounded-lg font-label-md uppercase font-bold flex items-center justify-center gap-1 ${session.done?.[k2] ? 'bg-secondary-container/40 text-secondary' : 'bg-surface-container-highest text-on-surface'}`}>
                          <Check size={16} /> {session.done?.[k2] ? 'Done' : 'Mark done'}
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={key} data-testid="wo-set" className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-surface-container-high">
                      {head}
                      <Stepper value={v.w} onChange={w => setVal(b, s, { w })} step={5} label={`Set ${s.k + 1} weight`} unit="lb" testid="wo-weight" />
                      <Stepper value={v.r} onChange={r => setVal(b, s, { r: r.replace(/\..*/, '') })} step={1} label={`Set ${s.k + 1} reps`} unit="reps" testid="wo-reps" />
                      <button type="button" data-testid="wo-log" onClick={() => logSet(b, s)} disabled={!!busy[key] || !(parseFloat(v.w) > 0) || !(parseInt(v.r, 10) > 0)}
                        className="ml-auto min-h-[44px] min-w-[88px] px-space-sm rounded-lg bg-primary text-on-primary hover:bg-primary-fixed disabled:opacity-40 font-label-md uppercase font-bold flex items-center justify-center gap-1">
                        <Check size={16} /> {busy[key] ? 'Saving' : 'Log'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {list(cur.day.finTitle || 'Finisher', cur.day.fin, 'wo-fin')}

      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="wo-free-log" onClick={onFreeLog} className="min-h-[48px] px-space-md rounded-xl bg-surface-container-highest text-on-surface font-label-md uppercase font-bold flex items-center gap-1">
          <Plus size={16} /> Log a lift not on the plan
        </button>
        {!finished && (
          <button type="button" data-testid="wo-finish" onClick={openFinish} className="flex-1 min-h-[48px] px-space-md rounded-xl bg-primary text-on-primary hover:bg-primary-fixed font-headline-md text-headline-md uppercase flex items-center justify-center gap-2">
            <Check size={18} /> Finish workout
          </button>
        )}
      </div>
    </div>
  );
}
