import { Search, X, Plus, ChevronLeft } from 'lucide-react';
import { isPostPracticeLog } from '../../utils/athleteData';

export default function RosterScreen({
  isAddingAthlete,
  filteredAthletes,
  search,
  setSearch,
  sportsList,
  selectedSportFilter,
  setSelectedSportFilter,
  setIsAddingAthlete,
  setEditingAthleteId,
  newAthlete,
  setNewAthlete,
  reportData,
  setSelectedProfileId,
  fetchProfileData,
  setScreen,
  editingAthleteId,
  handleUpdateAthlete,
  handleCreateAthlete,
  saving,
  handleDeleteAthlete
}) {
  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {!isAddingAthlete && (
        <button
          onClick={() => setScreen('groups')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', background: 'transparent', border: 'none', padding: 0, fontSize: '13px', fontWeight: 700, cursor: 'pointer', width: 'fit-content' }}
        >
          <ChevronLeft size={16} /> BACK TO SPORT GROUPS
        </button>
      )}
      
      {!isAddingAthlete && (
        <>
          {/* Roster Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '4px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>ATHLETE ROSTER</h2>
              <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{filteredAthletes.length} athlete{filteredAthletes.length !== 1 ? 's' : ''}</span>
            </div>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </span>
          </div>

          {/* Search + Sport Pill Filters */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '0 1 240px', display: 'flex', alignItems: 'center' }}>
              <Search size={16} style={{ position: 'absolute', left: '14px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="input-glass"
                placeholder="Search athletes..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, height: '44px', padding: '0 36px 0 40px', fontSize: '14px' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: '12px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['ALL', ...sportsList].map(sport => (
                <button
                  key={sport}
                  onClick={() => setSelectedSportFilter(sport)}
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '20px',
                    border: selectedSportFilter === sport ? '2px solid var(--color-accent)' : '1px solid var(--navy-600)',
                    background: selectedSportFilter === sport ? 'var(--color-accent)' : 'transparent',
                    color: selectedSportFilter === sport ? 'var(--navy-900)' : 'var(--color-text)',
                    fontFamily: 'var(--font-display)',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textTransform: 'capitalize',
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {sport === 'ALL' ? 'All' : sport}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons Row */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => { setIsAddingAthlete(true); setEditingAthleteId(null); setNewAthlete({ name: '', sport: '', team: '', grade: '', position: '' }); }}
              className="btn-primary no-print glow-card"
              style={{ height: '40px', padding: '0 20px', fontSize: '13px', fontWeight: 700, flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-accent)', color: 'var(--navy-950)', border: '1px solid var(--color-accent)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 16px rgba(194, 164, 80, 0.3)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 24px rgba(194, 164, 80, 0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(194, 164, 80, 0.3)'; }}
            >
              <Plus size={18} strokeWidth={2.5} /> Add Athlete
            </button>
          </div>

          {/* Card Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
            {filteredAthletes.map(a => {
              // Find latest weigh-in and recovery logs for this athlete from reportData.
              // Match by id (name matching mixed up same-named athletes and orphaned
              // history after a rename); fall back to name only for legacy id-less logs.
              const athleteLogs = reportData.filter(r => r.athlete_id === a.id || (!r.athlete_id && r.athlete_name === a.name)).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
              const weightLogs = athleteLogs.filter(r => r.weight_lbs && Number(r.weight_lbs) > 0 && !isPostPracticeLog(r));
              const latestLog = athleteLogs[0];
              const latestWeightLog = weightLogs[0];
              const prevWeightLog = weightLogs[1];
              const latestWeight = latestWeightLog ? latestWeightLog.weight_lbs : null;
              const weightDelta = (latestWeightLog && prevWeightLog) ? (latestWeightLog.weight_lbs - prevWeightLog.weight_lbs) : null;
              const lastLoggedDate = latestLog ? new Date(latestLog.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;

              // Deterministic avatar color based on name
              const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
              const colorIdx = a.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length;
              const avatarBg = avatarColors[colorIdx];

              return (
                <div
                  key={a.id}
                  onClick={() => { setSelectedProfileId(a.id); fetchProfileData(a.id); setScreen('profiles'); }}
                  className="card-glass glow-card"
                  style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '18px 20px', cursor: 'pointer', minHeight: '88px' }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: avatarBg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: '16px', fontFamily: 'var(--font-display)',
                    flexShrink: 0, letterSpacing: '0.02em'
                  }}>
                    {a.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.name}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {a.sport && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                          background: 'var(--navy-700)', color: 'var(--color-text)', textTransform: 'capitalize',
                          letterSpacing: '0.02em'
                        }}>{a.sport}</span>
                      )}
                      {a.team && (
                        <span style={{
                          fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                          background: 'var(--navy-700)', color: 'var(--color-text)', textTransform: 'capitalize',
                          letterSpacing: '0.02em'
                        }}>{a.team}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.position || ''}{a.position && lastLoggedDate ? ' · ' : ''}{lastLoggedDate ? `Last logged ${lastLoggedDate}` : (a.position ? '' : 'No logs yet')}
                    </span>
                  </div>

                  {/* Weight + Delta or Sleep Only */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    {latestWeight != null ? (
                      <>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                          {latestWeight} <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-muted)' }}>lb</span>
                        </span>
                        {weightDelta != null && (
                          <span style={{
                            fontSize: '12px', fontWeight: 600,
                            color: weightDelta > 0 ? 'var(--status-success)' : weightDelta < 0 ? 'var(--status-error)' : 'var(--color-text-muted)'
                          }}>
                            {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)} lb
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)', padding: '5px 12px', borderRadius: '12px', whiteSpace: 'nowrap' }}>
                        {athleteLogs.length > 0 && athleteLogs[0].sleep_hrs ? `😴 ${athleteLogs[0].sleep_hrs} hrs (Sleep Only)` : '--'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Add Athlete button relocated to header action row to prevent overlapping filter pills */}
        </>
      )}

      {isAddingAthlete && (
        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div onClick={() => { setIsAddingAthlete(false); if(editingAthleteId) { setSelectedProfileId(editingAthleteId); setScreen('profiles'); } }} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
            <ChevronLeft size={16} /> Back
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Full Name</span>
            <input type="text" className="input-glass" placeholder="e.g. John Doe" value={newAthlete.name} onChange={e => setNewAthlete({...newAthlete, name: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-sm)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Sport</span>
            <input type="text" list="sports-datalist" className="input-glass" placeholder="e.g. Football or choose from tags below" value={newAthlete.sport} onChange={e => setNewAthlete({...newAthlete, sport: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-sm)' }} />
            <datalist id="sports-datalist">
              {sportsList.map(s => <option key={s} value={s} />)}
            </datalist>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
              {sportsList.map(sport => (
                <button
                  key={sport}
                  type="button"
                  onClick={() => setNewAthlete({ ...newAthlete, sport })}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '20px',
                    border: newAthlete.sport === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                    background: newAthlete.sport === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.03)',
                    color: newAthlete.sport === sport ? 'var(--navy-950)' : 'var(--color-text-muted)',
                    fontSize: '11px',
                    fontWeight: 600,
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
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Team</span>
              <input type="text" className="input-glass" placeholder="e.g. Varsity" value={newAthlete.team} onChange={e => setNewAthlete({...newAthlete, team: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: '16px' }} />
            </div>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Grade</span>
              <input type="text" className="input-glass" placeholder="e.g. 10th" value={newAthlete.grade} onChange={e => setNewAthlete({...newAthlete, grade: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: '16px' }} />
            </div>
            <div style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Position</span>
              <input type="text" className="input-glass" placeholder="e.g. WR" value={newAthlete.position} onChange={e => setNewAthlete({...newAthlete, position: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: '16px' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <button
              onClick={editingAthleteId ? handleUpdateAthlete : handleCreateAthlete}
              disabled={!newAthlete.name || saving}
              className="btn-primary"
              style={{ height: '56px', fontSize: '18px' }}
            >
              {saving ? 'Saving...' : (editingAthleteId ? 'Save Changes' : 'Create Athlete')}
            </button>

            {editingAthleteId && (
              <button
                onClick={handleDeleteAthlete}
                disabled={saving}
                style={{ height: '56px', background: 'transparent', color: 'var(--status-error)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              >
                Delete Athlete
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
