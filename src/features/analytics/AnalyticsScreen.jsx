import React from 'react';
import { TrendingUp, Activity, Target, Award, Zap, Lock, GitCompare, ChevronDown, ChevronUp } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { CustomTooltip } from '../../components/CustomTooltip';
import SpeedPowerPanel from './SpeedPowerPanel';
import PlyomatImportPanel from './PlyomatImportPanel';
import AthleteComparisonPanel from './AthleteComparisonPanel';
import { TEST_TYPES, TEST_TYPE_BY_KEY, UNTAGGED_VARIANT_LABEL } from './testVariants';
import {
  getCentralDateString, getAthleteBaseline,
  isRpeLog, hasWeight, hasSleep, isPostPracticeLog,
} from '../../utils/athleteData';

const RANGES = [
  { key: 30, label: '30 Days' },
  { key: 60, label: '60 Days' },
  { key: 90, label: '90 Days' },
];

// Every consumer of reportData has to say what kind of row it wants. An RPE row carries
// no weight and no sleep, a post-practice row is a sweat check rather than a weigh-in,
// and treating either as a morning weigh-in is the bug class that has already shipped
// three times (see docs/HANDOFF.md §5).
const isMorningWeighIn = (r) => hasWeight(r) && !isPostPracticeLog(r) && !isRpeLog(r);

