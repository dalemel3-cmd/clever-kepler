import React from 'react';
import { Search, X, Plus, Minus, CheckCircle, User } from 'lucide-react';
import { KioskNumpad } from '../../components/KioskNumpad';
import { parseAthleteMeta, getBaselinesMap, getSportColor } from '../../utils/athleteData';
import AthleteCard from './AthleteCard';

export default function EntryScreen({
  settings,
  kioskTrackMode,
  setKioskTrackMode,
  isBaselineTestingMode,
  setIsBaselineTestingMode,
  setIsAddingAthlete,
  setEditingAthleteId,
  setNewAthlete,
  athletesRecordedToday,
  search,
  setSearch,
  sportsList,
  filteredAthletes,
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
  //
  // Memoized: this filtered the entire weigh-in table and sorted the matches on every
  // render, including every keystroke on the weight and sleep inputs. At 1,340 rows that
  // is a full scan plus a Date-parsing sort per character typed, which is what made the
  // kiosk modal feel sticky on an iPad. Only the open athlete and the data itself can
  // change the answer.
  const selectedAthleteId = selectedAthlete ? selectedAthlete.id : null;
  const lastLoggedWeight = React.useMemo(() => {
    if (!selectedAthleteId) return null;
    // A single reduce beats filter+sort: one pass, and it parses a Date only for rows
    // that are actually candidates rather than for every row in the table.
    let best = null;
    for (const r of reportData) {
      if (r.athlete_id !== selectedAthleteId || !(Number(r.weight_lbs) > 0)) continue;
      if (!best || new Date(r.created_at) > new Date(best.created_at)) best = r;
    }
    return best ? parseFloat(best.weight_lbs) : null;
  }, [selectedAthleteId, reportData]);

  // Kiosk-local UI state: the search box lives behind an icon until tapped open, and the
  // sport-pill row filters this screen only - it deliberately does NOT touch the shared
  // selectedSportFilter that AthletesScreen/ProfilesScreen read, so switching sports on
  // Quick Entry never surprises a coach who left another screen filtered differently.
  const [searchOverlayOpen, setSearchOverlayOpen] = React.useState(false);
  const [localSportFilter, setLocalSportFilter] = React.useState('All');

  const closeSearchOverlay = () => {
    setSearch('');
    setSearchOverlayOpen(false);
  };

  // Groups the roster into one section per sport, in sportsList's canonical order (not
  // Map insertion order) so sections don't reshuffle as async data resolves. Applies the
  // unweighed-only filter and the local sport-pill filter once, here, instead of the old
  // code's two separate copies of the same .filter() call (one per rendering branch).
  const groupedAthletes = React.useMemo(() => {
    const base = unweighedOnlyFilter ? filteredAthletes.filter(a => !athletesRecordedToday.has(a.id)) : filteredAthletes;
    const bySport = new Map();
    for (const a of base) {
      const key = a.sport || 'General';
      if (localSportFilter !== 'All' && key !== localSportFilter) continue;
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key).push(a);
    }
    return sportsList.filter(s => bySport.has(s)).map(s => ({ sport: s, athletes: bySport.get(s) }));
  }, [filteredAthletes, unweighedOnlyFilter, athletesRecordedToday, localSportFilter, sportsList]);
  const totalVisibleCount = groupedAthletes.reduce((sum, g) => sum + g.athletes.length, 0);

  return (
    <main className="relative pt-16 w-full px-6 bg-[#030a14] min-h-screen overflow-y-auto">
      <div className="flex flex-col w-full pb-20">
        {/* Top Command & Kiosk HUD Bar */}
        <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 mb-6 mt-6">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 font-label-md text-xs uppercase tracking-wider text-[#bcc1ca]">
              <span className="text-[#b89c5b] font-bold">KIOSK MODE</span>
              <span className="material-symbols-outlined text-sm">chevron_right</span>
              <span className="text-white font-semibold">
                {kioskTrackMode === 'sleep_only' ? 'SLEEP & RECOVERY ONLY' : (kioskTrackMode === 'rpe' ? 'SESSION RPE ONLY' : 'RAPID WEIGH-IN & SLEEP ENTRY')}
              </span>
            </div>
            <h1 className="font-display text-4xl uppercase tracking-tight text-white m-0 leading-none">
              RAPID QUICK ENTRY KIOSK
            </h1>
            <p className="font-body-md text-sm text-[#bcc1ca] m-0 max-w-2xl">
              Tap an athlete card to log today's weigh-in or session.
            </p>
          </div>
          
          {/* Mode Selectors & Quick Action Hub */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-[#0a1120] border border-[#2a313d] p-1 rounded-xl shadow-md">
              <button 
                className={`mode-btn flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-headline-md text-sm uppercase transition-all ${kioskTrackMode === 'both' ? 'bg-[#b89c5b] text-[#030a14] font-bold shadow-sm' : 'text-[#bcc1ca] hover:text-white'}`}
                onClick={() => {
                  setKioskTrackMode('both');
                  try { localStorage.setItem('shiloh_kiosk_track_mode', 'both'); } catch(e) {}
                  setFocusedField('weight');
                }}
              >
                <span className="material-symbols-outlined text-base">scale</span>
                <span>Weight + Sleep</span>
              </button>
              <button 
                className={`mode-btn flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-headline-md text-sm uppercase transition-all ${kioskTrackMode === 'sleep_only' ? 'bg-[#b89c5b] text-[#030a14] font-bold shadow-sm' : 'text-[#bcc1ca] hover:text-white'}`}
                onClick={() => {
                  setKioskTrackMode('sleep_only');
                  try { localStorage.setItem('shiloh_kiosk_track_mode', 'sleep_only'); } catch(e) {}
                  setFocusedField('sleep');
                }}
              >
                <span className="material-symbols-outlined text-base">bedtime</span>
                <span>Sleep Only</span>
              </button>
              {settings?.enableRpe && (
                <button 
                  className={`mode-btn flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-headline-md text-sm uppercase transition-all ${kioskTrackMode === 'rpe' ? 'bg-[#b89c5b] text-[#030a14] font-bold shadow-sm' : 'text-[#bcc1ca] hover:text-white'}`}
                  onClick={() => {
                    setKioskTrackMode('rpe');
                    setFocusedField('rpe');
                    try { localStorage.setItem('shiloh_kiosk_track_mode', 'rpe'); } catch(e) {}
                  }}
                >
                  <span className="material-symbols-outlined text-base">speed</span>
                  <span>Session RPE</span>
                </button>
              )}
            </div>
            <button 
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#2a313d] font-headline-md text-sm uppercase transition-colors shadow-sm ${isBaselineTestingMode ? 'bg-[#d1b87a] text-[#061c41]' : 'bg-[#061c41] hover:bg-[#0a1120] text-[#d1b87a]'}`}
              onClick={() => setIsBaselineTestingMode(!isBaselineTestingMode)}
            >
              <span className="material-symbols-outlined text-base">tune</span>
              <span>Baseline Mode (PIN)</span>
            </button>
            <button 
              onClick={() => {
                setIsAddingAthlete(true);
                setEditingAthleteId(null);
                setNewAthlete({ name: '', sport: localSportFilter !== 'All' ? localSportFilter : '', team: '', grade: '', position: '' });
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#b89c5b] text-[#030a14] font-headline-md text-sm uppercase font-bold tracking-wider transition-all hover:bg-[#d1b87a] shadow-md active:scale-95"
            >
              <span className="material-symbols-outlined text-base font-bold">person_add</span>
              <span>+ Add Guest / Trial</span>
            </button>
          </div>
        </div>

        {/* Status & Throughput Ticker Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
          <div className="md:col-span-4 bg-[#0a1120] border border-[#2a313d] p-4 rounded-xl flex items-center justify-between shadow-md">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-[#061c41] border border-[#2a313d]">
                <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                  <path className="text-[#2a313d]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" />
                  <path className="text-[#34d399]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeDasharray={`${filteredAthletes.length > 0 ? (athletesRecordedToday.size / filteredAthletes.length) * 100 : 0}, 100`} strokeLinecap="round" strokeWidth="3.5" />
                </svg>
                <span className="material-symbols-outlined text-[#34d399] absolute text-base">check_circle</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-md text-base text-white tracking-wide">{athletesRecordedToday.size} OF {filteredAthletes.length} CHECKED IN</span>
                  {filteredAthletes.length > 0 && (
                    <span className="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-[#34d399]/20 text-[#34d399] font-bold border border-[#34d399]/40">{Math.round((athletesRecordedToday.size / filteredAthletes.length) * 100)}%</span>
                  )}
                </div>
                <span className="font-body-sm text-xs text-[#bcc1ca]">Daily Operations · {filteredAthletes.length - athletesRecordedToday.size} athletes pending</span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#bcc1ca] text-xl">contactless</span>
          </div>
          <div className="md:col-span-5 bg-[#0a1120] border border-[#2a313d] p-4 rounded-xl flex items-center justify-between shadow-md">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#061c41] border border-[#2a313d] flex items-center justify-center text-[#b89c5b]">
                <span className="material-symbols-outlined text-2xl">scale</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-headline-md text-base text-white tracking-wide">DIGITAL SCALE RACK #02</span>
                  <span className="flex items-center gap-1 text-[#34d399] font-label-sm text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]"></span> 0.00 LBS TARE
                  </span>
                </div>
                <span className="font-body-sm text-xs text-[#bcc1ca]">Rice Lake Telemetry Link · Auto-capture on steady state</span>
              </div>
            </div>
          </div>
          <div className="md:col-span-3 bg-[#0a1120] border border-[#2a313d] p-4 rounded-xl flex items-center gap-2 justify-between shadow-md">
            <div className="flex flex-col">
              <span className="font-label-md text-xs uppercase text-white font-bold tracking-wider">Touch Navigation</span>
              <span className="font-body-sm text-xs text-[#bcc1ca]">Tap name for manual pop-up keypad</span>
            </div>
            <div className="flex items-center gap-1 bg-[#061c41] border border-[#2a313d] px-2 py-1 rounded text-white font-label-md text-xs">
              <kbd className="text-[#b89c5b] font-bold">1-TAP</kbd>
            </div>
          </div>
        </div>

        {/* Filter & Navigation Control Strip */}
        <div className="bg-[#0a1120] border border-[#2a313d] rounded-xl p-4 mb-6 flex flex-col gap-4 shadow-md">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-xl">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#bcc1ca] text-lg">search</span>
              <input
                className="w-full pl-10 pr-4 py-2 bg-[#061c41] border border-[#2a313d] rounded-lg text-white font-body-md text-sm placeholder:text-[#bcc1ca] focus:outline-none focus:border-[#b89c5b] transition-colors"
                id="athlete-search"
                title="Search athletes"
                placeholder="Tap to search or swipe alphabetical rail..."
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-[#bcc1ca] hover:text-white" onClick={closeSearchOverlay}>
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-4 self-end lg:self-auto">
              <div className="flex items-center gap-1 font-label-sm text-xs text-[#bcc1ca] uppercase tracking-widest font-semibold">
                <span>SORT BY:</span>
              </div>
              <div className="flex items-center bg-[#061c41] border border-[#2a313d] p-0.5 rounded-lg">
                <button 
                  className={`px-3 py-1 rounded font-label-md text-xs uppercase ${nameSortOrder === 'first' ? 'bg-[#b89c5b] text-[#030a14] font-bold' : 'text-[#bcc1ca] hover:text-white font-medium'}`}
                  onClick={() => setNameSortOrder('first')}
                >First Name</button>
                <button 
                  className={`px-3 py-1 rounded font-label-md text-xs uppercase ${nameSortOrder === 'last' ? 'bg-[#b89c5b] text-[#030a14] font-bold' : 'text-[#bcc1ca] hover:text-white font-medium'}`}
                  onClick={() => setNameSortOrder('last')}
                >Last Name</button>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {['All', ...sportsList].map(sport => (
              <button
                key={sport}
                onClick={() => setLocalSportFilter(sport)}
                className={`sport-filter px-4 py-1.5 rounded-lg font-headline-md text-sm uppercase tracking-wide whitespace-nowrap ${localSportFilter === sport ? 'bg-[#b89c5b] text-[#030a14] font-bold shadow-sm' : 'bg-[#061c41] hover:bg-[#030a14] border border-[#2a313d] text-[#bcc1ca]'}`}
              >
                {sport === 'All' ? 'All Roster' : sport}
              </button>
            ))}
          </div>
        </div>

        {/* Main Interaction Area */}
        <div className="relative flex items-start gap-4">
          <div className="flex-1">
            {groupedAthletes.map(({ sport, athletes: sportAthletes }) => {
              const loggedCount = sportAthletes.filter(a => athletesRecordedToday.has(a.id)).length;
              return (
                <div key={sport} className="mb-6">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="font-headline-md text-base text-[#b89c5b] uppercase font-bold tracking-wider">{sport} SQUAD</span>
                    </div>
                    <span className="font-label-md text-xs text-[#bcc1ca]">{loggedCount} of {sportAthletes.length} Checked In</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="athletes-grid">
                    {sportAthletes.map(a => {
                      const safeName = (a.name && String(a.name).trim()) || 'Unnamed Athlete';
                      return (
                        <AthleteCard
                          key={a.id}
                          athleteId={a.id}
                          name={safeName}
                          sport={a.sport}
                          displayName={nameSortOrder === 'last' ? `${getLastName(safeName)}, ${getFirstName(safeName)}` : safeName}
                          initials={nameSortOrder === 'last'
                            ? `${getLastName(safeName)[0] || ''}${getFirstName(safeName)[0] || ''}`
                            : safeName.split(' ').map(n => n[0]).join('')}
                          isSelected={entryAthleteId === a.id}
                          isDoneToday={athletesRecordedToday.has(a.id)}
                          onSelect={handleSelectAthleteForEntry}
                          position={a.position || ''}
                          grade={a.grade || ''}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
            
            {totalVisibleCount === 0 && (
              <div className="text-center p-8 bg-[#0a1120] border border-[#2a313d] rounded-xl flex flex-col items-center gap-4">
                <span className="text-[#bcc1ca]">Athlete Not Found in Roster?</span>
                <button
                  onClick={() => {
                    setIsAddingAthlete(true);
                    setEditingAthleteId(null);
                    setNewAthlete({ name: search || '', sport: localSportFilter !== 'All' ? localSportFilter : '', team: '', grade: '', position: '' });
                  }}
                  className="px-6 py-3 bg-[#b89c5b] text-[#030a14] font-headline-md font-bold uppercase rounded-xl flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">add</span>
                  Add {search ? `"${search}"` : 'New Athlete'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal replacing old modal logic */}
        {entryAthleteId && selectedAthlete && (
          <div className="fixed inset-0 bg-[#030a14]/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-[#0a1120] border border-[#2a313d] rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="bg-[#061c41] border-b border-[#2a313d] p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#b89c5b] text-[#030a14] flex items-center justify-center font-headline-lg text-lg font-bold">
                    {selectedAthlete.name.split(' ').map(n=>n[0]).join('')}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-headline-lg text-xl text-white font-bold">{selectedAthlete.name}</span>
                    <span className="font-body-sm text-xs text-[#bcc1ca]">
                      {selectedAthlete.sport} {selectedAthlete.position ? `· ${selectedAthlete.position}` : ''}
                    </span>
                  </div>
                </div>
                <button className="w-10 h-10 rounded-full bg-[#0a1120] hover:bg-[#030a14] border border-[#2a313d] text-white flex items-center justify-center" onClick={() => setEntryAthleteId(null)}>
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
              
              {/* Form Content */}
              <div className="p-6 flex flex-col gap-4 overflow-y-auto">
              <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex flex-col gap-4 flex-1 min-w-0">
                {kioskTrackMode === 'both' && (
                  <div className="flex items-center justify-between bg-[#030a14] border border-[#2a313d] p-4 rounded-xl">
                    <div className="flex flex-col w-full">
                      <span className="font-label-sm text-xs uppercase text-[#b89c5b] font-bold">LIVE METRIC CAPTURE (LBS)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Body weight (lbs)"
                        className="font-display text-4xl text-white tracking-wider font-bold bg-transparent border-none outline-none w-full mt-1"
                        placeholder={lastLoggedWeight ? String(lastLoggedWeight) : '0.0'}
                        value={weightInput || ''}
                        onChange={(e) => setWeightInput(e.target.value.replace(/[^0-9.]/g, ''))}
                        onFocus={() => setFocusedField('weight')}
                      />
                    </div>
                  </div>
                )}
                
                {kioskTrackMode === 'sleep_only' || kioskTrackMode === 'both' ? (
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="font-label-sm text-xs uppercase text-[#bcc1ca] tracking-wider font-semibold">Last Night Sleep Duration (Hours)</span>
                    <div className="grid grid-cols-5 gap-1">
                      {(settings.sleepQuickPicks || [6.0, 7.0, 8.0, 8.5, 9.0]).map(v => Number(v).toFixed(1)).map(val => (
                        <button
                          key={val}
                          type="button"
                          className={`py-2 rounded-lg font-headline-md text-sm ${sleepInput === val ? 'bg-[#b89c5b] text-[#030a14] font-bold border border-[#b89c5b]' : 'bg-[#061c41] border border-[#2a313d] text-white hover:bg-[#030a14]'}`}
                          onClick={() => { setSleepInput(val); setFocusedField('sleep'); }}
                        >
                          {val}h
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {kioskTrackMode === 'rpe' && (
                  <>
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="font-label-sm text-xs uppercase text-[#bcc1ca] tracking-wider font-semibold">Session RPE (1-{settings.rpeScaleMax || 10})</span>
                      <input 
                        type="text"
                        inputMode="decimal"
                        className="font-display text-2xl text-white tracking-wider font-bold bg-[#030a14] border border-[#2a313d] rounded-xl p-3 outline-none"
                        placeholder="e.g. 7"
                        value={rpeInput || ''}
                        onChange={(e) => setRpeInput(e.target.value.replace(/[^0-9]/g, ''))}
                        onFocus={() => setFocusedField('rpe')}
                      />
                    </div>
                    {settings?.rpeTrackDuration && (
                      <div className="flex flex-col gap-1 mt-2">
                        <span className="font-label-sm text-xs uppercase text-[#bcc1ca] tracking-wider font-semibold">Duration (Minutes)</span>
                        <div className="grid grid-cols-4 gap-1">
                          {(settings.rpeDurationQuickPicks || [15, 30, 45, 60]).map(v => String(v)).map(val => (
                            <button
                              key={val}
                              type="button"
                              className={`py-2 rounded-lg font-headline-md text-sm ${rpeDurationInput === val ? 'bg-[#b89c5b] text-[#030a14] font-bold border border-[#b89c5b]' : 'bg-[#061c41] border border-[#2a313d] text-white hover:bg-[#030a14]'}`}
                              onClick={() => { setRpeDurationInput(val); setFocusedField('rpe_duration'); }}
                            >
                              {val}m
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col gap-1 mt-2">
                      <span className="font-label-sm text-xs uppercase text-[#bcc1ca] tracking-wider font-semibold">Session Label</span>
                      <div className="flex flex-wrap gap-1">
                        {(settings.rpeSessionLabels || []).map(lbl => (
                          <button
                            key={lbl}
                            type="button"
                            className={`flex-1 min-w-[64px] py-2 px-3 rounded-lg font-headline-md text-sm ${rpeLabelInput === lbl ? 'bg-[#b89c5b] text-[#030a14] font-bold border border-[#b89c5b]' : 'bg-[#061c41] border border-[#2a313d] text-white hover:bg-[#030a14]'}`}
                            onClick={() => setRpeLabelInput(lbl)}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

                <div className="sm:w-64 flex-shrink-0">
                  <KioskNumpad
                    value={focusedField === 'weight' ? weightInput : (focusedField === 'rpe' ? rpeInput : (focusedField === 'rpe_duration' ? rpeDurationInput : sleepInput))}
                    onChange={val => focusedField === 'weight' ? setWeightInput(val) : (focusedField === 'rpe' ? setRpeInput(String(val).replace(/[^0-9]/g, '')) : (focusedField === 'rpe_duration' ? setRpeDurationInput(String(val).replace(/[^0-9]/g, '')) : setSleepInput(val)))}
                    onEnter={handleSave}
                  />
                </div>
              </div>

                <button
                  className="w-full py-3 mt-2 rounded-xl bg-[#b89c5b] hover:bg-[#d1b87a] text-[#030a14] font-headline-lg text-base uppercase tracking-wider font-bold flex items-center justify-center gap-2 shadow-xl active:scale-[0.98] transition-transform"
                  onClick={() => handleSave(isBaselineTestingMode && kioskTrackMode === 'both')}
                  disabled={saving}
                >
                  <span className="material-symbols-outlined font-bold">done_all</span>
                  <span>{saving ? 'SAVING...' : 'CONFIRM & SYNC ATHLETE'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
