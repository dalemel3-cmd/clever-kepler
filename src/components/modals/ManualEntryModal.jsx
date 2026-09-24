import { X, Zap } from 'lucide-react';
import { centralWallTimeToISO, isPlausibleWeight, markLogAsPostPractice } from '../../utils/athleteData';

// Coach manual / post-practice weigh-in + RPE entry form. Split out of App.jsx;
// form state (manualEntryForm) still lives in App and is passed in.
export function ManualEntryModal({
  athletes,
  handleSaveManualLog,
  handleUpdateManualLog,
  manualEntryForm,
  setManualEntryForm,
  setShowManualEntryModal,
  settings,
  showToast,
}) {
  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.95)' }}>
      <div className="card-glass glow-card" style={{ maxWidth: '540px', width: '100%', borderRadius: '24px', border: '1px solid rgba(96, 165, 250, 0.4)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.3) 0%, rgba(15, 23, 42, 0.6) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(96, 165, 250, 0.2)', border: '1px solid rgba(96, 165, 250, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
              <Zap size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {manualEntryForm.editingLogId ? 'EDIT LOG ENTRY' : 'COACH MANUAL LOG STUDIO'}
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                {manualEntryForm.editingLogId ? 'Correct the date, time, weight, or Session RPE on this existing log' : "Log acute post-practice weights without altering morning baseline trends"}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setShowManualEntryModal(false);
              setManualEntryForm(p => ({ ...p, editingLogId: null, weight: '', rpe: '', rpeDuration: '', rpeLabel: '', successMsg: '' }));
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={24} />
          </button>
        </div>

        {/* Form Content */}
        <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {manualEntryForm.successMsg && (
            <div className="animate-fade-in" style={{ padding: '14px 20px', borderRadius: '14px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.4)', color: '#4ade80', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>🎉</span>
              <span>{manualEntryForm.successMsg}</span>
            </div>
          )}

          {/* Session Type Switch */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setManualEntryForm(p => ({ ...p, sessionType: 'post_practice', successMsg: '' }))}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '14px',
                border: manualEntryForm.sessionType === 'post_practice' ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                background: manualEntryForm.sessionType === 'post_practice' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.02)',
                color: manualEntryForm.sessionType === 'post_practice' ? '#fff' : 'var(--color-text-muted)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>⚡ Post-Practice Sweat Check</span>
            </button>
            <button
              type="button"
              onClick={() => setManualEntryForm(p => ({ ...p, sessionType: 'morning', successMsg: '' }))}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '14px',
                border: manualEntryForm.sessionType === 'morning' ? '2px solid #d4af37' : '1px solid rgba(255,255,255,0.1)',
                background: manualEntryForm.sessionType === 'morning' ? 'rgba(212, 175, 55, 0.2)' : 'rgba(255,255,255,0.02)',
                color: manualEntryForm.sessionType === 'morning' ? '#fff' : 'var(--color-text-muted)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <span>☀️ Morning / Baseline Correction</span>
            </button>
            {settings.enableRpe && (
              <button
                type="button"
                onClick={() => setManualEntryForm(p => ({ ...p, sessionType: 'rpe', successMsg: '' }))}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '14px',
                  border: manualEntryForm.sessionType === 'rpe' ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.1)',
                  background: manualEntryForm.sessionType === 'rpe' ? 'rgba(167, 139, 250, 0.2)' : 'rgba(255,255,255,0.02)',
                  color: manualEntryForm.sessionType === 'rpe' ? '#fff' : 'var(--color-text-muted)',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>🎯 Session RPE</span>
              </button>
            )}
          </div>

          {/* Athlete Selector */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Select Athlete</label>
            <select
              className="input-glass"
              value={manualEntryForm.athleteId}
              onChange={e => setManualEntryForm(p => ({ ...p, athleteId: e.target.value, successMsg: '' }))}
              style={{ width: '100%', height: '46px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '15px', fontWeight: 700, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
            >
              <option value="" disabled>-- Select Roster Athlete --</option>
              {athletes.slice().sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.sport || 'Athlete'})</option>
              ))}
            </select>
          </div>

          {/* Date & Time Selectors */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Date</label>
              <input
                type="date"
                className="input-glass"
                value={manualEntryForm.date}
                onChange={e => setManualEntryForm(p => ({ ...p, date: e.target.value, successMsg: '' }))}
                style={{ width: '100%', height: '44px', padding: '0 14px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '14px', border: '1px solid rgba(255,255,255,0.2)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Time</label>
              <input
                type="time"
                className="input-glass"
                value={manualEntryForm.time}
                onChange={e => setManualEntryForm(p => ({ ...p, time: e.target.value, successMsg: '' }))}
                style={{ width: '100%', height: '44px', padding: '0 14px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '14px', border: '1px solid rgba(255,255,255,0.2)' }}
              />
            </div>
          </div>

          {manualEntryForm.sessionType === 'rpe' ? (
            /* Session RPE fields - what the athlete actually entered on the kiosk:
               the RPE rating, how long the session ran, and its label, so a coach
               can see and correct a mis-entered value rather than only weight. */
            <>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Session RPE (1–{settings.rpeScaleMax})</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max={settings.rpeScaleMax}
                  placeholder="7"
                  className="input-glass"
                  value={manualEntryForm.rpe}
                  onChange={e => setManualEntryForm(p => ({ ...p, rpe: e.target.value.replace(/[^0-9]/g, ''), successMsg: '' }))}
                  style={{ width: '100%', height: '48px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(167, 139, 250, 0.4)' }}
                />
              </div>
              {settings.rpeTrackDuration && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Session Duration (minutes)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="60"
                    className="input-glass"
                    value={manualEntryForm.rpeDuration}
                    onChange={e => setManualEntryForm(p => ({ ...p, rpeDuration: e.target.value.replace(/[^0-9]/g, ''), successMsg: '' }))}
                    style={{ width: '100%', height: '48px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(167, 139, 250, 0.4)' }}
                  />
                </div>
              )}
              {(settings.rpeSessionLabels || []).length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Session Label</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {settings.rpeSessionLabels.map(lbl => (
                      <button
                        key={lbl}
                        type="button"
                        onClick={() => setManualEntryForm(p => ({ ...p, rpeLabel: lbl, successMsg: '' }))}
                        style={{
                          padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          border: manualEntryForm.rpeLabel === lbl ? '2px solid #a78bfa' : '1px solid rgba(255,255,255,0.15)',
                          background: manualEntryForm.rpeLabel === lbl ? 'rgba(167, 139, 250, 0.2)' : 'rgba(255,255,255,0.02)',
                          color: manualEntryForm.rpeLabel === lbl ? '#fff' : 'var(--color-text-muted)',
                        }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Body Weight with quick tailored incrementers */
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Body Weight (lbs)</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="number"
                  step="0.1"
                  placeholder="210.5"
                  className="input-glass"
                  value={manualEntryForm.weight}
                  onChange={e => setManualEntryForm(p => ({ ...p, weight: e.target.value, successMsg: '' }))}
                  style={{ flex: 1, height: '48px', padding: '0 16px', borderRadius: '12px', background: 'var(--navy-900)', color: '#fff', fontSize: '20px', fontWeight: 800, fontFamily: 'var(--font-display)', border: '1px solid rgba(96, 165, 250, 0.4)' }}
                />
                <button type="button" onClick={() => { const val = (parseFloat(manualEntryForm.weight || 200) - 1).toFixed(1); setManualEntryForm(p => ({ ...p, weight: val })); }} className="btn-secondary" style={{ height: '48px', width: '48px', padding: 0, borderRadius: '12px', fontSize: '16px', fontWeight: 800 }}>-1</button>
                <button type="button" onClick={() => { const val = (parseFloat(manualEntryForm.weight || 200) - 0.1).toFixed(1); setManualEntryForm(p => ({ ...p, weight: val })); }} className="btn-secondary" style={{ height: '48px', width: '48px', padding: 0, borderRadius: '12px', fontSize: '16px', fontWeight: 800 }}>-.1</button>
                <button type="button" onClick={() => { const val = (parseFloat(manualEntryForm.weight || 200) + 0.1).toFixed(1); setManualEntryForm(p => ({ ...p, weight: val })); }} className="btn-secondary" style={{ height: '48px', width: '48px', padding: 0, borderRadius: '12px', fontSize: '16px', fontWeight: 800 }}>+.1</button>
                <button type="button" onClick={() => { const val = (parseFloat(manualEntryForm.weight || 200) + 1).toFixed(1); setManualEntryForm(p => ({ ...p, weight: val })); }} className="btn-secondary" style={{ height: '48px', width: '48px', padding: 0, borderRadius: '12px', fontSize: '16px', fontWeight: 800 }}>+1</button>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="button"
            onClick={() => {
              const isRpeTab = manualEntryForm.sessionType === 'rpe';
              const rpeNum = parseFloat(manualEntryForm.rpe);
              const durationNum = parseInt(manualEntryForm.rpeDuration, 10);

              if (!manualEntryForm.athleteId) {
                showToast('Select an athlete.', 'error');
                return;
              }
              if (isRpeTab) {
                if (!(rpeNum > 0 && rpeNum <= settings.rpeScaleMax)) {
                  showToast(`Enter a valid RPE (1–${settings.rpeScaleMax}).`, 'error');
                  return;
                }
                if (settings.rpeTrackDuration && !(durationNum > 0)) {
                  showToast('Enter a valid session duration in minutes.', 'error');
                  return;
                }
              } else if (!isPlausibleWeight(parseFloat(manualEntryForm.weight))) {
                showToast('Select an athlete and enter a valid body weight (0–1000 lbs).', 'error');
                return;
              }
              const ath = athletes.find(a => a.id === manualEntryForm.athleteId);
              // Interpret the picked date/time as Central (program) wall-clock time; a
              // cleared/invalid date used to throw an uncaught RangeError here.
              const dateTimeStr = centralWallTimeToISO(manualEntryForm.date, manualEntryForm.time);
              if (!dateTimeStr) {
                showToast('Select a valid date and time for this log.', 'error');
                return;
              }
              const isEditing = !!manualEntryForm.editingLogId;
              const rec = isRpeTab ? {
                id: isEditing ? manualEntryForm.editingLogId : 'manual_' + Date.now(),
                athlete_id: manualEntryForm.athleteId,
                athlete_name: ath ? ath.name : 'Unknown',
                sport: ath ? ath.sport : '',
                weight_lbs: 0,
                sleep_hrs: 0,
                created_at: dateTimeStr,
                session_type: 'rpe',
                rpe: rpeNum,
                session_minutes: settings.rpeTrackDuration ? durationNum : null,
                session_label: manualEntryForm.rpeLabel || null,
              } : {
                id: isEditing ? manualEntryForm.editingLogId : 'manual_' + Date.now(),
                athlete_id: manualEntryForm.athleteId,
                athlete_name: ath ? ath.name : 'Unknown',
                sport: ath ? ath.sport : '',
                weight_lbs: parseFloat(manualEntryForm.weight),
                sleep_hrs: 0,
                created_at: dateTimeStr,
                session_type: manualEntryForm.sessionType
              };

              if (rec.session_type === 'post_practice') {
                markLogAsPostPractice(rec);
              }

              if (isEditing) {
                handleUpdateManualLog(manualEntryForm.editingLogId, rec);
              } else {
                handleSaveManualLog(rec);
              }
              setManualEntryForm(p => ({
                ...p,
                weight: isEditing ? p.weight : '',
                rpe: isEditing ? p.rpe : '',
                rpeDuration: isEditing ? p.rpeDuration : '',
                rpeLabel: isEditing ? p.rpeLabel : '',
                successMsg: isEditing
                  ? (isRpeTab
                      ? `Saved changes to ${rec.athlete_name}'s Session RPE log (RPE ${rec.rpe}${rec.session_minutes ? `, ${rec.session_minutes} min` : ''}, ${manualEntryForm.date} ${manualEntryForm.time}).`
                      : `Saved changes to ${rec.athlete_name}'s ${rec.session_type === 'post_practice' ? 'post-practice' : 'morning'} log (${rec.weight_lbs} lbs, ${manualEntryForm.date} ${manualEntryForm.time}).`)
                  : (isRpeTab
                      ? `Successfully recorded Session RPE (${rec.rpe}) for ${rec.athlete_name}!`
                      : `Successfully recorded ${manualEntryForm.sessionType === 'post_practice' ? 'Post-Practice' : 'Morning'} weight (${rec.weight_lbs} lbs) for ${rec.athlete_name}!`)
              }));
            }}
            style={{
              height: '52px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#fff',
              border: 'none',
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 800,
              letterSpacing: '0.05em',
              cursor: 'pointer',
              boxShadow: '0 8px 25px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s',
              marginTop: '10px'
            }}
          >
            {manualEntryForm.editingLogId ? 'SAVE CHANGES ➔' : 'SAVE MANUAL RECORD ➔'}
          </button>
        </div>
      </div>
    </div>
  );
}