export default function AnalyticsScreen({
  settings,
  athletes,
  reportData,
  setSelectedProfileId,
  fetchProfileData,
  setScreen,
  setProfileEntryScreen,
  performanceTests,
  addPerformanceTest,
  onPlyomatImport,
  plyomatLastSyncedAt,
  onPlyomatApiSync,
  onPlyomatSyncComplete,
  ensureReportWindow,
}) {
  const [rangeDays, setRangeDays] = React.useState(30);
  const [sportFilter, setSportFilter] = React.useState('ALL');
  const [view, setView] = React.useState('overview');

  // reportData is normally only fetched dataWindowDays back (a Settings value, 30 by
  // default). Picking 60/90 Days here used to render "trend" buckets for days the app
  // never actually loaded - they showed as gaps, which read as every athlete's history
  // sliding forward with nothing behind it. Ask App.jsx to widen the fetch instead.
  React.useEffect(() => {
    if (ensureReportWindow) ensureReportWindow(rangeDays);
  }, [rangeDays, ensureReportWindow]);

  // The sleep chart defaults collapsed - it's a detail view a coach opens on demand,
  // while its headline number lives in the KPI tile row up top (Recovery). Daily
  // Logging Compliance was removed outright, chart and top tile both - it wasn't
  // something coaches were checking day to day.
  const [sleepOpen, setSleepOpen] = React.useState(false);

  const sports = React.useMemo(
    () => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(),
    [athletes]
  );

  const roster = React.useMemo(
    () => (sportFilter === 'ALL' ? athletes : athletes.filter(a => (a.sport || 'General') === sportFilter)),
    [athletes, sportFilter]
  );

  // One pass over the log table produces every series on this screen. reportData is the
  // largest array the app holds, so it is walked once here rather than once per chart.
  const model = React.useMemo(() => {
    const rosterIds = new Set(roster.map(a => a.id));
    const cutoff = Date.now() - rangeDays * 864e5;

    const days = [];
    const byDay = new Map();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const key = getCentralDateString(new Date(Date.now() - i * 864e5));
      const bucket = { key, label: key.slice(5), weights: [], sleeps: [], load: 0, rpeCount: 0, loggedIds: new Set() };
      byDay.set(key, bucket);
      days.push(bucket);
    }

    const perAthlete = new Map();
    for (const r of reportData) {
      if (!r.athlete_id || !rosterIds.has(r.athlete_id)) continue;
      const t = new Date(r.created_at).getTime();
      if (!(t >= cutoff)) continue;

      const bucket = byDay.get(getCentralDateString(new Date(r.created_at)));
      let stats = perAthlete.get(r.athlete_id);
      if (!stats) { stats = { weights: [], load: 0, sessions: 0 }; perAthlete.set(r.athlete_id, stats); }

      if (isMorningWeighIn(r)) {
        const w = Number(r.weight_lbs);
        if (bucket) { bucket.weights.push(w); bucket.loggedIds.add(r.athlete_id); }
        stats.weights.push({ t, w });
      }
      if (hasSleep(r) && !isRpeLog(r)) {
        if (bucket) { bucket.sleeps.push(Number(r.sleep_hrs)); bucket.loggedIds.add(r.athlete_id); }
      }
      if (isRpeLog(r) && r.rpe != null) {
        // Session load is RPE x minutes when duration is tracked, RPE alone when it is
        // not - matching how the dashboard's acute:chronic alert scores it.
        const load = Number(r.rpe) * (settings.rpeTrackDuration ? (Number(r.session_minutes) || 0) : 1);
        if (bucket) { bucket.load += load; bucket.rpeCount += 1; }
        stats.load += load;
        stats.sessions += 1;
      }
    }

    const avg = (arr) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null);
    const trend = days.map(d => ({
      date: d.label,
      'Avg Weight': d.weights.length ? Number(avg(d.weights).toFixed(1)) : null,
      // How many athletes that day's average is actually built from - a recheck of a
      // handful of flagged athletes on an off-cycle day averages to a real number, but
      // one built from 2 athletes instead of the usual 40 can look like a spike with no
      // way to tell it's a small-sample day rather than a real team-wide shift.
      WeighedCount: d.weights.length,
      'Avg Sleep': d.sleeps.length ? Number(avg(d.sleeps).toFixed(2)) : null,
      'Session Load': d.load || null,
      Logged: d.loggedIds.size,
      Compliance: roster.length ? Math.round((d.loggedIds.size / roster.length) * 100) : 0,
    }));

    // Weight vs baseline. getAthleteBaseline is the canonical resolution used by Alerts
    // and Reports - reimplementing it here is what made the Trends counters disagree
    // with everything else before v4.12.0.
    const changes = [];
    for (const a of roster) {
      const stats = perAthlete.get(a.id);
      if (!stats || stats.weights.length === 0) continue;
      const base = getAthleteBaseline(a, reportData);
      if (!base || !base.weight_lbs) continue;
      const latest = stats.weights.reduce((m, x) => (x.t > m.t ? x : m));
      changes.push({
        id: a.id,
        name: a.name,
        sport: a.sport || 'General',
        baseline: Number(base.weight_lbs),
        current: latest.w,
        delta: Number((latest.w - Number(base.weight_lbs)).toFixed(1)),
      });
    }

    const loads = [...perAthlete.entries()]
      .filter(([, s]) => s.sessions > 0)
      .map(([id, s]) => {
        const a = roster.find(x => x.id === id);
        return {
          id,
          name: a ? a.name : 'Unknown',
          sport: a ? (a.sport || 'General') : 'General',
          load: Math.round(s.load),
          sessions: s.sessions,
        };
      })
      .sort((x, y) => y.load - x.load);

    const weighedDays = trend.filter(d => d['Avg Weight'] != null);
    const sleptDays = trend.filter(d => d['Avg Sleep'] != null);
    return {
      trend,
      gains: [...changes].sort((a, b) => b.delta - a.delta).slice(0, 5),
      losses: [...changes].sort((a, b) => a.delta - b.delta).slice(0, 5),
      loads: loads.slice(0, 8),
      totals: {
        athletes: roster.length,
        avgWeight: weighedDays.length ? (weighedDays.reduce((s, d) => s + d['Avg Weight'], 0) / weighedDays.length).toFixed(1) : null,
        avgSleep: sleptDays.length ? (sleptDays.reduce((s, d) => s + d['Avg Sleep'], 0) / sleptDays.length).toFixed(1) : null,
        totalLoad: Math.round(loads.reduce((s, l) => s + l.load, 0)),
      },
    };
  }, [reportData, roster, rangeDays, settings.rpeTrackDuration]);

  const openProfile = (id) => {
    setSelectedProfileId(id);
    if (fetchProfileData) fetchProfileData(id);
    if (setProfileEntryScreen) setProfileEntryScreen('analytics');
    setScreen('profiles');
  };

  const card = {
    padding: '24px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.10)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
    display: 'flex', flexDirection: 'column', gap: '16px',
  };
  const h3 = {
    fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 800, color: 'var(--white)',
    textTransform: 'uppercase', margin: 0, letterSpacing: '0.03em',
  };
  const eyebrow = (color) => ({
    fontSize: '11px', fontWeight: 800, color, letterSpacing: '0.1em',
    textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px',
  });
  const axis = { stroke: 'var(--color-text-muted)', fontSize: 11 };
  const grid = 'rgba(255,255,255,0.06)';

  const hasAnyWeight = model.trend.some(d => d['Avg Weight'] != null);
  const hasAnySleep = model.trend.some(d => d['Avg Sleep'] != null);
  const hasAnyLoad = model.trend.some(d => d['Session Load'] != null);

  const empty = (msg) => (
    <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>
      {msg}
    </div>
  );

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header + controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>WORKSPACE &middot; ANALYTICS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            PERFORMANCE ANALYTICS
          </h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
            {model.totals.athletes} athlete{model.totals.athletes !== 1 ? 's' : ''} &middot; last {rangeDays} days
            {sportFilter !== 'ALL' ? ` · ${sportFilter}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'compare', label: 'Compare', icon: <GitCompare size={13} /> },
            ].map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                style={{
                  padding: '7px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  fontWeight: 800, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px',
                  background: view === v.key ? 'var(--color-accent)' : 'transparent',
                  color: view === v.key ? 'var(--navy-950)' : 'var(--color-text-muted)',
                }}
              >
                {v.icon}{v.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Sport filter"
            value={sportFilter}
            onChange={e => setSportFilter(e.target.value)}
            className="input-glass"
            style={{ height: '38px', padding: '0 12px', fontSize: '13px', fontWeight: 700, borderRadius: '10px' }}
          >
            {/* Explicit option colors - same fix as EntryScreen's roster filters and
                SpeedPowerPanel below: a native <option> popup ignores .input-glass's dark
                background on most platforms, so light text on that light background is
                invisible until hover happens to add contrast. */}
            <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>All Sports</option>
            {sports.map(s => <option key={s} value={s} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{s}</option>)}
          </select>
          {view === 'overview' && (
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', padding: '3px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              {RANGES.map(r => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setRangeDays(r.key)}
                  style={{
                    padding: '7px 14px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                    fontWeight: 800, fontSize: '12px',
                    background: rangeDays === r.key ? 'var(--color-accent)' : 'transparent',
                    color: rangeDays === r.key ? 'var(--navy-950)' : 'var(--color-text-muted)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {view === 'compare' ? (
        settings.enableSpeedPower ? (
          <AthleteComparisonPanel
            athletes={athletes}
            performanceTests={performanceTests}
            sportFilter={sportFilter}
            card={card}
            h3={h3}
            eyebrow={eyebrow}
            grid={grid}
          />
        ) : (
          <div className="card-glass" style={{ ...card, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.015)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                <Lock size={20} />
              </div>
              <div>
                <span style={eyebrow('var(--color-text-muted)')}>ATHLETE COMPARISON</span>
                <h3 style={{ ...h3, color: 'var(--color-text-muted)' }}>NOT ENABLED</h3>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.5, maxWidth: '62ch' }}>
                  Comparing athletes over time needs Speed &amp; Power results to compare. Turn it on at
                  Settings → Program Configuration → SPEED &amp; POWER.
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
      <>
      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        {[
          { label: 'Avg Body Weight', value: model.totals.avgWeight != null ? `${model.totals.avgWeight} lbs` : '—', color: 'var(--color-accent)', icon: <TrendingUp size={14} /> },
          { label: 'Recovery (Avg Sleep)', value: model.totals.avgSleep != null ? `${model.totals.avgSleep} hrs` : '—', color: '#60a5fa', icon: <Activity size={14} /> },
          { label: 'Total Session Load', value: model.totals.totalLoad ? model.totals.totalLoad.toLocaleString() : '—', color: '#a78bfa', icon: <Target size={14} /> },
          { label: 'Athletes In View', value: String(model.totals.athletes), color: 'var(--white)', icon: <Award size={14} /> },
        ].map(s => (
          <div key={s.label} className="card-glass" style={{ padding: '18px 20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={eyebrow('var(--color-text-muted)')}>{s.icon} {s.label}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Body weight trend */}
      <div className="card-glass glow-card" style={card}>
        <div>
          <span style={eyebrow('var(--color-accent)')}><TrendingUp size={14} /> TEAM TREND</span>
          <h3 style={h3}>AVERAGE BODY WEIGHT</h3>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Morning weigh-ins only — post-practice sweat checks and RPE entries are excluded.
            Each point averages whoever weighed in that day, so an off-cycle recheck of
            just a few athletes can look like a spike — hover a point to see how many
            athletes it's actually built from.
          </div>
        </div>
        {hasAnyWeight ? (
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={model.trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsWeight" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axis} tickLine={false} axisLine={false} domain={['dataMin - 3', 'dataMax + 3']} width={48} />
                <RechartsTooltip content={<CustomTooltip units={{ 'Avg Weight': 'lbs' }} counts={{ 'Avg Weight': 'WeighedCount' }} />} />
                <Area type="monotone" dataKey="Avg Weight" connectNulls stroke="var(--color-accent)" strokeWidth={3} fill="url(#analyticsWeight)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : empty('No weigh-ins in this window.')}
      </div>

      {/* Team Speed & Power trend - same "average across the roster, per day" framing as
          Average Body Weight above, for whichever test type is picked. Gated behind
          Speed & Power the same way the leaderboard/comparison views are. */}
      {settings.enableSpeedPower && (
        <JumpTrendsPanel
          performanceTests={performanceTests}
          roster={roster}
          rangeDays={rangeDays}
          card={card}
          h3={h3}
          eyebrow={eyebrow}
          grid={grid}
          axis={axis}
          empty={empty}
        />
      )}

      {/* Sleep - collapsed by default, its headline number lives in the Recovery tile
          above. Daily Logging Compliance (chart + top tile) was removed. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        <div className="card-glass glow-card" style={card}>
          <button
            type="button"
            onClick={() => setSleepOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
          >
            <div>
              <span style={eyebrow('#60a5fa')}><Activity size={14} /> RECOVERY</span>
              <h3 style={h3}>AVERAGE SLEEP</h3>
            </div>
            {sleepOpen ? <ChevronUp size={18} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={18} style={{ color: 'var(--color-text-muted)' }} />}
          </button>
          {sleepOpen && (
            hasAnySleep ? (
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={model.trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 12]} width={40} unit="h" />
                    <RechartsTooltip content={<CustomTooltip units={{ 'Avg Sleep': 'hrs' }} />} />
                    <ReferenceLine
                      y={settings.sleepChartTargetHours}
                      stroke="rgba(184, 156, 91, 0.8)" strokeDasharray="4 4" strokeWidth={1.5}
                      label={{ value: `${Number(settings.sleepChartTargetHours).toFixed(1)}h Target`, position: 'insideTopLeft', fill: 'var(--color-accent)', fontSize: 11, fontWeight: 'bold' }}
                    />
                    <Bar dataKey="Avg Sleep" fill="#60a5fa" radius={[5, 5, 0, 0]} fillOpacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : empty('No sleep logged in this window.')
          )}
        </div>
      </div>

      {/* Session load over time - only meaningful with RPE on */}
      {settings.enableRpe && (
        <div className="card-glass glow-card" style={card}>
          <div>
            <span style={eyebrow('#a78bfa')}><Target size={14} /> INTERNAL LOAD</span>
            <h3 style={h3}>DAILY SESSION LOAD</h3>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {settings.rpeTrackDuration ? 'RPE × session minutes, summed across the roster.' : 'RPE summed across the roster (duration tracking is off).'}
            </div>
          </div>
          {hasAnyLoad ? (
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <AreaChart data={model.trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsLoad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                  <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={52} />
                  <RechartsTooltip content={<CustomTooltip units={{ 'Session Load': '' }} />} />
                  <Area type="monotone" dataKey="Session Load" connectNulls stroke="#a78bfa" strokeWidth={3} fill="url(#analyticsLoad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : empty('No RPE sessions logged in this window.')}
        </div>
      )}

      {/* Leaderboards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        <Leaderboard
          title="TOP WEIGHT GAINS"
          eyebrowText="VS BASELINE"
          color="#34d399"
          icon={<Award size={14} />}
          rows={model.gains}
          emptyMsg="No athlete has both a baseline and a recent weigh-in."
          onOpen={openProfile}
          render={(r) => ({
            primary: `${r.delta > 0 ? '+' : ''}${r.delta} lbs`,
            secondary: `${r.baseline} → ${r.current} lbs`,
            tone: r.delta >= 0 ? '#34d399' : '#f97316',
          })}
        />
        <Leaderboard
          title="LARGEST DROPS"
          eyebrowText="VS BASELINE"
          color="#f97316"
          icon={<TrendingUp size={14} />}
          rows={model.losses}
          emptyMsg="No athlete has both a baseline and a recent weigh-in."
          onOpen={openProfile}
          render={(r) => ({
            primary: `${r.delta > 0 ? '+' : ''}${r.delta} lbs`,
            secondary: `${r.baseline} → ${r.current} lbs`,
            tone: r.delta < 0 ? '#f97316' : '#34d399',
          })}
        />
      </div>

      {settings.enableRpe && (
        <Leaderboard
          title="HIGHEST TRAINING LOAD"
          eyebrowText="INTERNAL LOAD"
          color="#a78bfa"
          icon={<Zap size={14} />}
          rows={model.loads}
          emptyMsg="No RPE sessions logged in this window."
          onOpen={openProfile}
          render={(r) => ({
            primary: r.load.toLocaleString(),
            secondary: `${r.sessions} session${r.sessions !== 1 ? 's' : ''}`,
            tone: '#a78bfa',
          })}
        />
      )}

      {/* Speed & Power: opt-in, same as RPE. When off, or when the coach has never
          switched it on, don't imply the feature is missing - point at where to turn it
          on instead of rendering an empty board. */}
      {settings.enableSpeedPower ? (
        <>
          <SpeedPowerPanel
            athletes={athletes}
            sportFilter={sportFilter}
            openProfile={openProfile}
            card={card}
            h3={h3}
            eyebrow={eyebrow}
            grid={grid}
            performanceTests={performanceTests}
            addTest={addPerformanceTest}
          />
          <PlyomatImportPanel
            athletes={athletes}
            existingTests={performanceTests}
            onImport={onPlyomatImport}
            lastSyncedAt={plyomatLastSyncedAt}
            onApiSync={onPlyomatApiSync}
            onSyncComplete={onPlyomatSyncComplete}
            card={card}
            h3={h3}
            eyebrow={eyebrow}
            grid={grid}
          />
        </>
      ) : (
        <div className="card-glass" style={{ ...card, border: '1px dashed rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.015)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}>
              <Lock size={20} />
            </div>
            <div>
              <span style={eyebrow('var(--color-text-muted)')}>SPEED &amp; POWER</span>
              <h3 style={{ ...h3, color: 'var(--color-text-muted)' }}>NOT ENABLED</h3>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: 1.5, maxWidth: '62ch' }}>
                10yd fly and laser time testing, manually entered. Turn it on at
                Settings → Program Configuration → SPEED &amp; POWER. Plyomat CSV import is
                planned but not built yet.
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function Leaderboard({ title, eyebrowText, color, icon, rows, emptyMsg, render, onOpen }) {
  return (
    <div className="card-glass glow-card" data-testid="leaderboard" data-board={title} style={{ padding: '24px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', flexDirection: 'column', gap: '14px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
      <div>
        <span style={{ fontSize: '11px', fontWeight: 800, color, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {icon} {eyebrowText}
        </span>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', margin: '4px 0 0 0', letterSpacing: '0.03em' }}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>{emptyMsg}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map((r, i) => {
            const v = render(r);
            return (
              <div
                key={r.id}
                onClick={() => onOpen(r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
              >
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 800, color: 'var(--color-text-muted)', width: '22px', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--white)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{r.sport} · {v.secondary}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: v.tone, flexShrink: 0 }}>{v.primary}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Team average trend for a Speed & Power test type, day-bucketed the same way the body
// weight chart above is - one number per test day, averaged across whoever tested that
// day, rather than per-athlete lines (that's what the Compare tab is for). A jump type
// with more than one technique (vertical/board jump) needs a technique picked before
// plotting anything, same "don't silently mix two protocols" rule as the leaderboard and
// comparison panel - two techniques on one line would show a technique switch as team
// improvement or decline.
function JumpTrendsPanel({ performanceTests, roster, rangeDays, card, h3, eyebrow, grid, axis, empty }) {
  const [testType, setTestType] = React.useState(TEST_TYPES[0].key);
  const activeTest = TEST_TYPE_BY_KEY[testType] || TEST_TYPES[0];
  const needsVariantPicker = activeTest.variants.length > 1;
  const [variant, setVariant] = React.useState(activeTest.variants.length === 1 ? activeTest.variants[0].key : '');

  React.useEffect(() => {
    const tt = TEST_TYPE_BY_KEY[testType] || TEST_TYPES[0];
    setVariant(tt.variants.length === 1 ? tt.variants[0].key : '');
  }, [testType]);

  const rosterIds = React.useMemo(() => new Set(roster.map(a => a.id)), [roster]);

  const trend = React.useMemo(() => {
    const cutoff = Date.now() - rangeDays * 864e5;
    const byDay = new Map(); // date label -> [metric values]
    for (const t of performanceTests) {
      if (!t.athlete_id || !rosterIds.has(t.athlete_id)) continue;
      if (t.test_type !== testType) continue;
      if (needsVariantPicker && (t.test_variant || 'untagged') !== variant) continue;
      const time = new Date(t.created_at).getTime();
      if (isNaN(time) || time < cutoff) continue;
      const dayKey = getCentralDateString(new Date(t.created_at));
      if (!byDay.has(dayKey)) byDay.set(dayKey, []);
      byDay.get(dayKey).push(Number(t.metric));
    }
    const decimals = activeTest.unit === 'sec' ? 2 : 1;
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dayKey, values]) => ({
        date: dayKey.slice(5),
        Avg: Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(decimals)),
        Athletes: values.length,
      }));
  }, [performanceTests, rosterIds, testType, variant, needsVariantPicker, rangeDays, activeTest.unit]);

  const hasData = trend.length > 0;

  return (
    <div className="card-glass glow-card" style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={eyebrow('#fbbf24')}><Zap size={14} /> TEAM TREND</span>
          <h3 style={h3}>AVERAGE {activeTest.label.toUpperCase()}</h3>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            Team average on each test day — not a per-athlete line, that's Compare.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TEST_TYPES.map(tt => (
            <button
              key={tt.key}
              type="button"
              onClick={() => setTestType(tt.key)}
              style={{
                padding: '7px 14px', borderRadius: '10px', fontSize: '12px', fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.03em', cursor: 'pointer',
                border: testType === tt.key ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,0.12)',
                background: testType === tt.key ? 'rgba(251,191,36,0.15)' : 'transparent',
                color: testType === tt.key ? '#fbbf24' : 'var(--color-text-muted)',
              }}
            >
              {tt.label}
            </button>
          ))}
        </div>
      </div>

      {needsVariantPicker && (
        <select
          aria-label="Technique"
          value={variant}
          onChange={e => setVariant(e.target.value)}
          className="input-glass"
          style={{ height: '38px', padding: '0 12px', fontSize: '13px', fontWeight: 700, borderRadius: '10px', maxWidth: '320px' }}
        >
          <option value="" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>Select technique…</option>
          {activeTest.variants.map(v => (
            <option key={v.key} value={v.key} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{v.label}</option>
          ))}
          <option value="untagged" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{UNTAGGED_VARIANT_LABEL}</option>
        </select>
      )}

      {needsVariantPicker && !variant ? (
        empty(`Pick a technique above — ${activeTest.label} results differ by protocol.`)
      ) : hasData ? (
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="jumpTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.45} />
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
              <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={axis} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} width={48} unit={activeTest.unit === 'sec' ? 's' : '"'} />
              <RechartsTooltip content={<CustomTooltip units={{ Avg: activeTest.unit === 'sec' ? 'sec' : 'in' }} />} />
              <Area type="monotone" dataKey="Avg" connectNulls stroke="#fbbf24" strokeWidth={3} fill="url(#jumpTrendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : empty(`No ${activeTest.label} results logged in this window.`)}
    </div>
  );
}
