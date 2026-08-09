import { Search, X, Plus, Minus, CheckCircle, User } from 'lucide-react';
import { KioskNumpad } from '../../components/KioskNumpad';
import { parseAthleteMeta, getBaselinesMap } from '../../utils/athleteData';

export default function EntryScreen({
  settings,
  kioskTrackMode,
  setKioskTrackMode,
  isBaselineTestingMode,
  setIsBaselineTestingMode,
  setIsAddingAthlete,
  setEditingAthleteId,
  setNewAthlete,
  selectedSportFilter,
  selectedTeamFilter,
  selectedGradeFilter,
  selectedPositionFilter,
  athletesRecordedToday,
  search,
  setSearch,
  sportsList,
  gradesList,
  teamsList,
  positionsList,
  filteredAthletes,
  setSelectedSportFilter,
  setSelectedGradeFilter,
  setSelectedTeamFilter,
  setSelectedPositionFilter,
  nameSortOrder,
  setNameSortOrder,
  unweighedOnlyFilter,
  setUnweighedOnlyFilter,
  entryAthleteId,
  setEntryAthleteId,
  handleSelectAthleteForEntry,
  getLastName,
  getFirstName,
  selectedAthlete,
  newAthlete,
  weightInput,
  setWeightInput,
  rpeInput,
  setRpeInput,
  rpeDurationInput,
  setRpeDurationInput,
  rpeLabelInput,
  setRpeLabelInput,
  sleepInput,
  setSleepInput,
  focusedField,
  setFocusedField,
  handleSave,
  reportData,
  saving,
  handleCreateAthlete,
  isAddingAthlete,
  screen
}) {
  // Last recorded weight for the open athlete - shown as a ghost placeholder and used
  // to seed the +/- steppers, but never pre-filled into the input (a pre-filled value
  // let one accidental double-tap record yesterday's weight as today's).
  const lastLoggedWeight = selectedAthlete ? (() => {
    const rec = reportData
      .filter(r => r.athlete_id === selectedAthlete.id && Number(r.weight_lbs) > 0)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    return rec ? parseFloat(rec.weight_lbs) : null;
  })() : null;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>QUICK ENTRY</h2>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Tap your card to log today's {kioskTrackMode === 'sleep_only' ? 'sleep & recovery' : (kioskTrackMode === 'rpe' ? 'session RPE' : 'weigh-in & sleep')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Track Mode Toggle Pill */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              type="button"
              onClick={() => {
                setKioskTrackMode('both');
                try { localStorage.setItem('shiloh_kiosk_track_mode', 'both'); } catch(e) {}
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '19px',
                background: kioskTrackMode === 'both' ? 'var(--color-accent)' : 'transparent',
                color: kioskTrackMode === 'both' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                border: 'none',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ⚖️ Weight + Sleep
            </button>
            <button
              type="button"
              onClick={() => {
                setKioskTrackMode('sleep_only');
                try { localStorage.setItem('shiloh_kiosk_track_mode', 'sleep_only'); } catch(e) {}
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '19px',
                background: kioskTrackMode === 'sleep_only' ? 'var(--color-accent)' : 'transparent',
                color: kioskTrackMode === 'sleep_only' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                border: 'none',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              😴 Sleep Only
            </button>
            {settings?.enableRpe && (
              <button
                type="button"
                onClick={() => {
                  setKioskTrackMode('rpe');
                  setFocusedField('rpe');
                  try { localStorage.setItem('shiloh_kiosk_track_mode', 'rpe'); } catch(e) {}
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '19px',
                  background: kioskTrackMode === 'rpe' ? 'var(--color-accent)' : 'transparent',
                  color: kioskTrackMode === 'rpe' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                🎯 Session RPE
              </button>
            )}
          </div>

          {/* Baseline Testing Mode Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsBaselineTestingMode(!isBaselineTestingMode);
            }}
            className="glow-card"
            style={{
              height: '40px',
              padding: '0 16px',
              borderRadius: '20px',
              background: isBaselineTestingMode ? '#10b981' : 'rgba(16, 185, 129, 0.12)',
              color: isBaselineTestingMode ? '#000' : '#10b981',
              border: '1px solid #10b981',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              transition: 'all 0.25s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isBaselineTestingMode ? '0 0 18px rgba(16, 185, 129, 0.55)' : 'none'
            }}
          >
            <span>{isBaselineTestingMode ? '🎯 BASELINE MODE ACTIVE' : '🎯 Enable Baseline Mode'}</span>
          </button>

          <button
            onClick={() => {
              setIsAddingAthlete(true);
              setEditingAthleteId(null);
              setNewAthlete({ name: '', sport: selectedSportFilter !== 'ALL' ? selectedSportFilter : '', team: selectedTeamFilter !== 'ALL' ? selectedTeamFilter : '', grade: selectedGradeFilter !== 'ALL' ? selectedGradeFilter : '', position: selectedPositionFilter !== 'ALL' ? selectedPositionFilter : '' });
            }}
            className="btn-primary glow-card"
            style={{
              height: '40px',
              padding: '0 18px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--color-accent)',
              color: 'var(--navy-950)',
              border: '1px solid var(--color-accent)',
              borderRadius: '20px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(194, 164, 80, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            <Plus size={17} strokeWidth={2.5} /> Add Athlete
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.35)', padding: '6px 14px', borderRadius: '20px' }}>
            <CheckCircle size={16} style={{ color: 'var(--status-success)' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-success)', letterSpacing: '0.04em' }}>{athletesRecordedToday.size} LOGGED TODAY</span>
          </div>
        </div>
      </div>

      {/* Active Baseline Mode Notification Banner */}
      {isBaselineTestingMode && (
        <div className="card-glass glow-card" style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.45)', padding: '16px 22px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '26px' }}>🎯</span>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#10b981', display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                BASELINE TESTING STATION ENABLED
              </span>
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                Every weigh-in logged while this mode is active automatically updates the athlete's target baseline mass and resets their {settings.baselineExpiryDays}-day inactivity interval.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBaselineTestingMode(false)}
            style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'background 0.2s' }}
          >
            Exit Baseline Mode
          </button>
        </div>
      )}

      {/* Search & Dropdown Filters Container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={16} style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="input-glass"
            placeholder="Search athletes by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', height: '46px', padding: '0 40px 0 44px', fontSize: '15px', borderRadius: '10px' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '12px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Responsive Dropdown Filter Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
          <select
            value={selectedSportFilter}
            onChange={e => setSelectedSportFilter(e.target.value)}
            className="input-glass"
            style={{ height: '42px', padding: '0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', borderRadius: '8px' }}
          >
            <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>All Sports</option>
            {sportsList.map(sport => (
              <option key={sport} value={sport} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{sport.toUpperCase()}</option>
            ))}
          </select>

          <select
            value={selectedGradeFilter}
            onChange={e => setSelectedGradeFilter(e.target.value)}
            className="input-glass"
            style={{ height: '42px', padding: '0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', borderRadius: '8px' }}
          >
            <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>All Grades</option>
            {gradesList.map(grade => (
              <option key={grade} value={grade} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{grade.toUpperCase()}</option>
            ))}
          </select>

          <select
            value={selectedTeamFilter}
            onChange={e => setSelectedTeamFilter(e.target.value)}
            className="input-glass"
            style={{ height: '42px', padding: '0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', borderRadius: '8px' }}
          >
            <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>All Teams</option>
            {teamsList.map(team => (
              <option key={team} value={team} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{team.toUpperCase()}</option>
            ))}
          </select>

          <select
            value={selectedPositionFilter}
            onChange={e => setSelectedPositionFilter(e.target.value)}
            className="input-glass"
            style={{ height: '42px', padding: '0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', borderRadius: '8px' }}
          >
            <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>All Positions</option>
            {positionsList.map(pos => (
              <option key={pos} value={pos} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{pos.toUpperCase()}</option>
            ))}
          </select>
        </div>

        {/* Sort Order Toggle Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 2px', marginTop: '2px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            Showing {filteredAthletes.length} athlete{filteredAthletes.length !== 1 ? 's' : ''}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sort by:</span>
            <div style={{ display: 'flex', background: 'var(--navy-900)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '20px', padding: '2px' }}>
              <button
                type="button"
                onClick={() => setNameSortOrder('first')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '16px',
                  border: 'none',
                  background: nameSortOrder === 'first' ? 'var(--color-accent)' : 'transparent',
                  color: nameSortOrder === 'first' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                First Name
              </button>
              <button
                type="button"
                onClick={() => setNameSortOrder('last')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '16px',
                  border: 'none',
                  background: nameSortOrder === 'last' ? 'var(--color-accent)' : 'transparent',
                  color: nameSortOrder === 'last' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Last Name
              </button>
            </div>
          </div>
        </div>

        {/* Responsive Athlete Card Grid */}
        {unweighedOnlyFilter && (
          <div style={{ background: 'rgba(194, 164, 80, 0.15)', border: '1px solid var(--color-accent)', padding: '14px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: '15px', color: '#fff', textTransform: 'uppercase' }}>
                  PRIORITY FILTER ACTIVE: UNLOGGED ATHLETES ONLY
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Showing {filteredAthletes.filter(a => !athletesRecordedToday.has(a.id)).length} athletes remaining for today's check-in session.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setUnweighedOnlyFilter(false)}
              style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
            >
              ✕ SHOW ALL ATHLETES
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '12px', maxHeight: '70vh', overflowY: 'auto', paddingRight: '4px', paddingBottom: '90px' }}>
          {(unweighedOnlyFilter ? filteredAthletes.filter(a => !athletesRecordedToday.has(a.id)) : filteredAthletes).map(a => {
            const isSelected = entryAthleteId === a.id;
            const isDoneToday = athletesRecordedToday.has(a.id);
            // Defensive: rosters cached before name normalization can still hold null names
            const safeName = (a.name && String(a.name).trim()) || 'Unnamed Athlete';
            const initials = nameSortOrder === 'last'
              ? `${getLastName(safeName)[0] || ''}${getFirstName(safeName)[0] || ''}`
              : safeName.split(' ').map(n=>n[0]).join('');

            const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
            let hash = 0;
            for (let i = 0; i < safeName.length; i++) hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
            const avatarBg = avatarColors[Math.abs(hash) % avatarColors.length];

            return (
              <div
                key={a.id}
                onClick={() => handleSelectAthleteForEntry(a.id)}
                className="card-glass"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  borderRadius: '16px',
                  border: isDoneToday ? '1px solid rgba(34, 197, 94, 0.45)' : (isSelected ? '2px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.08)'),
                  background: isDoneToday ? 'rgba(34, 197, 94, 0.08)' : (isSelected ? 'rgba(194, 164, 80, 0.12)' : 'rgba(255,255,255,0.02)'),
                  boxShadow: isDoneToday ? '0 4px 20px rgba(34, 197, 94, 0.12)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>
                    {initials}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: isDoneToday ? 'var(--status-success)' : (isSelected ? 'var(--color-accent)' : 'var(--white)'), textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {nameSortOrder === 'last' ? `${getLastName(safeName)}, ${getFirstName(safeName)}` : safeName}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {a.sport}{a.position ? ` · ${a.position}` : (a.team ? ` · ${a.team}` : '')}
                    </span>
                  </div>
                </div>

                {isDoneToday ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(34, 197, 94, 0.18)', border: '1px solid rgba(34, 197, 94, 0.5)', padding: '5px 10px', borderRadius: '20px', flexShrink: 0 }}>
                    <CheckCircle size={15} style={{ color: 'var(--status-success)' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-success)', letterSpacing: '0.05em' }}>DONE</span>
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '16px', flexShrink: 0 }}>
                    TAP TO LOG
                  </div>
                )}
              </div>
            );
          })}
          {filteredAthletes.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '44px 20px', color: 'var(--color-text-muted)', fontSize: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--white)', display: 'block', marginBottom: '6px' }}>Athlete Not Found in Roster?</span>
                No athletes matched your search or filters. If you are new to the program, you can quickly create your profile right now!
              </div>
              <button
                onClick={() => {
                  setIsAddingAthlete(true);
                  setEditingAthleteId(null);
                  setNewAthlete({ name: search || '', sport: selectedSportFilter !== 'ALL' ? selectedSportFilter : '', team: selectedTeamFilter !== 'ALL' ? selectedTeamFilter : '', grade: selectedGradeFilter !== 'ALL' ? selectedGradeFilter : '', position: selectedPositionFilter !== 'ALL' ? selectedPositionFilter : '' });
                }}
                className="btn-primary glow-card"
                style={{ height: '48px', padding: '0 24px', fontSize: '15px', fontWeight: 800, background: 'var(--color-accent)', color: 'var(--navy-950)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 20px rgba(194, 164, 80, 0.3)' }}
              >
                <Plus size={18} strokeWidth={2.5} /> Add {search ? `"${search}"` : 'New Athlete'} & Log Weight
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pop-up Weigh-in Modal Overlay */}
      {entryAthleteId && selectedAthlete && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(3, 8, 20, 0.82)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflowY: 'auto'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEntryAthleteId(null);
          }}
        >
          <div
            className="card-glass glow-card animate-slide-up"
            style={{
              width: '100%',
              maxWidth: '580px',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              borderRadius: '24px',
              border: '1px solid rgba(194, 164, 80, 0.4)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.85)',
              maxHeight: '92vh',
              overflowY: 'auto',
              margin: 'auto'
            }}
          >
            {/* Athlete Profile Title inside Modal */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                {(() => {
                  const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
                  let hash = 0;
                  for (let i = 0; i < selectedAthlete.name.length; i++) hash = selectedAthlete.name.charCodeAt(i) + ((hash << 5) - hash);
                  const avatarBg = avatarColors[Math.abs(hash) % avatarColors.length];
                  return (
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 700, fontSize: '22px', flexShrink: 0 }}>
                      {selectedAthlete.name.split(' ').map(n=>n[0]).join('')}
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase' }}>{selectedAthlete.name}</span>
                    {athletesRecordedToday.has(selectedAthlete.id) && (
                      <span style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.2)', color: 'var(--status-success)', border: '1px solid rgba(34, 197, 94, 0.4)', padding: '3px 10px', borderRadius: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={12} /> LOGGED TODAY
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
                    {selectedAthlete.sport}{selectedAthlete.grade ? ` · ${selectedAthlete.grade}` : ''} &middot; {selectedAthlete.position}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEntryAthleteId(null)}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                title="Close modal"
              >
                <X size={22} />
              </button>
            </div>

            {/* Track Mode Indicator / Rapid Switch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Mode: <span style={{ color: 'var(--white)' }}>{kioskTrackMode === 'sleep_only' ? '😴 Sleep & Recovery Only' : '⚖️ Weight + Sleep'}</span>
              </span>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', padding: '2px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setKioskTrackMode('both');
                    try { localStorage.setItem('shiloh_kiosk_track_mode', 'both'); } catch(e){}
                    setFocusedField('weight');
                  }}
                  style={{ padding: '4px 10px', borderRadius: '14px', background: kioskTrackMode === 'both' ? 'var(--color-accent)' : 'transparent', color: kioskTrackMode === 'both' ? 'var(--navy-950)' : 'var(--color-text-muted)', border: 'none', fontWeight: 700, fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  ⚖️ + 😴 Both
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKioskTrackMode('sleep_only');
                    try { localStorage.setItem('shiloh_kiosk_track_mode', 'sleep_only'); } catch(e){}
                    setFocusedField('sleep');
                  }}
                  style={{ padding: '4px 10px', borderRadius: '14px', background: kioskTrackMode === 'sleep_only' ? 'var(--color-accent)' : 'transparent', color: kioskTrackMode === 'sleep_only' ? 'var(--navy-950)' : 'var(--color-text-muted)', border: 'none', fontWeight: 700, fontSize: '11px', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  😴 Sleep Only
                </button>
              </div>
            </div>

            {/* Form Inputs & Numpad Layout */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {/* Left Column: Inputs */}
              <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {kioskTrackMode === 'sleep_only' ? (
                  <div
                    onClick={() => {
                      setKioskTrackMode('both');
                      try { localStorage.setItem('shiloh_kiosk_track_mode', 'both'); } catch(e){}
                      setFocusedField('weight');
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(59, 130, 246, 0.08)', border: '1px dashed rgba(59, 130, 246, 0.4)', padding: '16px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s' }}
                    title="Click to enable body weight tracking for this session"
                  >
                    <div style={{ fontSize: '28px' }}>⚖️</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)', letterSpacing: '0.02em' }}>Weight Tracking Disabled</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: 1.3 }}>Scale recording skipped in Sleep Only Mode. Tap here to enable body weight.</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Body Weight (lbs)</span>
                      {lastLoggedWeight && !weightInput && (
                        <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 700 }}>LAST RECORDED: {lastLoggedWeight} LBS — ENTER TODAY'S</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button type="button" onClick={() => setWeightInput(prev => String(Math.max(0, (parseFloat(prev || lastLoggedWeight || 0) - 0.5).toFixed(1))))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Minus size={20} /></button>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Body weight (lbs)"
                        placeholder={lastLoggedWeight ? String(lastLoggedWeight) : '0.0'}
                        value={weightInput || ''}
                        onFocus={() => setFocusedField('weight')}
                        onChange={(e) => setWeightInput(e.target.value.replace(/[^0-9.]/g, ''))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                        style={{ flex: 1, width: '100%', height: '64px', background: focusedField === 'weight' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'weight' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: focusedField === 'weight' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 700, outline: 'none', transition: 'all 0.2s', padding: '0 10px' }}
                      />
                      <button type="button" onClick={() => setWeightInput(prev => String((parseFloat(prev || lastLoggedWeight || 0) + 0.5).toFixed(1)))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Plus size={20} /></button>
                    </div>
                  </div>
                )}

                {kioskTrackMode === 'rpe' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Session RPE (1-{settings.rpeScaleMax})</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Session RPE"
                      placeholder="e.g. 7"
                      value={rpeInput || ''}
                      onFocus={() => setFocusedField('rpe')}
                      onChange={(e) => setRpeInput(e.target.value.replace(/[^0-9.]/g, ''))}
                      style={{ flex: 1, width: '100%', height: '56px', background: focusedField === 'rpe' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'rpe' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: focusedField === 'rpe' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, outline: 'none', transition: 'all 0.2s', padding: '0 10px' }}
                    />
                    
                    {/* Duration is optional per program - when rpeTrackDuration is off the
                        field is hidden, and the save no longer requires it. */}
                    {settings.rpeTrackDuration && (<>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Duration (Minutes)</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Session Duration"
                      placeholder="e.g. 90"
                      value={rpeDurationInput || ''}
                      onFocus={() => setFocusedField('rpe_duration')}
                      onChange={(e) => setRpeDurationInput(e.target.value.replace(/[^0-9.]/g, ''))}
                      style={{ flex: 1, width: '100%', height: '56px', background: focusedField === 'rpe_duration' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'rpe_duration' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: focusedField === 'rpe_duration' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, outline: 'none', transition: 'all 0.2s', padding: '0 10px' }}
                    />
                    </>)}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Session Label</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {/* Labels come from settings so a program can name its own session
                          types; the hardcoded list ignored rpeSessionLabels entirely. */}
                      {(settings.rpeSessionLabels || []).map(lbl => (
                        <button
                          key={lbl}
                          type="button"
                          onClick={() => setRpeLabelInput(lbl)}
                          style={{
                            flex: '1 1 auto', height: '38px', padding: '0 12px',
                            background: rpeLabelInput === lbl ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
                            color: rpeLabelInput === lbl ? 'var(--navy-950)' : 'var(--color-text)',
                            border: '1px solid var(--color-border)', borderRadius: '8px',
                            fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Hours of Sleep</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 600 }}>KEYBOARD / NUMPAD / QUICK SELECT</span>
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label="Hours of sleep"
                      placeholder="8.0"
                      value={sleepInput || ''}
                      onFocus={() => setFocusedField('sleep')}
                      onChange={(e) => setSleepInput(e.target.value.replace(/[^0-9.]/g, ''))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                      style={{ width: '100%', height: '56px', background: focusedField === 'sleep' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'sleep' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '0 16px', color: focusedField === 'sleep' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, outline: 'none', transition: 'all 0.2s' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {(settings.sleepQuickPicks || []).map(v => Number(v).toFixed(1)).map(val => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setSleepInput(val); setFocusedField('sleep'); }}
                          style={{
                            flex: '1 1 42px', minWidth: '42px', height: '38px',
                            background: sleepInput === val ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
                            color: sleepInput === val ? 'var(--navy-950)' : 'var(--color-text)',
                            border: '1px solid var(--color-border)', borderRadius: '8px',
                            fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                          }}
                        >
                          {val}h
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: KioskNumpad */}
              <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column' }}>
                <KioskNumpad
                  value={focusedField === 'weight' ? weightInput : (focusedField === 'rpe' ? rpeInput : (focusedField === 'rpe_duration' ? rpeDurationInput : sleepInput))}
                  onChange={val => focusedField === 'weight' ? setWeightInput(val) : (focusedField === 'rpe' ? setRpeInput(val) : (focusedField === 'rpe_duration' ? setRpeDurationInput(val) : setSleepInput(val)))}
                  onEnter={handleSave}
                />
              </div>
            </div>

            {/* Live Keypad Weight Delta Indicator */}
            {kioskTrackMode !== 'sleep_only' && weightInput && !isNaN(parseFloat(weightInput)) && parseFloat(weightInput) > 0 && (() => {
              let baseline = null;
              try {
                const customMap = getBaselinesMap(); // cached - this runs on every numpad keystroke
                if (customMap[selectedAthlete.id] && customMap[selectedAthlete.id].weight_lbs) baseline = parseFloat(customMap[selectedAthlete.id].weight_lbs);
                else if (selectedAthlete.baseline_weight) baseline = parseFloat(selectedAthlete.baseline_weight);
              } catch(e) {}
              if (!baseline) {
                const meta = parseAthleteMeta(selectedAthlete.position);
                if (meta.bw || meta.baseline_weight) baseline = parseFloat(meta.bw || meta.baseline_weight);
              }
              if (!baseline) return null;
              const currentWt = parseFloat(weightInput);
              const diff = currentWt - baseline;
              const diffPct = (diff / baseline) * 100;
              const isLoss = diff < 0;
              const isSignificantDrop = diff <= -settings.acuteDropLbs;
              const color = isLoss ? (isSignificantDrop ? '#ef4444' : '#f97316') : '#10b981';
              const bg = isLoss ? (isSignificantDrop ? 'rgba(239, 68, 68, 0.15)' : 'rgba(249, 115, 22, 0.15)') : 'rgba(16, 185, 129, 0.15)';
              const border = isLoss ? (isSignificantDrop ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(249, 115, 22, 0.4)') : '1px solid rgba(16, 185, 129, 0.4)';

              return (
                <div className="animate-slide-up" style={{ width: '100%', padding: '14px 18px', background: bg, border, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px', fontWeight: 800, color }}>
                    <span style={{ fontSize: '24px' }}>{isLoss ? (isSignificantDrop ? '⚠️' : '🔻') : '🟢'}</span>
                    <div>
                      <div style={{ textTransform: 'uppercase' }}>{diff >= 0 ? 'MASS GAIN / UPWARDS TREND' : (isSignificantDrop ? 'ALERT: SIGNIFICANT WEIGHT DROP DETECTED' : 'SLIGHT WEIGHT DROP vs BASELINE')}</div>
                      <div style={{ color: '#fff', fontSize: '16px', marginTop: '2px' }}>
                        Athlete is {diff >= 0 ? `+${diff.toFixed(1)}` : `${diff.toFixed(1)}`} lbs from baseline ({diff >= 0 ? `+${diffPct.toFixed(1)}` : `${diffPct.toFixed(1)}`}%)
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block', textTransform: 'uppercase' }}>Established Baseline</span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-accent)' }}>{baseline} lbs</span>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const athleteRecords = reportData.filter(r => r.athlete_id === selectedAthlete.id && r.weight_lbs && Number(r.weight_lbs) > 0).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
              const isFirstEntry = athleteRecords.length === 0;
              const hasLongGap = athleteRecords.length > 0 && (new Date() - new Date(athleteRecords[athleteRecords.length - 1].created_at)) > settings.baselineExpiryDays * 24 * 60 * 60 * 1000;
              const requiresBaseline = kioskTrackMode !== 'sleep_only' && (isFirstEntry || hasLongGap);

              // Numeric check: the old string comparison let "0" (typed via numpad) through
              // as a junk zero-weight record; also reject implausible giant values.
              const weightNum = parseFloat(weightInput);
              const disableSubmit = saving || (kioskTrackMode === 'sleep_only' ? (!sleepInput || parseFloat(sleepInput) <= 0) : (kioskTrackMode === 'rpe' ? (!rpeInput || parseFloat(rpeInput) <= 0 || parseFloat(rpeInput) > 10 || !rpeDurationInput || parseFloat(rpeDurationInput) <= 0 || !rpeLabelInput) : (!(weightNum > settings.minWeightLbs) || weightNum > settings.maxWeightLbs)));

              if (requiresBaseline) {
                return (
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px', width: '100%' }}>
                    <button
                      type="button"
                      onClick={() => handleSave(true)}
                      disabled={disableSubmit}
                      className="btn-primary glow-card"
                      style={{ flex: '1 1 220px', height: '56px', fontSize: '16px', background: '#10b981', color: '#000', border: 'none', fontWeight: 800 }}
                    >
                      {saving ? 'Saving...' : '🎯 This is my baseline'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSave(false)}
                      disabled={disableSubmit}
                      className="btn-primary"
                      style={{ flex: '1 1 200px', height: '56px', fontSize: '16px', background: 'transparent', border: '2px solid var(--color-border)', color: 'var(--white)' }}
                    >
                      {saving ? 'Saving...' : 'Save as regular entry'}
                    </button>
                  </div>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', marginTop: '4px' }}>
                  {isBaselineTestingMode && kioskTrackMode !== 'sleep_only' && (
                    <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.45)', padding: '10px 16px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '13px', fontWeight: 700 }}>
                      <span style={{ fontSize: '16px' }}>🎯</span> This entry will establish a NEW OFFICIAL BASELINE target for {selectedAthlete.name}.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleSave(isBaselineTestingMode)}
                    disabled={disableSubmit}
                    className="btn-primary glow-card"
                    style={{ height: '58px', fontSize: '18px', width: '100%', background: isBaselineTestingMode && kioskTrackMode !== 'sleep_only' ? '#10b981' : 'var(--color-accent)', color: isBaselineTestingMode && kioskTrackMode !== 'sleep_only' ? '#000' : 'var(--navy-950)', fontWeight: 800 }}
                  >
                    {saving ? 'Saving...' : (isBaselineTestingMode && kioskTrackMode === 'both' ? `🎯 Save as Athlete Baseline${weightInput ? ` (${weightInput} lbs)` : ''}` : (kioskTrackMode === 'sleep_only' ? 'Save Recovery Log & Complete' : (kioskTrackMode === 'rpe' ? 'Save RPE & Complete' : 'Save Record & Complete')))}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Pop-up Add Athlete Modal for Kiosk Mode */}
      {isAddingAthlete && screen === 'entry' && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10001,
            background: 'rgba(3, 8, 20, 0.85)',
            backdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflowY: 'auto'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddingAthlete(false);
          }}
        >
          <div
            className="card-glass glow-card animate-slide-up"
            style={{
              width: '100%',
              maxWidth: '560px',
              padding: '28px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              borderRadius: '24px',
              border: '1px solid rgba(194, 164, 80, 0.45)',
              boxShadow: '0 24px 70px rgba(0, 0, 0, 0.9)',
              maxHeight: '92vh',
              overflowY: 'auto',
              margin: 'auto'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(194, 164, 80, 0.15)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                  <User size={24} />
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', margin: 0, letterSpacing: '0.03em' }}>NEW ATHLETE PROFILE</h3>
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Enter details to add to roster and log weigh-in</span>
                </div>
              </div>
              <button
                onClick={() => setIsAddingAthlete(false)}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                title="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Form Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Full Name *</span>
                <input
                  type="text"
                  className="input-glass"
                  placeholder="e.g. Jordan Miller"
                  value={newAthlete.name}
                  onChange={e => setNewAthlete({...newAthlete, name: e.target.value})}
                  style={{ height: '48px', padding: '0 16px', fontSize: '16px', borderRadius: '10px', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Sport *</span>
                <select
                  value={newAthlete.sport || ''}
                  onChange={e => setNewAthlete({...newAthlete, sport: e.target.value})}
                  className="input-glass"
                  style={{ height: '48px', padding: '0 16px', fontSize: '15px', fontWeight: 600, color: 'var(--color-text)', borderRadius: '10px' }}
                >
                  <option value="" style={{ background: 'var(--navy-900)', color: 'var(--color-text-muted)' }}>Select a sport...</option>
                  {sportsList.map(sport => (
                    <option key={sport} value={sport} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{sport.toUpperCase()}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {sportsList.map(sport => (
                    <button
                      key={sport}
                      type="button"
                      onClick={() => setNewAthlete({ ...newAthlete, sport })}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: newAthlete.sport === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.12)',
                        background: newAthlete.sport === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.03)',
                        color: newAthlete.sport === sport ? 'var(--navy-950)' : 'var(--color-text-muted)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {sport}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ flex: '1 1 140px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Team / Group</span>
                  <input type="text" className="input-glass" placeholder="e.g. Varsity" value={newAthlete.team || ''} onChange={e => setNewAthlete({...newAthlete, team: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: '16px', borderRadius: '10px' }} />
                </div>
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Grade</span>
                  <input type="text" className="input-glass" placeholder="e.g. Freshman" value={newAthlete.grade || ''} onChange={e => setNewAthlete({...newAthlete, grade: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: '16px', borderRadius: '10px' }} />
                </div>
                <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Position</span>
                  <input type="text" className="input-glass" placeholder="e.g. WR / PG" value={newAthlete.position || ''} onChange={e => setNewAthlete({...newAthlete, position: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: '16px', borderRadius: '10px' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => setIsAddingAthlete(false)}
                className="btn-primary"
                style={{ flex: 1, height: '56px', fontSize: '16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--white)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAthlete}
                disabled={!newAthlete.name || saving}
                className="btn-primary glow-card"
                style={{ flex: 2, height: '56px', fontSize: '18px', background: 'var(--color-accent)', color: 'var(--navy-950)', fontWeight: 800, letterSpacing: '0.03em', boxShadow: '0 6px 20px rgba(194, 164, 80, 0.35)' }}
              >
                {saving ? 'Creating...' : 'Create & Log Weigh-In'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
