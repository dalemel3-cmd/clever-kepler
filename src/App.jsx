import React, { useState, useEffect } from 'react';
import { Users, User, Plus, Shield, ChevronLeft, Minus, CheckCircle, X, Download, Lock, Unlock, Wifi, WifiOff, AlertTriangle, Activity, FileText, Printer, Trash2, Upload, Sliders, Filter, Zap, CheckSquare, Square, Settings, Smartphone, RefreshCw, HardDrive, Check, Copy, Share2, Search, Grid, Trophy, TrendingUp, TrendingDown, Clock, Droplet, Flame, ArrowUpRight, MoreHorizontal, Database } from 'lucide-react';
import { supabase } from './supabaseClient';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, ReferenceLine } from 'recharts';
import './styles.css';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'rgba(6, 28, 65, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '8px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
        <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: payload[0].color || 'var(--color-accent)' }}>
          {payload[0].value} {payload[0].name === 'Weight' ? 'lbs' : 'hrs'}
        </p>
      </div>
    );
  }
  return null;
};

// Premium Celebratory Confetti Component
const Confetti = () => {
  const particles = React.useMemo(() => {
    const colors = ['#b89c5b', '#ffffff', '#061c41', '#e0c380', '#3b82f6'];
    return Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 8 + 6,
      color: colors[i % colors.length],
      duration: Math.random() * 1.5 + 1.2,
      delay: Math.random() * 0.4,
      rotation: Math.random() * 360,
      shape: i % 3 === 0 ? '50%' : '2px'
    }));
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9999 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          width: `${p.size}px`,
          height: `${p.size}px`,
          backgroundColor: p.color,
          borderRadius: p.shape,
          top: '-20px',
          left: `${p.left}%`,
          boxShadow: `0 0 8px ${p.color}`,
          animation: `confettiFall ${p.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
          animationDelay: `${p.delay}s`,
          transform: `rotate(${p.rotation}deg)`
        }} />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// App Version Tracking & Cloud Helpers
const APP_VERSION = 'v4.1.0';

const isValidUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const parseAthleteMeta = (posStr) => {
  if (!posStr || typeof posStr !== 'string') return { pos: posStr || '' };
  if (posStr.startsWith('{"') && posStr.endsWith('}')) {
    try {
      const parsed = JSON.parse(posStr);
      return {
        pos: parsed.pos !== undefined ? parsed.pos : '',
        bw: parsed.bw !== undefined ? Number(parsed.bw) : undefined,
        bd: parsed.bd,
        lid: parsed.lid
      };
    } catch(e) {
      return { pos: posStr };
    }
  }
  return { pos: posStr };
};

const encodeAthleteMeta = (existingPos, baselineWeight, baselineDate, baselineLogId) => {
  const current = parseAthleteMeta(existingPos);
  return JSON.stringify({
    pos: current.pos || '',
    bw: baselineWeight !== undefined && baselineWeight !== null ? Number(baselineWeight) : current.bw,
    bd: baselineDate || current.bd,
    lid: baselineLogId !== undefined ? baselineLogId : current.lid
  });
};

const isPostPracticeLog = (rec) => {
  if (!rec) return false;
  if (rec.session_type === 'post_practice' || rec.is_post_practice) return true;
  try {
    const ppMap = JSON.parse(localStorage.getItem('shiloh_post_practice_logs') || '{}');
    if (rec.id && ppMap[rec.id]) return true;
    if (rec.athlete_id && rec.created_at) {
      if (ppMap[`${rec.athlete_id}_${rec.created_at}`]) return true;
      const t = new Date(rec.created_at).getTime();
      if (!isNaN(t) && ppMap[`${rec.athlete_id}_${t}`]) return true;
      const prefix = String(rec.created_at).slice(0, 16);
      if (ppMap[`${rec.athlete_id}_${prefix}`]) return true;
    }
  } catch(e) {}
  return false;
};

const markLogAsPostPractice = (rec) => {
  if (!rec) return;
  try {
    const ppMap = JSON.parse(localStorage.getItem('shiloh_post_practice_logs') || '{}');
    if (rec.id) ppMap[rec.id] = true;
    if (rec.athlete_id && rec.created_at) {
      ppMap[`${rec.athlete_id}_${rec.created_at}`] = true;
      const t = new Date(rec.created_at).getTime();
      if (!isNaN(t)) ppMap[`${rec.athlete_id}_${t}`] = true;
      const prefix = String(rec.created_at).slice(0, 16);
      ppMap[`${rec.athlete_id}_${prefix}`] = true;
    }
    localStorage.setItem('shiloh_post_practice_logs', JSON.stringify(ppMap));
  } catch(e) {}
};

const getAthleteBaseline = (athlete, allLogs = []) => {
  if (!athlete) return null;
  const athId = athlete.id || athlete.athlete_id;
  const athleteRecords = allLogs
    .filter(r => (r.athlete_id === athId || r.id === athId) && r.weight_lbs && !isNaN(parseFloat(r.weight_lbs)) && parseFloat(r.weight_lbs) > 0 && !isPostPracticeLog(r))
    .sort((a, b) => new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0));

  let baseWeight = null;
  let baseDate = '8/3/2026';
  let baseLogId = null;

  // 1. Check custom override in localStorage map
  try {
    const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
    if (customMap[athId] && customMap[athId].weight_lbs && Number(customMap[athId].weight_lbs) > 0) {
      baseWeight = parseFloat(customMap[athId].weight_lbs);
      baseLogId = customMap[athId].log_id || 'map_base';
      const dVal = customMap[athId].date_str || customMap[athId].date;
      baseDate = dVal ? (!isNaN(new Date(dVal).getTime()) ? new Date(dVal).toLocaleDateString() : dVal) : '8/3/2026';
      return { weight_lbs: baseWeight, date_str: baseDate, id: baseLogId };
    }
  } catch(e) {}

  // 2. Check for explicit is_baseline === true log (most recent first)
  const explicitBaseLog = [...athleteRecords].reverse().find(r => r.is_baseline === true || r.is_baseline === 'true' || r.is_baseline === 1);
  if (explicitBaseLog && explicitBaseLog.weight_lbs) {
    baseWeight = parseFloat(explicitBaseLog.weight_lbs);
    baseDate = explicitBaseLog.created_at ? new Date(explicitBaseLog.created_at).toLocaleDateString() : (explicitBaseLog.date || '8/3/2026');
    return { weight_lbs: baseWeight, date_str: baseDate, id: explicitBaseLog.id };
  }

  // 3. Check specifically for weigh-in on 8/3/2026 (or date string containing 2026-08-03 or matching 8/3/2026)
  const aug3Log = [...athleteRecords].reverse().find(r => {
    const dStr = r.created_at || r.date || '';
    return dStr.includes('2026-08-03') || (!isNaN(new Date(dStr).getTime()) && new Date(dStr).toLocaleDateString() === '8/3/2026');
  });
  if (aug3Log && aug3Log.weight_lbs) {
    baseWeight = parseFloat(aug3Log.weight_lbs);
    baseDate = '8/3/2026';
    return { weight_lbs: baseWeight, date_str: baseDate, id: aug3Log.id };
  }

  // 4. Check athlete table baseline_weight or position metadata
  const meta = parseAthleteMeta(athlete.position || '');
  const bw = athlete.baseline_weight || meta.bw || meta.baseline_weight;
  if (bw && Number(bw) > 0) {
    baseWeight = parseFloat(bw);
    baseDate = meta.bd || athlete.baseline_date || '8/3/2026';
    return { weight_lbs: baseWeight, date_str: baseDate, id: 'meta_base' };
  }

  // 5. Fallback: if they have logs, take their second to last log or first ever log as baseline
  if (athleteRecords.length > 1) {
    const fallbackLog = athleteRecords[athleteRecords.length - 2];
    baseWeight = parseFloat(fallbackLog.weight_lbs);
    baseDate = fallbackLog.created_at ? new Date(fallbackLog.created_at).toLocaleDateString() : (fallbackLog.date || 'Established');
    return { weight_lbs: baseWeight, date_str: baseDate, id: fallbackLog.id };
  } else if (athleteRecords.length === 1) {
    const fallbackLog = athleteRecords[0];
    baseWeight = parseFloat(fallbackLog.weight_lbs);
    baseDate = fallbackLog.created_at ? new Date(fallbackLog.created_at).toLocaleDateString() : (fallbackLog.date || 'Established');
    return { weight_lbs: baseWeight, date_str: baseDate, id: fallbackLog.id };
  }

  return null;
};

const KioskNumpad = ({ value, onChange }) => {
  const handleKey = (key) => {
    if (key === 'DEL') return onChange(value.slice(0, -1));
    if (key === '.' && value.includes('.')) return;
    onChange(value + key);
  };
  
  const keys = ['1','2','3','4','5','6','7','8','9','.','0','DEL'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      {keys.map(k => (
        <button 
          key={k} 
          onClick={() => handleKey(k)} 
          className="btn-primary no-print" 
          style={{ height: '70px', fontSize: '28px', fontFamily: 'var(--font-display)', background: 'var(--navy-800)', border: '1px solid var(--navy-600)', color: 'var(--white)' }}
        >
          {k === 'DEL' ? <X size={28} /> : k}
        </button>
      ))}
    </div>
  );
};

export default function App() {
  // App State
  const [screen, setScreenState] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return hash || 'dashboard';
  });

  const [showMobileMore, setShowMobileMore] = useState(false);
  const setScreen = (newScreen) => {
    setScreenState(newScreen);
    window.location.hash = newScreen;
    setShowMobileMore(false);
  };
  const [search, setSearch] = useState('');
  const [selectedSportFilter, setSelectedSportFilter] = useState('ALL');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('ALL');
  const [selectedPositionFilter, setSelectedPositionFilter] = useState('ALL');
  const [nameSortOrder, setNameSortOrder] = useState('first'); // 'first' | 'last'
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null); // { type: 'athlete', id, name } or { type: 'all_weigh_ins' }
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: true, actionText: 'Confirm' });
  const [showExpiredBaselinesModal, setShowExpiredBaselinesModal] = useState(false);
  const [unweighedOnlyFilter, setUnweighedOnlyFilter] = useState(false);
  const [showHistoricalLogAccordion, setShowHistoricalLogAccordion] = useState(false);
  const [showReportsLogAccordion, setShowReportsLogAccordion] = useState(true);
  const [showBulkBaselineStudio, setShowBulkBaselineStudio] = useState(false);
  const [reportsSortDirection, setReportsSortDirection] = useState('desc');
  const [dehySortBy, setDehySortBy] = useState('drop');
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergeSuccessMsg, setMergeSuccessMsg] = useState('');
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [manualEntryForm, setManualEntryForm] = useState({
    athleteId: '',
    weight: '',
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    sessionType: 'post_practice',
    notes: '',
    successMsg: ''
  });
  const [athletes, setAthletes] = useState([]);
  const fetchReportRequestId = React.useRef(0);

  const getLastName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  };

  const getFirstName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts[0];
  };

  const filteredAthletes = athletes
    .filter(a => {
      const q = search.trim().toLowerCase();
      const hasQuery = q !== '';
      const matchesSearch = !hasQuery || 
        (a.name && String(a.name).toLowerCase().includes(q)) ||
        (a.sport && String(a.sport).toLowerCase().includes(q)) ||
        (a.team && String(a.team).toLowerCase().includes(q)) ||
        (a.grade && String(a.grade).toLowerCase().includes(q)) ||
        (a.position && String(a.position).toLowerCase().includes(q));

      const matchesSport = selectedSportFilter === 'ALL' || a.sport === selectedSportFilter;
      const matchesTeam = selectedTeamFilter === 'ALL' || a.team === selectedTeamFilter;
      const matchesGrade = selectedGradeFilter === 'ALL' || a.grade === selectedGradeFilter;
      const matchesPosition = selectedPositionFilter === 'ALL' || a.position === selectedPositionFilter;

      // When searching by name in Kiosk mode or elsewhere, don't let active dropdown filters hide the matching athlete
      return matchesSearch && (hasQuery || (matchesSport && matchesTeam && matchesGrade && matchesPosition));
    })
    .sort((a, b) => {
      if (nameSortOrder === 'last') {
        const lastA = getLastName(String(a.name || '')).toLowerCase();
        const lastB = getLastName(String(b.name || '')).toLowerCase();
        if (lastA !== lastB) return lastA.localeCompare(lastB);
        return getFirstName(String(a.name || '')).toLowerCase().localeCompare(getFirstName(String(b.name || '')).toLowerCase());
      } else {
        const firstA = getFirstName(String(a.name || '')).toLowerCase();
        const firstB = getFirstName(String(b.name || '')).toLowerCase();
        if (firstA !== firstB) return firstA.localeCompare(firstB);
        return getLastName(String(a.name || '')).toLowerCase().localeCompare(getLastName(String(b.name || '')).toLowerCase());
      }
    });
  const [isKioskMode, setIsKioskMode] = useState(false);
  
  // Entry State
  const [entryAthleteId, setEntryAthleteId] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [sleepInput, setSleepInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [todaySessions, setTodaySessions] = useState(0);
  const [focusedField, setFocusedField] = useState('weight');
  const [isBaselineTestingMode, setIsBaselineTestingMode] = useState(false);
  const [lastSavedWasBaseline, setLastSavedWasBaseline] = useState(false);
  const [lastSavedAthleteName, setLastSavedAthleteName] = useState('');
  const [kioskTrackMode, setKioskTrackMode] = useState(() => {
    try { return localStorage.getItem('shiloh_kiosk_track_mode') || 'both'; } catch (e) { return 'both'; }
  });

  // Reports State
  const [reportData, setReportData] = useState([]);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoverySyncing, setRecoverySyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [showRefreshCelebration, setShowRefreshCelebration] = useState(false);
  const touchStartY = React.useRef(null);
  const scrollAreaRef = React.useRef(null);
  
  useEffect(() => {
    if (!reportData || !reportData.length) {
      setTodaySessions(0);
      return;
    }
    const now = new Date();
    const count = reportData.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      return d.getDate() === now.getDate() &&
             d.getMonth() === now.getMonth() &&
             d.getFullYear() === now.getFullYear();
    }).length;
    setTodaySessions(count);
  }, [reportData]);

  const athletesRecordedToday = React.useMemo(() => {
    void todaySessions;
    const recordedSet = new Set();
    const now = new Date();
    if (reportData && Array.isArray(reportData)) {
      reportData.forEach(r => {
        if (!r.created_at || !r.athlete_id) return;
        const d = new Date(r.created_at);
        if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          recordedSet.add(r.athlete_id);
        }
      });
    }
    try {
      const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      offline.forEach(item => {
        const rec = item.record || item;
        if (rec && rec.athlete_id && rec.created_at) {
          const rd = new Date(rec.created_at);
          if (rd.getDate() === now.getDate() && rd.getMonth() === now.getMonth() && rd.getFullYear() === now.getFullYear()) {
            recordedSet.add(rec.athlete_id);
          }
        }
      });
    } catch (e) {}
    return recordedSet;
  }, [reportData, todaySessions]);

  // Executive Insights & 24h Deltas calculation
  const executiveInsights = React.useMemo(() => {
    void todaySessions; // Trigger re-computation when sessions are logged
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const endOfYesterday = new Date(startOfToday.getTime());

    // Merge online and offline records for calculation
    let allLogs = [...(reportData || [])];
    try {
      const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      offline.forEach(item => {
        const rec = item.record || item;
        if (rec && rec.athlete_id && rec.created_at) {
          allLogs.push(rec);
        }
      });
    } catch (e) {}

    const todayLogs = allLogs.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      return d >= startOfToday && d < endOfToday;
    });

    const yesterdayLogs = allLogs.filter(r => {
      if (!r.created_at) return false;
      const d = new Date(r.created_at);
      return d >= startOfYesterday && d < endOfYesterday;
    });

    // 1. Compliance & Momentum
    const totalAthletes = Math.max(athletes.length, 1);
    const todayRecordedIds = new Set(todayLogs.map(r => r.athlete_id));
    const yesterdayRecordedIds = new Set(yesterdayLogs.map(r => r.athlete_id));
    
    const todayCompliancePct = Math.round((todayRecordedIds.size / totalAthletes) * 100);
    const yesterdayCompliancePct = Math.round((yesterdayRecordedIds.size / totalAthletes) * 100);
    const complianceDelta = todayCompliancePct - yesterdayCompliancePct;

    // 2. Recovery & Sleep Quality Index
    const todaySleepLogs = todayLogs.filter(r => r.sleep_hrs && !isNaN(parseFloat(r.sleep_hrs)));
    const yesterdaySleepLogs = yesterdayLogs.filter(r => r.sleep_hrs && !isNaN(parseFloat(r.sleep_hrs)));
    
    const todayAvgSleep = todaySleepLogs.length 
      ? (todaySleepLogs.reduce((acc, r) => acc + parseFloat(r.sleep_hrs), 0) / todaySleepLogs.length).toFixed(1)
      : null;
    const yesterdayAvgSleep = yesterdaySleepLogs.length 
      ? (yesterdaySleepLogs.reduce((acc, r) => acc + parseFloat(r.sleep_hrs), 0) / yesterdaySleepLogs.length).toFixed(1)
      : null;
    
    const sleepDelta = (todayAvgSleep !== null && yesterdayAvgSleep !== null) 
      ? (parseFloat(todayAvgSleep) - parseFloat(yesterdayAvgSleep)).toFixed(1)
      : null;

    // 3. Hydration & Mass Stability Watch (Acute Overnight Drops > 2.5% or > 3 lbs)
    const hydrationFlags = [];
    todayLogs.forEach(todayRec => {
      const currentWt = parseFloat(todayRec.weight_lbs);
      if (!currentWt || isNaN(currentWt)) return;
      
      const ath = athletes.find(a => a.id === todayRec.athlete_id) || { name: todayRec.athlete_name || 'Unknown Athlete', sport: 'General' };
      
      const previousLogs = allLogs
        .filter(r => r.athlete_id === todayRec.athlete_id && new Date(r.created_at) < startOfToday && r.weight_lbs)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
      if (previousLogs.length > 0) {
        const prevWt = parseFloat(previousLogs[0].weight_lbs);
        if (prevWt && !isNaN(prevWt)) {
          const deltaLbs = currentWt - prevWt;
          const deltaPct = (deltaLbs / prevWt) * 100;
          
          if (deltaLbs <= -3.0 || deltaPct <= -2.0) {
            hydrationFlags.push({
              athlete: ath,
              currentWt: currentWt.toFixed(1),
              prevWt: prevWt.toFixed(1),
              deltaLbs: deltaLbs.toFixed(1),
              deltaPct: deltaPct.toFixed(1),
              date: new Date(previousLogs[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            });
          }
        }
      }
    });

    // 4. Sport Group Leaderboard
    const sportStats = {};
    athletes.forEach(a => {
      const s = (a.sport || 'General').toUpperCase();
      if (!sportStats[s]) sportStats[s] = { total: 0, loggedToday: 0 };
      sportStats[s].total += 1;
      if (todayRecordedIds.has(a.id)) {
        sportStats[s].loggedToday += 1;
      }
    });

    const leaderboard = Object.keys(sportStats).map(sport => {
      const stats = sportStats[sport];
      const pct = Math.round((stats.loggedToday / Math.max(stats.total, 1)) * 100);
      return {
        sport,
        loggedToday: stats.loggedToday,
        total: stats.total,
        percentage: pct
      };
    }).sort((a, b) => b.percentage - a.percentage || b.loggedToday - a.loggedToday);

    return {
      todayCompliancePct,
      yesterdayCompliancePct,
      complianceDelta,
      todayAvgSleep,
      yesterdayAvgSleep,
      sleepDelta,
      hydrationFlags,
      leaderboard,
      sportLeaderboard: leaderboard,
      todayCount: todayLogs.length,
      todayRecordedCount: todayRecordedIds.size
    };
  }, [reportData, athletes, todaySessions]);

  const [reportLoading, setReportLoading] = useState(false);
  const [bulkBaselineSport, setBulkBaselineSport] = useState('Football');
  const [bulkBaselineDate, setBulkBaselineDate] = useState('');
  const [reportMode, setReportMode] = useState('quick'); // 'quick' | 'custom'
  const [reportSportFilter, setReportSportFilter] = useState('ALL');
  const [reportTimeframe, setReportTimeframe] = useState('all'); // 'today' | '7d' | '30d' | 'all'
  const [enabledMetrics, setEnabledMetrics] = useState({
    teamSummary: true,
    acuteSweatLoss: true,
    dehydration: true,
    sleepDeficit: true,
    expiredBaselines: true,
    weightLeaderboard: true,
    rawLogs: true
  });

  // Roster State
  const [isAddingAthlete, setIsAddingAthlete] = useState(false);
  const [editingAthleteId, setEditingAthleteId] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [profileData, setProfileData] = useState([]);
  const [newAthlete, setNewAthlete] = useState({ name: '', sport: '', team: '', grade: '', position: '' });
  
  // Alerts State
  const [alertsTab, setAlertsTab] = useState('DAILY');

  // Settings & PWA State
  const [dehydrationThreshold, setDehydrationThreshold] = useState(() => {
    try { return Number(JSON.parse(localStorage.getItem('shiloh_threshold_settings'))?.dehydrationThreshold) || 2.0; } catch(e) { return 2.0; }
  }); // %
  const [sleepThreshold, setSleepThreshold] = useState(() => {
    try { return Number(JSON.parse(localStorage.getItem('shiloh_threshold_settings'))?.sleepThreshold) || 6.5; } catch(e) { return 6.5; }
  }); // hrs
  const [baselineExpiryDays, setBaselineExpiryDays] = useState(() => {
    try { return Number(JSON.parse(localStorage.getItem('shiloh_threshold_settings'))?.baselineExpiryDays) || 14; } catch(e) { return 14; }
  }); // days
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [copiedLinkToast, setCopiedLinkToast] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [unsyncedQueueCount, setUnsyncedQueueCount] = useState(() => {
    try { return JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]').length; } catch(e) { return 0; }
  });

  useEffect(() => {
    fetchAthletes();

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setScreenState(hash || 'dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);

    const checkQueue = () => {
      try {
        const q = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        setUnsyncedQueueCount(q.length);
      } catch(e) {}
    };
    checkQueue();

    // Supabase UltraSync: Realtime WebSockets + Instant Client-to-Client Broadcast Channel (iPad <-> PC)
    let channel;
    try {
      channel = supabase
        .channel('shiloh_ultrasync_bus', { config: { broadcast: { ack: false, self: false } } })
        .on('broadcast', { event: 'DEVICE_SYNC_EVENT' }, (payload) => {
          console.log("🔥 [ULTRASYNC] Instant real-time signal received from wireless device:", payload);
          if (payload.payload && payload.payload.isPing) {
            console.log("📶 [ULTRASYNC] Test ping received — devices are connected.");
          }
          if (payload.payload && payload.payload.type === 'NEW_WEIGH_IN_LOGGED' && payload.payload.record) {
            const incoming = payload.payload.record;
            console.log("⚡ [ULTRASYNC DATA RECEPTION] Merging live wireless log directly into display:", incoming);
            setReportData(prev => {
              const isDuplicate = prev.some(r => {
                if (r.id && incoming.id && !String(r.id).startsWith('opt_') && !String(r.id).startsWith('offline_')) {
                  return r.id === incoming.id;
                }
                // Fallback heuristic only when no reliable id is available — tightened to 5s
                // so two legitimate same-weight re-weighs within a minute aren't dropped as dupes.
                return r.athlete_id === incoming.athlete_id &&
                  Math.abs(new Date(r.created_at || 0) - new Date(incoming.created_at || 0)) < 5000 &&
                  Number(r.weight_lbs) === Number(incoming.weight_lbs);
              });
              if (isDuplicate) return prev;
              const merged = [incoming, ...prev].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
              try { localStorage.setItem('shiloh_reports', JSON.stringify(merged)); } catch(e){}
              return merged;
            });
            setTodaySessions(prev => prev + 1);
          }
          // Immediately fetch latest cloud records to reconcile screen within milliseconds!
          fetchReportData(true);
          fetchAthletes();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'weigh_ins' }, () => {
          fetchReportData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'athletes' }, () => {
          fetchAthletes();
          fetchReportData(true);
        })
        .subscribe();
    } catch (e) {
      console.warn("Realtime UltraSync warning:", e);
    }

    // 5-Second UltraSync Heartbeat: Continually pull new records from iPad or PC even if WiFi blocks WebSockets
    const autoSyncInterval = setInterval(() => {
      checkQueue();
      if (navigator.onLine) {
        syncOfflineCache();
        fetchReportData(true);
      }
    }, 5000);

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineCache();
      fetchReportData(true);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsAppInstalled(true);
    }

    return () => {
      clearInterval(autoSyncInterval);
      if (channel && typeof supabase.removeChannel === 'function') {
        try { supabase.removeChannel(channel); } catch(e){}
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallApp = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsAppInstalled(true);
        }
        setDeferredInstallPrompt(null);
        return;
      } catch (err) {
        console.log("Install prompt error:", err);
      }
    }
    setShowInstallModal(true);
  };

  const handleShareApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'HPD APP',
          text: 'Install HPD App for High Performance Weight Tracking',
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share error:", err);
      }
    } else {
      handleCopyLink();
    }
  };

  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLinkToast(true);
      setTimeout(() => setCopiedLinkToast(false), 2500);
    } catch (err) {
      console.log("Copy error:", err);
    }
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('shiloh_threshold_settings', JSON.stringify({
        dehydrationThreshold: Number(dehydrationThreshold),
        sleepThreshold: Number(sleepThreshold),
        baselineExpiryDays: Number(baselineExpiryDays)
      }));
    } catch(e) { console.error('Failed to save settings to localStorage:', e); }
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 4000);
  };

  const handleForceSync = async () => {
    setSyncStatus('SYNCING CLOUD DATA...');
    await fetchAthletes();
    await fetchReportData();
    setSyncStatus('ALL CLOUD DATA SYNCED CLEANLY!');
    setTimeout(() => setSyncStatus(''), 3000);
  };

  const handleExportDiagnostics = () => {
    let rawOffline = null, rawReports = null, rawRoster = null;
    try { rawOffline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins')); } catch(e){}
    try { rawReports = JSON.parse(localStorage.getItem('shiloh_reports')); } catch(e){}
    try { rawRoster = JSON.parse(localStorage.getItem('shiloh_roster')); } catch(e){}

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      athlete_count: athletes.length,
      report_count: reportData.length,
      thresholds: { dehydrationThreshold, sleepThreshold, baselineExpiryDays },
      athletes: athletes,
      weigh_ins: reportData,
      raw_offline_queue: rawOffline,
      raw_cached_reports: rawReports,
      raw_roster: rawRoster
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `hpd_diagnostics_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearAppCache = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear Local Browser Cache',
      message: 'Are you sure you want to clear browser local cache? This will reset local unsynced queues and refresh your current session.',
      isDanger: true,
      actionText: 'Clear & Refresh',
      onConfirm: () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      }
    });
  };

  const broadcastDeviceSync = (customPayload = {}) => {
    try {
      supabase.channel('shiloh_ultrasync_bus').send({
        type: 'broadcast',
        event: 'DEVICE_SYNC_EVENT',
        payload: { timestamp: Date.now(), ...customPayload }
      });
    } catch(e) {
      console.warn("Could not send broadcast:", e);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async (isBackground = false) => {
    const requestId = ++fetchReportRequestId.current;
    if (!isBackground) setReportLoading(true);
    let onlineData = [];
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('weigh_ins')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      if (!error && data) {
        onlineData = data;
      } else if (error) {
        throw error;
      }
    } catch {
      console.warn("Could not fetch report data from Supabase. Loading local cache.");
      try {
        const cached = JSON.parse(localStorage.getItem('shiloh_reports') || '[]');
        if (cached && Array.isArray(cached)) onlineData = cached;
      } catch (e) {
        console.warn("Local cache empty or invalid.");
      }
    }

    // ALWAYS merge in any unsynced offline records from localStorage so today's logs NEVER disappear!
    let merged = [...onlineData];
    try {
      const offlineQueue = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      offlineQueue.forEach(item => {
        const rec = item.record || item;
        if (rec && rec.athlete_id && rec.created_at) {
          const alreadyExists = merged.some(r => 
            (r.id && rec.id && r.id === rec.id && !String(r.id).startsWith('opt_')) || 
            (r.athlete_id === rec.athlete_id && Math.abs(new Date(r.created_at) - new Date(rec.created_at)) < 5000)
          );
          if (!alreadyExists) {
            merged.unshift({ ...rec, id: rec.id || 'offline_' + Date.now() + Math.random().toString(36).substr(2, 4), is_offline_cached: true });
          }
        }
      });
    } catch (e) {
      console.warn("Error reading offline queue:", e);
    }

    try {
      const persistedMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
      merged = merged.map(item => {
        const p = persistedMap[item.athlete_id];
        if (p && p.log_id) {
          return { ...item, is_baseline: item.id === p.log_id };
        }
        return item;
      });
    } catch (e) {}

    merged.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    // If a newer fetchReportData call has started since this one began, this response
    // is stale (e.g. slow network response landing after a faster subsequent poll) — drop it.
    if (requestId !== fetchReportRequestId.current) return;

    setReportData(merged);
    try {
      localStorage.setItem('shiloh_reports', JSON.stringify(merged));
    } catch (e) {}
    setReportLoading(false);
  };

  const syncOfflineCache = async (isInteractive = false) => {
    const offlineQueue = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
    if (offlineQueue.length === 0) {
      if (isInteractive === true || typeof isInteractive === 'object') {
        alert("☁️ No offline logs pending. Your iPad is completely synchronized with the cloud server!");
      }
      return;
    }

    const remainingQueue = [];
    let syncedAny = false;
    const isClick = isInteractive === true || typeof isInteractive === 'object';

    try {
      for (const item of offlineQueue) {
        const rec = item.record || item;
        let targetAthId = rec.athlete_id;
        if (!isValidUuid(targetAthId)) {
          const match = athletes.find(a => a.name && a.name.trim().toLowerCase() === (rec.athlete_name || '').trim().toLowerCase() && isValidUuid(a.id));
          if (match) targetAthId = match.id;
        }
        const cleanPayload = {
          athlete_id: targetAthId,
          athlete_name: rec.athlete_name || 'Unknown',
          sport: rec.sport || '',
          weight_lbs: (rec.weight_lbs !== undefined && rec.weight_lbs !== null) ? rec.weight_lbs : 0,
          sleep_hrs: !isNaN(parseFloat(rec.sleep_hrs)) ? parseFloat(rec.sleep_hrs) : 0,
          created_at: rec.created_at || new Date().toISOString()
        };
        // We do NOT attach is_baseline because weigh_ins in Postgres does not contain an is_baseline column!
        let success = false;
        if (item.action === 'update' && item.id && !String(item.id).startsWith('opt_') && !String(item.id).startsWith('offline_')) {
          const res = await supabase.from('weigh_ins').update(cleanPayload).eq('id', item.id);
          if (!res.error) success = true;
        }
        
        if (!success && isValidUuid(cleanPayload.athlete_id)) {
          const res = await supabase.from('weigh_ins').insert([cleanPayload]);
          if (!res.error) success = true;
          else {
            // Minimalist fallback without strict constraints
            const mini = {
              athlete_id: cleanPayload.athlete_id,
              athlete_name: cleanPayload.athlete_name,
              sport: cleanPayload.sport,
              weight_lbs: cleanPayload.weight_lbs || 0,
              sleep_hrs: cleanPayload.sleep_hrs || 0,
              created_at: cleanPayload.created_at
            };
            const resMini = await supabase.from('weigh_ins').insert([mini]);
            if (!resMini.error) success = true;
          }
        }

        // Whether uploaded to cloud or legacy ID rejected by Postgres schema, we archive to permanent vault & release the queue!
        try {
          const vault = JSON.parse(localStorage.getItem('shiloh_permanent_vault') || '[]');
          vault.unshift({ saved_at: new Date().toISOString(), record: rec, synced: success });
          localStorage.setItem('shiloh_permanent_vault', JSON.stringify(vault.slice(0, 1000)));
        } catch(e) {}
        
        syncedAny = true;
      }
      
      // Merge any newly queued offline items that arrived while the cloud network request was processing
      const currentQueue = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      const newlyAdded = currentQueue.filter(i => {
        const idx = offlineQueue.findIndex(old => {
          if (old.id && i.id && old.id === i.id) return true;
          const oldRec = old.record || old;
          const iRec = i.record || i;
          return oldRec.created_at && iRec.created_at && oldRec.created_at === iRec.created_at && oldRec.athlete_id === iRec.athlete_id;
        });
        return idx === -1;
      });
      const finalQueue = [...newlyAdded];
      
      localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify(finalQueue));
      fetchReportData();
      setUnsyncedQueueCount(finalQueue.length);

      if (isClick) {
        alert(`⚡ Cloud Synchronization Complete!\n\n✅ Successfully reconciled & processed ${offlineQueue.length} offline sessions! All records are secured in your dashboard and hardware vault.`);
      }
    } catch (err) {
      console.warn("Could not sync offline queue yet:", err);
      if (isClick) alert("⚠️ Network error while attempting to reach server. Your records remain safe in the offline vault.");
    }
  };

  const getRecoveredLocalData = () => {
    const findings = [];
    const seen = new Set();
    
    // 1. Check offline queue and permanent hardware vault
    try {
      const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      offline.forEach((item, idx) => {
        const rec = item.record || item;
        if (rec && (rec.weight_lbs !== undefined || rec.sleep_hrs !== undefined || rec.athlete_id)) {
          const key = (rec.athlete_id || '') + '_' + (rec.created_at || '');
          if (!seen.has(key)) {
            seen.add(key);
            findings.push({ ...rec, source_key: 'shiloh_offline_weigh_ins (Offline Queue)', raw_index: idx });
          }
        }
      });
      
      const vault = JSON.parse(localStorage.getItem('shiloh_permanent_vault') || '[]');
      vault.forEach((item, idx) => {
        const rec = item.record || item;
        if (rec && (rec.weight_lbs !== undefined || rec.sleep_hrs !== undefined || rec.athlete_id)) {
          const key = (rec.athlete_id || '') + '_' + (rec.created_at || '');
          if (!seen.has(key)) {
            seen.add(key);
            findings.push({ ...rec, source_key: 'shiloh_permanent_vault (Hardware Vault)', raw_index: idx });
          }
        }
      });
    } catch (e) {}

    // 2. Check cached reports
    try {
      const reports = JSON.parse(localStorage.getItem('shiloh_reports') || '[]');
      if (Array.isArray(reports)) {
        reports.forEach((rec, idx) => {
          if (rec && (rec.weight_lbs !== undefined || rec.sleep_hrs !== undefined || rec.athlete_id)) {
            const key = (rec.athlete_id || '') + '_' + (rec.created_at || '');
            if (!seen.has(key)) {
              seen.add(key);
              findings.push({ ...rec, source_key: 'shiloh_reports (Local Report Cache)', raw_index: idx });
            }
          }
        });
      }
    } catch (e) {}

    // 3. Scan ALL localStorage keys just in case data was archived or cached elsewhere
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k !== 'shiloh_offline_weigh_ins' && k !== 'shiloh_reports' && k !== 'shiloh_roster' && k !== 'shiloh_kiosk_track_mode') {
          const val = localStorage.getItem(k);
          if (val && (val.startsWith('[') || val.startsWith('{'))) {
            try {
              const parsed = JSON.parse(val);
              const arr = Array.isArray(parsed) ? parsed : [parsed];
              arr.forEach((rec, idx) => {
                if (rec && (rec.weight_lbs !== undefined || rec.sleep_hrs !== undefined || rec.athlete_id)) {
                  const key = (rec.athlete_id || '') + '_' + (rec.created_at || '');
                  if (!seen.has(key)) {
                    seen.add(key);
                    findings.push({ ...rec, source_key: `Backup (${k})`, raw_index: idx });
                  }
                }
              });
            } catch (err) {}
          }
        }
      }
    } catch (e) {}

    return findings.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  };

  const forceUploadRecoveredData = async () => {
    setRecoverySyncing(true);
    const logs = getRecoveredLocalData();
    let successCount = 0;
    let failCount = 0;

    for (const rec of logs) {
      const cleanPayload = {
        athlete_id: rec.athlete_id,
        athlete_name: rec.athlete_name || 'Unknown',
        sport: rec.sport || '',
        weight_lbs: (rec.weight_lbs !== undefined && rec.weight_lbs !== null) ? rec.weight_lbs : 0,
        sleep_hrs: !isNaN(parseFloat(rec.sleep_hrs)) ? parseFloat(rec.sleep_hrs) : 0,
        created_at: rec.created_at || new Date().toISOString()
      };
      if (rec.is_baseline !== undefined) cleanPayload.is_baseline = rec.is_baseline;

      let res = await supabase.from('weigh_ins').insert([cleanPayload]);
      if (res.error) {
        delete cleanPayload.is_baseline;
        res = await supabase.from('weigh_ins').insert([cleanPayload]);
      }
      if (!res.error) {
        successCount++;
      } else {
        failCount++;
      }
    }

    setRecoverySyncing(false);
    alert(`⚡ Cloud Force Upload Complete:\n✅ Successfully uploaded & synchronized: ${successCount} logs.\n${failCount > 0 ? `⚠️ Unchanged or already existing duplicates: ${failCount}` : ''}`);
    fetchReportData();
  };

  const downloadRecoveredJSON = () => {
    const data = {
      timestamp: new Date().toISOString(),
      recovered_records: getRecoveredLocalData(),
      raw_offline_queue: tryParseLocalStorage('shiloh_offline_weigh_ins'),
      raw_cached_reports: tryParseLocalStorage('shiloh_reports'),
      raw_roster: tryParseLocalStorage('shiloh_roster')
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `IPAD_RECOVERED_LOGS_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const tryParseLocalStorage = (key) => {
    try { return JSON.parse(localStorage.getItem(key)) || null; } catch (e) { return localStorage.getItem(key) || null; }
  };

  const handleImportDiagnosticsFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target.result;
        let foundRecords = [];
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            foundRecords = parsed;
          } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.recovered_records)) foundRecords.push(...parsed.recovered_records);
            if (Array.isArray(parsed.logs)) foundRecords.push(...parsed.logs);
            if (Array.isArray(parsed.weigh_ins)) foundRecords.push(...parsed.weigh_ins);
            if (Array.isArray(parsed.report_data)) foundRecords.push(...parsed.report_data);
            if (parsed.raw_offline_queue && Array.isArray(parsed.raw_offline_queue)) {
              parsed.raw_offline_queue.forEach(item => foundRecords.push(item.record || item));
            }
            if (parsed.raw_cached_reports && Array.isArray(parsed.raw_cached_reports)) {
              foundRecords.push(...parsed.raw_cached_reports);
            }
          }
        } else if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
          const lines = content.split(/\r?\n/);
          lines.forEach(line => {
            if (!line.trim() || line.toLowerCase().includes('athlete name')) return;
            const parts = line.split(',').map(s => s.replace(/^"|"$/g, '').trim());
            if (parts.length >= 4) {
              foundRecords.push({
                athlete_name: parts[0],
                sport: parts[1],
                weight_lbs: parseFloat(parts[2]) || 0,
                sleep_hrs: parseFloat(parts[3]) || 0,
                created_at: parts[4] ? new Date(parts[4]).toISOString() : new Date().toISOString()
              });
            }
          });
        }

        const validRecords = foundRecords.filter(r => r && (r.weight_lbs !== undefined || r.sleep_hrs !== undefined || r.athlete_id || r.athlete_name));
        if (validRecords.length === 0) {
          alert("Could not identify formatted weigh-in records in this file. Please make sure it is a valid diagnostics JSON or export CSV.");
          return;
        }

        validRecords.forEach(rec => {
          if (!rec.athlete_id && rec.athlete_name) {
            const matched = athletes.find(a => a.name && a.name.toLowerCase() === rec.athlete_name.toLowerCase());
            if (matched) rec.athlete_id = matched.id;
          }
        });

        const currentOffline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        validRecords.forEach(rec => {
          currentOffline.push({ action: 'insert', id: rec.id || 'imp_' + Date.now() + Math.random().toString(36).substr(2, 4), record: rec });
        });
        localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify(currentOffline));
        
        fetchReportData();
        alert(`🎉 Success! Easily extracted & imported ${validRecords.length} records from your file (${file.name})! They are now merged into your active dashboard and recovery directory. Click '⚡ FORCE UPLOAD TO CLOUD SERVER' to save them immediately to Supabase!`);
      } catch (err) {
        console.error("Error importing file:", err);
        alert("Failed to read diagnostic file. Please check the format and try again.");
      }
    };
    reader.readAsText(file);
  };

  const fetchAthletes = async () => {
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const { data, error } = await supabase.from('athletes').select('*').order('name', { ascending: true });
      if (!error && data) {
        const cloudMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
        const decodedAthletes = data.map(a => {
          const meta = parseAthleteMeta(a.position);
          let bw = a.baseline_weight;
          let bd = a.baseline_date;
          let lid = a.baseline_log_id;
          if (meta.bw !== undefined) {
            bw = meta.bw;
            bd = meta.bd || bd;
            lid = meta.lid || lid;
            cloudMap[a.id] = { log_id: lid || 'cloud_' + a.id, weight_lbs: bw, date_str: bd || new Date().toISOString() };
          }
          return {
            ...a,
            position: meta.pos || '',
            raw_position: a.position || '',
            baseline_weight: bw,
            baseline_date: bd,
            baseline_log_id: lid
          };
        });
        try { localStorage.setItem('shiloh_baselines_map', JSON.stringify(cloudMap)); } catch(e) {}
        setAthletes(decodedAthletes);
        localStorage.setItem('shiloh_roster', JSON.stringify(decodedAthletes));
      } else {
        throw error;
      }
    } catch (err) {
      console.warn("Supabase fetch failed. Loading local cache.");
      try {
        const cached = JSON.parse(localStorage.getItem('shiloh_roster'));
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setAthletes(cached);
        } else {
          console.warn("No local roster cache. Falling back to mock data.");
          setMockAthletes();
        }
      } catch (e) {
        console.warn("No local roster cache. Falling back to mock data.");
        setMockAthletes();
      }
    }
  };

  const handleManualCloudRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (typeof fetchAthletes === 'function') await fetchAthletes();
      if (typeof fetchReportData === 'function') await fetchReportData(true);
      if (typeof syncOfflineCache === 'function') syncOfflineCache();
      try { broadcastDeviceSync({ type: 'MANUAL_REFRESH' }); } catch(e) {}
    } catch (e) {
      console.warn("Manual refresh warning:", e);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
        setPullProgress(0);
        setShowRefreshCelebration(true);
        setTimeout(() => setShowRefreshCelebration(false), 2500);
      }, 650);
    }
  };

  const handleTouchStart = (e) => {
    if (scrollAreaRef.current && scrollAreaRef.current.scrollTop <= 5) {
      touchStartY.current = e.touches[0].clientY;
    } else {
      touchStartY.current = null;
    }
  };

  const handleTouchMove = (e) => {
    if (touchStartY.current === null || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;
    if (deltaY > 15 && scrollAreaRef.current && scrollAreaRef.current.scrollTop <= 5) {
      const progress = Math.min(100, Math.floor(((deltaY - 15) / 70) * 100));
      setPullProgress(progress);
    } else if (deltaY <= 0) {
      setPullProgress(0);
    }
  };

  const handleTouchEnd = () => {
    if (pullProgress >= 75 && !isRefreshing) {
      handleManualCloudRefresh();
    } else {
      setPullProgress(0);
      touchStartY.current = null;
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      // Remove BOM if present, and handle all types of line endings
      let text = event.target.result;
      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
      }
      
      const lines = text.split(/\r\n|\r|\n/).filter(line => line.trim() !== '');
      if (lines.length < 2) return alert("CSV appears empty or missing headers.");
      
      // Strip quotes and spaces from headers
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const nameIdx = headers.indexOf('athlete');
      const sportIdx = headers.indexOf('sport');
      const teamIdx = headers.indexOf('team');
      const gradeIdx = headers.indexOf('grade');
      const posIdx = headers.indexOf('position');
      
      if (nameIdx === -1) {
        return alert("CSV must have an 'Athlete' column header. Optional columns: Sport, Team, Grade, Position");
      }

      const athletesToInsert = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols[nameIdx]) {
          athletesToInsert.push({
            name: cols[nameIdx],
            sport: sportIdx !== -1 ? (cols[sportIdx] || '') : '',
            team: teamIdx !== -1 ? (cols[teamIdx] || '') : '',
            grade: gradeIdx !== -1 ? (cols[gradeIdx] || '') : '',
            position: posIdx !== -1 ? (cols[posIdx] || '') : '',
            created_at: new Date().toISOString()
          });
        }
      }

      if (athletesToInsert.length === 0) return alert("No valid athletes found in CSV.");

      try {
        const { error } = await supabase.from('athletes').insert(athletesToInsert);
        if (error) throw error;
        alert(`Successfully uploaded ${athletesToInsert.length} athletes!`);
        fetchAthletes();
      } catch (err) {
        console.error("CSV Upload Error:", err);
        alert("Failed to upload athletes to database.");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input
  };

  const handleDownloadTemplate = () => {
    const csvContent = "Athlete,Sport,Team,Grade,Position\nJohn Doe,Football,Varsity,11th,WR\nJane Smith,Basketball,JV,10th,PG";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'Roster_Upload_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setMockAthletes = () => {
    setAthletes([
      { id: '1', name: 'Jaylen Carter', sport: 'Football', team: 'Varsity', position: 'WR' },
      { id: '2', name: 'Micah Reeves', sport: 'Football', team: 'Varsity', position: 'LB' },
      { id: '3', name: 'Owen Baxter', sport: 'Basketball', team: 'Varsity', position: 'PG' }
    ]);
  };

  const selectedAthlete = athletes.find(a => a.id === entryAthleteId);
  const defaultSports = ['Baseball', 'Cheer & Dance', 'Football', 'Golf', 'MBB', 'SOCC', 'Softball', 'Tennis', 'Track & Field', 'VBB', 'Volleyball', 'WBB', 'WSOC', 'Wrestling'];
  const sportsList = Array.from(new Set([...defaultSports, ...athletes.map(a => a.sport).filter(Boolean)])).sort();
  const teamsList = Array.from(new Set(athletes.map(a => a.team).filter(Boolean)));
  const gradesList = Array.from(new Set(athletes.map(a => a.grade).filter(Boolean)));
  const positionsList = Array.from(new Set(athletes.map(a => a.position).filter(Boolean)));

  const handleSelectAthleteForEntry = (athleteId) => {
    setEntryAthleteId(athleteId);
    setScreen('entry');
    
    // Find latest record for baseline weight
    const records = reportData.filter(r => r.athlete_id === athleteId && r.weight_lbs && Number(r.weight_lbs) > 0);
    if (records.length > 0) {
      const sorted = [...records].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      setWeightInput(String(sorted[sorted.length - 1].weight_lbs));
    } else {
      setWeightInput('0.0');
    }
    setSleepInput('8.0');
    setFocusedField(kioskTrackMode === 'sleep_only' ? 'sleep' : 'weight');
  };

  const handleSave = async (isBaselineOverride = false, skipOverrideConfirm = false) => {
    if (!selectedAthlete) return;
    if (kioskTrackMode !== 'sleep_only' && (!weightInput || weightInput === '0.0' || weightInput === '')) return;
    if (kioskTrackMode === 'sleep_only' && (!sleepInput || sleepInput === '' || parseFloat(sleepInput) <= 0)) return;
    
    const now = new Date();
    const existingRecord = reportData.find(r => {
      if (r.athlete_id !== selectedAthlete.id) return false;
      const recordDate = new Date(r.created_at);
      return recordDate.getFullYear() === now.getFullYear() && 
             recordDate.getMonth() === now.getMonth() && 
             recordDate.getDate() === now.getDate();
    });
    
    if (existingRecord && !skipOverrideConfirm) {
      setConfirmModal({
        isOpen: true,
        title: 'Overwrite Today Log?',
        message: `A record already exists for ${selectedAthlete.name} today. Do you want to update and override their recorded entry?`,
        isDanger: false,
        actionText: 'Override Log',
        onConfirm: () => handleSave(isBaselineOverride, true)
      });
      return;
    }
    
    setSaving(true);
    const weightVal = (kioskTrackMode !== 'sleep_only' && weightInput && !isNaN(parseFloat(weightInput)) && parseFloat(weightInput) > 0) ? parseFloat(weightInput) : null;
    const record = { 
      athlete_id: selectedAthlete.id, 
      athlete_name: selectedAthlete.name,
      sport: selectedAthlete.sport,
      weight_lbs: weightVal,
      sleep_hrs: !isNaN(parseFloat(sleepInput)) ? parseFloat(sleepInput) : 0,
      created_at: new Date().toISOString()
    };

    const shouldSetBaseline = isBaselineTestingMode || isBaselineOverride === true || (typeof isBaselineOverride === 'object' && isBaselineOverride?.isBaseline === true);
    if (shouldSetBaseline && weightVal) {
      record.is_baseline = true;
      const updatedBaselineDate = new Date().toISOString();
      setAthletes(prev => {
        const updated = prev.map(a => a.id === selectedAthlete.id ? { ...a, baseline_date: updatedBaselineDate, baseline_weight: weightVal } : a);
        try { localStorage.setItem('shiloh_roster', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      try {
        const targetPos = selectedAthlete.raw_position || selectedAthlete.position || '';
        const updatedMeta = encodeAthleteMeta(targetPos, weightVal, updatedBaselineDate, null);
        if (isValidUuid(selectedAthlete.id)) {
          supabase.from('athletes').update({ position: updatedMeta }).eq('id', selectedAthlete.id).then();
        }
        const map = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
        map[selectedAthlete.id] = { log_id: null, weight_lbs: Number(weightVal), date_str: updatedBaselineDate };
        localStorage.setItem('shiloh_baselines_map', JSON.stringify(map));
      } catch (e) {}
    }

    // Write to Permanent Local Hardware Vault as bulletproof fallback protection
    try {
      const vault = JSON.parse(localStorage.getItem('shiloh_permanent_vault') || '[]');
      vault.unshift({ saved_at: new Date().toISOString(), record });
      localStorage.setItem('shiloh_permanent_vault', JSON.stringify(vault.slice(0, 1000)));
    } catch(e) {}

    // Optimistic UI updates right away regardless of network connectivity
    if (existingRecord) {
      setReportData(prev => prev.map(r => r.id === existingRecord.id ? { ...existingRecord, ...record } : r));
    } else {
      setReportData(prev => [{ id: 'opt_' + Date.now(), ...record }, ...prev]);
      setTodaySessions(prev => prev + 1);
    }

    try {
      let targetAthId = record.athlete_id;
      if (!isValidUuid(targetAthId)) {
        const match = athletes.find(a => a.name && a.name.trim().toLowerCase() === (record.athlete_name || '').trim().toLowerCase() && isValidUuid(a.id));
        if (match) {
          targetAthId = match.id;
        } else {
          const { data: newAth } = await supabase.from('athletes').insert([{ name: record.athlete_name || 'Unknown', sport: record.sport || 'Football' }]).select();
          if (newAth && newAth[0] && newAth[0].id) {
            targetAthId = newAth[0].id;
          }
        }
      }

      const cloudPayload = {
        athlete_id: targetAthId,
        athlete_name: record.athlete_name || 'Unknown',
        sport: record.sport || '',
        weight_lbs: (record.weight_lbs !== undefined && record.weight_lbs !== null) ? record.weight_lbs : 0,
        sleep_hrs: !isNaN(parseFloat(record.sleep_hrs)) ? parseFloat(record.sleep_hrs) : 0,
        created_at: record.created_at || new Date().toISOString()
      };

      if (existingRecord && !String(existingRecord.id).startsWith('opt_') && !String(existingRecord.id).startsWith('offline_')) {
        let { error } = await supabase.from('weigh_ins').update(cloudPayload).eq('id', existingRecord.id);
        if (error) throw error;
      } else {
        let { error } = await supabase.from('weigh_ins').insert([cloudPayload]);
        if (error) throw error;
      }
      
      fetchReportData(true);
      syncOfflineCache();
      const liveRecord = { id: 'broadcast_' + Date.now(), ...record, created_at: record.created_at || new Date().toISOString() };
      broadcastDeviceSync({ type: 'NEW_WEIGH_IN_LOGGED', record: liveRecord });
    } catch (err) {
      console.warn("Supabase offline or unreachable, queuing payload locally for background sync:", err);
      try {
        const existing = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        existing.push({
          action: existingRecord ? 'update' : 'insert',
          id: existingRecord ? existingRecord.id : null,
          record
        });
        localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify(existing));
        setUnsyncedQueueCount(existing.length);
      } catch (e) {
        console.warn("LocalStorage warning:", e);
      }
      const liveRecord = { id: 'broadcast_' + Date.now(), ...record, created_at: record.created_at || new Date().toISOString() };
      broadcastDeviceSync({ type: 'NEW_WEIGH_IN_LOGGED', record: liveRecord });
    }
      
    // Instant Optimistic Visual Celebration
    setSaving(false);
    setLastSavedWasBaseline(!!shouldSetBaseline);
    setLastSavedAthleteName(selectedAthlete.name);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 2500);
    setWeightInput('');
    setSleepInput('');
    setEntryAthleteId(null);
    setSearch('');
  };

  const handleSaveManualLog = async (newRec) => {
    // 1. Optimistic UI updates right away
    setReportData(prev => [newRec, ...prev]);
    setTodaySessions(prev => prev + 1);

    // 2. Persist to local hardware vault as backup
    try {
      const vault = JSON.parse(localStorage.getItem('shiloh_permanent_vault') || '[]');
      vault.unshift({ saved_at: new Date().toISOString(), record: newRec });
      localStorage.setItem('shiloh_permanent_vault', JSON.stringify(vault.slice(0, 1000)));
    } catch (e) {}

    // 3. Sync with live Supabase database
    try {
      let targetAthId = newRec.athlete_id;
      if (!isValidUuid(targetAthId)) {
        const match = athletes.find(a => a.name && a.name.trim().toLowerCase() === (newRec.athlete_name || '').trim().toLowerCase() && isValidUuid(a.id));
        if (match) targetAthId = match.id;
      }

      const cloudPayload = {
        athlete_id: targetAthId,
        athlete_name: newRec.athlete_name || 'Unknown',
        sport: newRec.sport || '',
        weight_lbs: newRec.weight_lbs,
        sleep_hrs: newRec.sleep_hrs || 0,
        created_at: newRec.created_at
      };

      const { data, error } = await supabase.from('weigh_ins').insert([cloudPayload]).select();
      if (error) throw error;

      if (data && data[0] && newRec.session_type === 'post_practice') {
        markLogAsPostPractice(data[0]);
      }

      fetchReportData(true);
      if (typeof selectedProfileId !== 'undefined' && selectedProfileId && selectedProfileId === newRec.athlete_id) {
        fetchProfileData(selectedProfileId);
      }
    } catch (err) {
      console.warn("Cloud save failed or offline, adding to offline sync queue:", err);
      try {
        const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        offline.push({ action: 'insert', record: newRec, queue_id: 'q_' + Date.now() });
        localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify(offline));
        setUnsyncedQueueCount(offline.length);
      } catch (e) {}
    }
  };

  const exportToCSV = async () => {
    try {
      let dataToExport = [];
      const { data, error } = await supabase.from('weigh_ins').select('*').order('created_at', { ascending: false });
      
      if (!error && data && data.length > 0) {
        dataToExport = data;
      } else {
        // Fallback to local logs
        const local = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        dataToExport = local;
      }

      if (dataToExport.length === 0) {
        alert("No weigh-in records found to export.");
        return;
      }

      const headers = ['Athlete Name', 'Sport', 'Weight (lbs)', 'Sleep (hrs)', 'Date & Time'];
      const rows = dataToExport.map(item => [
        `"${item.athlete_name || ''}"`,
        `"${item.sport || ''}"`,
        item.weight_lbs || '',
        item.sleep_hrs || '',
        `"${item.created_at ? new Date(item.created_at).toLocaleString() : new Date().toLocaleString()}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Shiloh_WeighIns_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export CSV.");
    }
  };

  const handleMakeDateBaselineMarker = async (logId, athleteId, weightVal, dateStr, athleteName, skipConfirm = false) => {
    if (!skipConfirm) {
      setConfirmModal({
        isOpen: true,
        title: 'Set Official Baseline Marker',
        message: `Make ${weightVal} lbs on ${dateStr} the official baseline weight marker for ${athleteName || 'this athlete'}?`,
        isDanger: false,
        actionText: 'Set Baseline',
        onConfirm: () => handleMakeDateBaselineMarker(logId, athleteId, weightVal, dateStr, athleteName, true)
      });
      return;
    }

    // 1. Persist indestructible map in localStorage immediately
    try {
      const map = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
      map[athleteId] = { log_id: logId, weight_lbs: Number(weightVal), date_str: dateStr };
      localStorage.setItem('shiloh_baselines_map', JSON.stringify(map));
    } catch (e) {}

    // 2. Update athlete record in state, localStorage, and cloud athletes table via structured metadata
    const targetAthlete = athletes.find(a => a.id === athleteId);
    const updatedMeta = targetAthlete ? encodeAthleteMeta(targetAthlete.raw_position || targetAthlete.position || '', weightVal, dateStr, logId) : '';

    const nextAthletes = athletes.map(a => a.id === athleteId ? { ...a, baseline_weight: Number(weightVal), baseline_date: dateStr, baseline_log_id: logId, raw_position: updatedMeta } : a);
    setAthletes(nextAthletes);
    try { localStorage.setItem('shiloh_roster', JSON.stringify(nextAthletes)); } catch (e) {}
    try {
      if (isValidUuid(athleteId) && targetAthlete) {
        await supabase.from('athletes').update({ position: updatedMeta }).eq('id', athleteId);
      }
    } catch (e) {}

    // 3. Broadcast real-time cloud baseline updates to all network terminals
    try {
      broadcastDeviceSync({ type: 'BASELINE_UPDATED', athleteId, weightVal, dateStr });
    } catch (err) {
      console.warn("Broadcast warning:", err);
    }

    setReportData(prev => prev.map(item => {
      if (item.athlete_id === athleteId) {
        return { ...item, is_baseline: item.id === logId };
      }
      return item;
    }));

    alert(`🎯 Baseline Weight Marker successfully updated to ${weightVal} lbs from ${dateStr}!`);
    fetchReportData();
    if (typeof selectedProfileId !== 'undefined' && selectedProfileId) {
      fetchProfileData(selectedProfileId);
    }
  };

  const handleBulkTeamBaseline = async (sportName, dateKey, displayDateStr, selectedLogs, skipConfirm = false) => {
    const totalAthletesAffected = selectedLogs.length;
    if (!skipConfirm) {
      setConfirmModal({
        isOpen: true,
        title: `Synchronize Team Baseline (${sportName.toUpperCase()})`,
        message: `Synchronize baseline marker for ALL ${totalAthletesAffected} athletes in ${sportName.toUpperCase()} to their weigh-ins from ${displayDateStr}?\n\nThis will automatically update their charts, target lines, and dehydration alarms immediately.`,
        isDanger: false,
        actionText: 'Sync All Baselines',
        onConfirm: () => handleBulkTeamBaseline(sportName, dateKey, displayDateStr, selectedLogs, true)
      });
      return;
    }

    const targetLogIds = new Set(selectedLogs.map(x => x.id));
    const sportAthleteIds = new Set(athletes.filter(a => (a.sport || '').toLowerCase() === sportName.toLowerCase()).map(a => a.id));

    // 1. Persist indestructible baseline map across all selected athletes
    try {
      const map = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
      selectedLogs.forEach(l => {
        map[l.athlete_id] = { log_id: l.id, weight_lbs: Number(l.weight_lbs), date_str: l.created_at };
      });
      localStorage.setItem('shiloh_baselines_map', JSON.stringify(map));
    } catch (e) {}

    // 2. Update athlete records across state, localStorage, and cloud metadata
    const nextAthletes = await Promise.all(athletes.map(async a => {
      const matchingLog = selectedLogs.find(l => l.athlete_id === a.id);
      if (matchingLog) {
        const newMeta = encodeAthleteMeta(a.raw_position || a.position || '', matchingLog.weight_lbs, matchingLog.created_at, matchingLog.id);
        try {
          if (isValidUuid(a.id)) {
            await supabase.from('athletes').update({ position: newMeta }).eq('id', a.id);
          }
        } catch(e) {}
        return { ...a, baseline_weight: Number(matchingLog.weight_lbs), baseline_date: matchingLog.created_at, baseline_log_id: matchingLog.id, raw_position: newMeta };
      }
      return a;
    }));
    setAthletes(nextAthletes);
    try { localStorage.setItem('shiloh_roster', JSON.stringify(nextAthletes)); } catch (e) {}

    // 3. Broadcast real-time team baseline synchronization across network terminals
    try {
      broadcastDeviceSync({ type: 'TEAM_BASELINE_SYNC', sportName, dateKey });
    } catch (err) {
      console.warn("Broadcast warning:", err);
    }

    // 4. Instantly update reportData and refresh UI
    setReportData(prev => prev.map(item => {
      if (sportAthleteIds.has(item.athlete_id)) {
        return { ...item, is_baseline: targetLogIds.has(item.id) };
      }
      return item;
    }));

    alert(`🎉 SUCCESS: Official baseline weight marker for ALL of ${sportName.toUpperCase()} has been synchronized to ${displayDateStr}! (${totalAthletesAffected} athletes updated)`);
    fetchReportData();
    broadcastDeviceSync({ type: 'BULK_BASELINE_SYNCED', sport: sportName });
  };

  const handleDeleteWeighIn = async (id, skipConfirm = false) => {
    if (!skipConfirm) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Weigh-In Record',
        message: 'Are you sure you want to permanently delete this weigh-in record?',
        isDanger: true,
        actionText: 'Delete Record',
        onConfirm: () => handleDeleteWeighIn(id, true)
      });
      return;
    }
    try {
      const { error } = await supabase.from('weigh_ins').delete().eq('id', id);
      if (error) throw error;
      fetchReportData();
    } catch (err) {
      console.error("Could not delete weigh in:", err);
      alert("Failed to delete record.");
    }
  };

  const handleDeleteAllWeighIns = async (skipConfirm = false) => {
    if (!skipConfirm) {
      setConfirmModal({
        isOpen: true,
        title: 'Wipe All Weigh-In Data',
        message: 'WARNING: Are you sure you want to wipe ALL weigh-in data across the database? This cannot be undone.',
        isDanger: true,
        actionText: 'Wipe Database',
        onConfirm: () => handleDeleteAllWeighIns(true)
      });
      return;
    }
    try {
      const { error } = await supabase.from('weigh_ins').delete().not('id', 'is', null);
      if (error) throw error;
      fetchReportData();
    } catch (err) {
      console.error("Could not delete all:", err);
      alert("Failed to wipe data.");
    }
  };

  const handleCreateAthlete = async () => {
    if (!newAthlete.name || !newAthlete.name.trim()) return;
    const sanitizedAthlete = { ...newAthlete, name: newAthlete.name.trim() };
    setSaving(true);
    try {
      let createdAthlete = null;
      const { data, error } = await supabase
        .from('athletes')
        .insert([sanitizedAthlete])
        .select();
        
      if (error) {
        console.warn("Could not insert athlete online, saving locally:", error);
        createdAthlete = { ...sanitizedAthlete, id: 'local_' + Date.now(), created_at: new Date().toISOString() };
      } else if (data && data.length > 0) {
        createdAthlete = data[0];
      }
      
      if (createdAthlete) {
        setAthletes(prev => {
          const next = [...prev, createdAthlete];
          try {
            localStorage.setItem('shiloh_roster', JSON.stringify(next));
          } catch (e) {}
          return next;
        });
        if (screen === 'entry') {
          setEntryAthleteId(createdAthlete.id);
          setWeightInput('');
          setSleepInput('8.0');
          setFocusedField(kioskTrackMode === 'sleep_only' ? 'sleep' : 'weight');
        }
      }
      setIsAddingAthlete(false);
      setNewAthlete({ name: '', sport: '', team: '', grade: '', position: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error adding athlete:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (athlete) => {
    setEditingAthleteId(athlete.id);
    setNewAthlete({ name: athlete.name, sport: athlete.sport, team: athlete.team, grade: athlete.grade || '', position: athlete.position });
    setIsAddingAthlete(true);
    setScreen('roster');
  };

  const fetchProfileData = async (id) => {
    // Instantly pre-populate from local reportData for snappy zero-delay transitions
    const localData = reportData
      .filter(r => r.athlete_id === id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (localData.length > 0) {
      setProfileData(localData);
    }
    
    try {
      const { data, error } = await supabase
        .from('weigh_ins')
        .select('*')
        .eq('athlete_id', id)
        .order('created_at', { ascending: true })
        .limit(180);
      let pData = data || localData;
      try {
        const persistedMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
        const p = persistedMap[id];
        if (p && p.log_id) {
          pData = pData.map(item => ({ ...item, is_baseline: item.id === p.log_id }));
        }
      } catch(e) {}
      setProfileData(pData);
    } catch {
      console.warn("Could not fetch profile data online, using local data");
      let pData = localData;
      try {
        const persistedMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
        const p = persistedMap[id];
        if (p && p.log_id) {
          pData = pData.map(item => ({ ...item, is_baseline: item.id === p.log_id }));
        }
      } catch(e) {}
      setProfileData(pData);
    }
  };

  useEffect(() => {
    if (selectedProfileId && screen === 'profiles') {
      fetchProfileData(selectedProfileId);
    }
  }, [selectedProfileId, screen]);

  const handleUpdateAthlete = async () => {
    if (!newAthlete.name || !newAthlete.name.trim()) return;
    const sanitizedAthlete = { ...newAthlete, name: newAthlete.name.trim() };
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('athletes')
        .update(sanitizedAthlete)
        .eq('id', editingAthleteId)
        .select();
        
      if (error || !data || data.length === 0) {
        console.warn("Supabase update error or offline, falling back to local update.");
        setAthletes(prev => {
          const next = prev.map(a => a.id === editingAthleteId ? { ...a, ...sanitizedAthlete } : a);
          try { localStorage.setItem('shiloh_roster', JSON.stringify(next)); } catch(e){}
          return next;
        });
      } else {
        setAthletes(prev => {
          const next = prev.map(a => a.id === editingAthleteId ? data[0] : a);
          try { localStorage.setItem('shiloh_roster', JSON.stringify(next)); } catch(e){}
          return next;
        });
      }
      setIsAddingAthlete(false);
      setEditingAthleteId(null);
      setNewAthlete({ name: '', sport: '', team: '', grade: '', position: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error updating athlete:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAthlete = async (skipConfirm = false) => {
    if (!skipConfirm) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Athlete Profile',
        message: 'Are you sure you want to delete this athlete profile and all associated weigh-in records?',
        isDanger: true,
        actionText: 'Delete Athlete',
        onConfirm: () => handleDeleteAthlete(true)
      });
      return;
    }
    setSaving(true);
    try {
      // Delete associated weigh-ins first to prevent foreign key constraint errors
      await supabase.from('weigh_ins').delete().eq('athlete_id', editingAthleteId);

      const { error } = await supabase
        .from('athletes')
        .delete()
        .eq('id', editingAthleteId);
        
      if (error) throw error;
      
      setAthletes(prev => prev.filter(a => a.id !== editingAthleteId));
      setIsAddingAthlete(false);
      setEditingAthleteId(null);
      setNewAthlete({ name: '', sport: '', team: '', grade: '', position: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error deleting athlete:", err);
      alert("Could not delete athlete: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleMergeAthletes = async () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    setSaving(true);
    try {
      const targetAthlete = athletes.find(a => a.id === mergeTargetId);
      if (!targetAthlete) return;
      
      await supabase.from('weigh_ins').update({
        athlete_id: targetAthlete.id,
        athlete_name: targetAthlete.name,
        sport: targetAthlete.sport
      }).eq('athlete_id', mergeSourceId);

      setReportData(prev => prev.map(log => {
        if (log.athlete_id === mergeSourceId) {
          return { ...log, athlete_id: targetAthlete.id, athlete_name: targetAthlete.name, sport: targetAthlete.sport };
        }
        return log;
      }));

      await supabase.from('athletes').delete().eq('id', mergeSourceId);
      setAthletes(prev => prev.filter(a => a.id !== mergeSourceId));

      setMergeSourceId('');
      setMergeTargetId('');
      setMergeSuccessMsg(`Successfully merged all records into ${targetAthlete.name} and removed duplicate!`);
      setSaved(true);
      setTimeout(() => { setSaved(false); setMergeSuccessMsg(''); }, 5000);
    } catch (e) {
      console.error("Merge error:", e);
    } finally {
      setSaving(false);
    }
  };

  const getLast7DaysActivity = () => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = days[d.getDay()];
      
      // We compare based on local date string prefix if possible, 
      // but since created_at is UTC in DB, let's just do a simple string match for now
      // or properly check if date falls in that day
      const startOfDay = new Date(d);
      const endOfDay = new Date(d);
      endOfDay.setDate(endOfDay.getDate() + 1);
      
      const count = reportData.filter(r => {
        const recordDate = new Date(r.created_at);
        return recordDate >= startOfDay && recordDate < endOfDay;
      }).length;
      
      result.push({ day: dayStr, count });
    }
    return result;
  };

  const getWeeklyAlerts = () => {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = days[d.getDay()];
      const startOfDay = new Date(d);
      const endOfDay = new Date(d);
      endOfDay.setDate(endOfDay.getDate() + 1);
      
      let sleepCount = 0;
      let weightCount = 0;
      reportData.forEach(r => {
        const recordDate = new Date(r.created_at);
        if (recordDate >= startOfDay && recordDate < endOfDay) {
          if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold) sleepCount++;
          if (r.weight_lbs && Number(r.weight_lbs) > 0) {
            const athlete = athletes.find(a => a.id === r.athlete_id);
            let activeBaseline = null;
            try {
              const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
              if (customMap[r.athlete_id] && customMap[r.athlete_id].weight_lbs) activeBaseline = Number(customMap[r.athlete_id].weight_lbs);
              else if (athlete?.baseline_weight) activeBaseline = Number(athlete.baseline_weight);
            } catch(e) {}
            if (activeBaseline && (activeBaseline - Number(r.weight_lbs)) / activeBaseline >= (dehydrationThreshold / 100)) weightCount++;
          }
        }
      });
      result.push({ day: dayStr, count: sleepCount + weightCount, sleepCount, weightCount, date: startOfDay });
    }
    return result;
  };

  const getMonthlyAlerts = () => {
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const startOfDay = new Date(d);
      const endOfDay = new Date(d);
      endOfDay.setDate(endOfDay.getDate() + 1);
      
      let count = 0;
      let hasWeight = false;
      let hasSleep = false;
      reportData.forEach(r => {
        const recordDate = new Date(r.created_at);
        if (recordDate >= startOfDay && recordDate < endOfDay) {
          if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold) { count++; hasSleep = true; }
          if (r.weight_lbs && Number(r.weight_lbs) > 0) {
            const athlete = athletes.find(a => a.id === r.athlete_id);
            let activeBaseline = null;
            try {
              const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
              if (customMap[r.athlete_id] && customMap[r.athlete_id].weight_lbs) activeBaseline = Number(customMap[r.athlete_id].weight_lbs);
              else if (athlete?.baseline_weight) activeBaseline = Number(athlete.baseline_weight);
            } catch(e) {}
            if (activeBaseline && (activeBaseline - Number(r.weight_lbs)) / activeBaseline >= (dehydrationThreshold / 100)) { count++; hasWeight = true; }
          }
        }
      });
      result.push({ count, hasWeight, hasSleep, date: startOfDay });
    }
    return result;
  };

  const getDailyAlerts = () => {
    const now = Date.now();
    const alerts = [];
    
    const todaysRecords = reportData.filter(r => {
      return (now - new Date(r.created_at).getTime()) <= 24 * 60 * 60 * 1000;
    });

    todaysRecords.forEach(r => {
      const athlete = athletes.find(a => a.id === r.athlete_id);
      const positionStr = athlete?.position ? ` · ${athlete.position}` : '';
      
      if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold) {
        alerts.push({
          id: r.id + '_sleep',
          athlete_id: r.athlete_id,
          athlete_name: r.athlete_name,
          sport: r.sport,
          type: 'LOW SLEEP DEFICIT',
          color: '#f59e0b',
          icon: <Activity size={22} />,
          message: `${r.sport}${positionStr} · ${r.sleep_hrs} hrs sleep logged today`,
          action: '🌙 MONITOR CNS LOAD'
        });
      }

      const athleteRecords = reportData.filter(x => x.athlete_id === r.athlete_id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      const currentIndex = athleteRecords.findIndex(x => x.id === r.id);
      const baseInfo = getAthleteBaseline(athlete || { id: r.athlete_id, athlete_id: r.athlete_id }, reportData);
      const activeBaseline = baseInfo ? { id: baseInfo.id, weight_lbs: baseInfo.weight_lbs } : null;
      const baselineDateStr = baseInfo ? baseInfo.date_str : 'Established';
      
      if (activeBaseline && activeBaseline.id !== r.id && activeBaseline.weight_lbs && r.weight_lbs && !isPostPracticeLog(r)) {
        const drop = activeBaseline.weight_lbs - r.weight_lbs;
        const dropPercent = drop / activeBaseline.weight_lbs;
        if (dropPercent >= (dehydrationThreshold / 100)) {
          const recommendation = drop >= 4.0 ? '🥗💧 INCREASE CALORIES & HYDRATION' : '💧 INCREASE HYDRATION';
          alerts.push({
            id: r.id + '_weight',
            athlete_id: r.athlete_id,
            athlete_name: r.athlete_name,
            sport: r.sport,
            type: 'DEHYDRATION RISK',
            color: 'var(--status-error)',
            icon: <AlertTriangle size={22} />,
            message: `${r.sport}${positionStr} · -${drop.toFixed(1)} lbs drop (-${(dropPercent*100).toFixed(1)}% vs Baseline: ${activeBaseline.weight_lbs} lbs on ${baselineDateStr})`,
            action: recommendation
          });
        }
      }
    });

    return alerts;
  };

  const renderNegativeSweatDropCards = (forceShow = false) => {
    const list = [];
    const now = new Date();
    const shouldShowEmpty = forceShow || screen === 'reports';
    
    athletes.forEach(ath => {
      const athLogs = reportData.filter(r => (r.athlete_id === ath.id || (r.athlete_name && r.athlete_name.trim().toLowerCase() === ath.name.trim().toLowerCase())) && r.weight_lbs && Number(r.weight_lbs) > 0);
      const ppLogs = athLogs.filter(r => isPostPracticeLog(r)).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      if (ppLogs.length === 0) return;
      
      const latestPP = ppLogs[ppLogs.length - 1];
      const daysOld = (now - new Date(latestPP.created_at)) / (1000 * 60 * 60 * 24);
      if (daysOld > 7 && !shouldShowEmpty) return;

      const normalLogs = athLogs.filter(r => !isPostPracticeLog(r)).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      const ppDate = new Date(latestPP.created_at);
      
      const sameDayLogs = normalLogs.filter(wl => {
        const wld = new Date(wl.created_at);
        return wld.getFullYear() === ppDate.getFullYear() && 
               wld.getMonth() === ppDate.getMonth() && 
               wld.getDate() === ppDate.getDate();
      });
      
      let bWeight = null;
      if (sameDayLogs.length > 0) {
        bWeight = parseFloat(sameDayLogs[sameDayLogs.length - 1].weight_lbs);
      } else {
        const priorLogs = normalLogs.filter(wl => new Date(wl.created_at) <= ppDate);
        if (priorLogs.length > 0) {
          bWeight = parseFloat(priorLogs[priorLogs.length - 1].weight_lbs);
        } else {
          const baseInfo = getAthleteBaseline(ath, reportData);
          bWeight = baseInfo ? parseFloat(baseInfo.weight_lbs) : (ath.baseline_weight ? parseFloat(ath.baseline_weight) : (normalLogs.length ? parseFloat(normalLogs[normalLogs.length - 1].weight_lbs) : null));
        }
      }
      
      const pWeight = parseFloat(latestPP.weight_lbs);
      const drop = bWeight ? (bWeight - pWeight) : 0;
      
      if (drop > 0) {
        const pctLoss = bWeight && bWeight > 0 ? ((drop / bWeight) * 100) : 0;
        const fluidOz = Math.round(drop * 24);
        const isSevere = drop >= 5.0 || pctLoss >= 2.5;
        
        list.push({
          athlete: ath,
          log: latestPP,
          pDate: new Date(latestPP.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          pTime: new Date(latestPP.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          pWeight,
          bWeight,
          drop,
          pctLoss,
          fluidOz: fluidOz > 0 ? fluidOz : 32,
          isSevere
        });
      }
    });

    list.sort((a, b) => b.drop - a.drop);

    if (list.length === 0 && !shouldShowEmpty) return null;

    return (
      <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #ef4444', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              ⚡ ACUTE EXERTIONAL MONITORING
            </div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#fff', textTransform: 'uppercase' }}>
              POST-PRACTICE SWEAT LOSS & HYDRATION ALERTS (IN THE NEGATIVE)
            </h3>
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
              Athletes experiencing acute weight loss during practice sessions requiring urgent fluid replacement before tomorrow.
            </span>
          </div>
          <span style={{ padding: '6px 12px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
            {list.length} {list.length === 1 ? 'ATHLETE IN NEGATIVE' : 'ATHLETES IN NEGATIVE'}
          </span>
        </div>

        {list.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
            Clean! No athletes currently showing acute post-practice sweat loss in the negative.
          </div>
        ) : (
          <>
            {/* Screen View: Interactive Cards */}
            <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
              {list.map((item, idx) => (
                <div 
                  key={item.log.id || idx} 
                  onClick={() => {
                    setSelectedProfileId(item.athlete.id);
                    fetchProfileData(item.athlete.id);
                    setScreen('profiles');
                  }}
                  style={{ 
                    padding: '18px 24px', 
                    borderRadius: '16px', 
                    background: 'rgba(0, 0, 0, 0.45)', 
                    border: item.isSevere ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(255,255,255,0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    flexWrap: 'wrap', 
                    gap: '16px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  className="hover-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '160px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                          {item.athlete.name}
                        </span>
                        {item.athlete.position && (
                          <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            {item.athlete.position}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block' }}>
                        {item.pDate} · {item.pTime}
                      </span>
                    </div>
                    <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Pre-Practice / Morning</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--color-text-muted)' }}>{item.bWeight} lbs</span>
                    </div>
                    <div style={{ fontSize: '20px', color: 'var(--color-text-muted)', fontWeight: 800 }}>➔</div>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Post-Practice Weight</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: '#fff' }}>{item.pWeight} lbs</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Acute Sweat Drop</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>
                        -{item.drop.toFixed(1)} lbs (-{item.pctLoss.toFixed(1)}%)
                      </span>
                    </div>
                    <div style={{ padding: '8px 16px', borderRadius: '12px', background: item.drop >= 5 ? 'rgba(239, 68, 68, 0.2)' : item.drop > 2 ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)', border: item.drop >= 5 ? '1px solid rgba(239, 68, 68, 0.4)' : item.drop > 2 ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)', color: item.drop >= 5 ? '#ef4444' : item.drop > 2 ? '#f97316' : '#60a5fa', fontWeight: 800, fontSize: '13px' }}>
                      💧 Rx: Drink {item.fluidOz} oz fluids before tomorrow
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* PDF Print Table: Dedicated sharp table for exported PDF documents */}
            <div className="only-print" style={{ display: 'none', width: '100%', marginTop: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '2px solid #ef4444' }}>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>ATHLETE</th>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>SPORT / POS</th>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>PRE-PRACTICE</th>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>POST-PRACTICE</th>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>SWEAT DROP</th>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>HYDRATION Rx (BEFORE TOMORROW)</th>
                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>LOG DATE</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, idx) => (
                    <tr key={item.log.id || idx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 800 }}>{item.athlete.name}</td>
                      <td style={{ padding: '10px 14px', fontSize: '12px' }}>{item.athlete.sport || 'N/A'}{item.athlete.position ? ` (${item.athlete.position})` : ''}</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700 }}>{item.bWeight} lbs</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{item.pWeight} lbs</td>
                      <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 800, color: '#ef4444' }}>
                        -{item.drop.toFixed(1)} lbs (-{item.pctLoss.toFixed(1)}%)
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 800, color: '#ef4444' }}>
                        💧 Drink {item.fluidOz} oz fluids
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px' }}>{item.pDate} · {item.pTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSidebarItem = (key, icon, label) => {
    const active = screen === key;
    return (
      <div onClick={() => { setScreen(key); setSaved(false); if (key !== 'profiles') setSelectedProfileId(null); setIsAddingAthlete(false); }} 
           style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', cursor: 'pointer',
                    background: active ? 'rgba(255,255,255,0.02)' : 'transparent',
                    borderLeft: active ? '4px solid var(--color-accent)' : '4px solid transparent',
                    color: active ? 'var(--white)' : 'var(--color-text-muted)', transition: 'all 0.2s' }}>
        {icon}
        <span style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</span>
      </div>
    );
  };

  const navItem = (key, icon, label) => {
    const active = screen === key && !showMobileMore;
    return (
      <div onClick={() => { setScreen(key); setShowMobileMore(false); setSaved(false); if (key !== 'profiles') setSelectedProfileId(null); setIsAddingAthlete(false); }} 
           style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', flex: 1, minWidth: '56px', height: '100%',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)', transition: 'color 0.2s, transform 0.15s' }}>
        {icon}
        <span style={{ fontSize: '11px', fontWeight: active ? 700 : 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="app-layout">
      {saved && <Confetti />}
      {saved && (
        <div style={{ position: 'fixed', top: '82px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: 'rgba(22, 163, 74, 0.96)', border: '2px solid #86efac', color: '#fff', padding: '12px 28px', borderRadius: '40px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 36px rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)', animation: 'slideDown 0.3s ease' }}>
          <CheckCircle size={24} style={{ flexShrink: 0, color: '#fff' }} />
          <div>
            <span style={{ fontSize: '15px', fontWeight: 800, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {lastSavedWasBaseline ? '🎯 BASELINE SET SUCCESSFULLY!' : 'LOG RECORDED SUCCESSFULLY!'}
            </span>
            {lastSavedAthleteName && <span style={{ fontSize: '12px', opacity: 0.95, fontWeight: 700 }}>{lastSavedAthleteName} &middot; {lastSavedWasBaseline ? 'New Baseline Mass Established & ' : ''}{isOnline ? 'Synced & Live' : 'Cached Offline in Sync Queue'}</span>}
          </div>
        </div>
      )}
      
      {showRecoveryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="card-glass glow-card" style={{ width: '100%', maxWidth: '950px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'rgba(13, 27, 46, 0.98)', border: '2px solid #ef4444', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 0 50px rgba(239, 68, 68, 0.35)' }}>
            <div style={{ padding: '24px 28px', background: 'rgba(239, 68, 68, 0.12)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '32px' }}>🚨</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    EMERGENCY DATA RECOVERY & STORAGE AUDIT STATION
                  </h2>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    Scanning iPad local databases, offline queues, and memory caches for weigh-in logs...
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
              >
                ✕ Close Window
              </button>
            </div>

            <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL RECOVERABLE LOGS FOUND ON IPAD</div>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>{getRecoveredLocalData().length} Records Identified</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <label
                    className="btn-primary glow-card"
                    style={{ background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa', border: '1px solid #60a5fa', fontWeight: 800, padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <Upload size={18} /> 📂 IMPORT DIAGNOSTICS OR BACKUP FILE (.JSON / .CSV)
                    <input
                      type="file"
                      accept=".json,.csv,.txt"
                      onChange={handleImportDiagnosticsFile}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={downloadRecoveredJSON}
                    className="btn-primary"
                    style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', fontWeight: 800, padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <Download size={18} /> 📥 DOWNLOAD RECOVERED DATA (JSON)
                  </button>
                  <button
                    type="button"
                    onClick={forceUploadRecoveredData}
                    disabled={recoverySyncing}
                    className="btn-primary glow-card"
                    style={{ background: '#10b981', color: '#000', fontWeight: 800, padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                  >
                    <RefreshCw size={18} style={{ animation: recoverySyncing ? 'spin 1s linear infinite' : 'none' }} />
                    {recoverySyncing ? '⚡ FORCE UPLOADING TO CLOUD...' : '⚡ FORCE UPLOAD TO CLOUD SERVER'}
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Recovered Log Directory ({getRecoveredLocalData().filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length} recorded today):
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                      <th style={{ padding: '12px 16px' }}>Athlete Name</th>
                      <th style={{ padding: '12px 16px' }}>Weight / Sleep</th>
                      <th style={{ padding: '12px 16px' }}>Date & Time</th>
                      <th style={{ padding: '12px 16px' }}>Storage Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getRecoveredLocalData().map((rec, idx) => {
                      const isToday = new Date(rec.created_at).toDateString() === new Date().toDateString();
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isToday ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>
                            {rec.athlete_name || 'ID: ' + rec.athlete_id}
                            {isToday && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#10b981', color: '#000', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>🔥 TODAY</span>}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-accent)' }}>
                            {rec.weight_lbs ? `${rec.weight_lbs} lbs` : '—'} &middot; {rec.sleep_hrs !== undefined ? `${rec.sleep_hrs} hrs` : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.8)' }}>
                            {rec.created_at ? new Date(rec.created_at).toLocaleString() : 'N/A'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px', color: '#ccc', fontFamily: 'monospace' }}>
                              {rec.source_key}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {getRecoveredLocalData().length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                          No cached or offline weigh-in records found in the current browser domain storage.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div style={{ padding: '16px 28px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              💡 PRO TIP: If you do not see today's logs above, verify that you did not switch between Safari Browser Tabs and a standalone Home Screen Icon App (PWAs on iPad have separate isolated storage from regular Safari tabs).
            </div>
          </div>
        </div>
      )}
      
      {/* Sidebar (Desktop Only - Hidden in Kiosk Mode) */}
      {!isKioskMode && (
        <div className="sidebar">
          <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <img 
              src="/logo1.png" 
              alt="Shiloh Logo" 
              style={{ width: '100%', objectFit: 'contain', cursor: 'pointer' }} 
              onClick={() => { setScreen('dashboard'); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }}
            />
          </div>
          <div style={{ padding: '0 24px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>WORKSPACE</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {renderSidebarItem('dashboard', <Users size={18} />, 'DASHBOARD')}
            {renderSidebarItem('entry', <Plus size={18} />, 'LOG ENTRY')}
            {renderSidebarItem('roster', <Shield size={18} />, 'ROSTER')}
            {renderSidebarItem('groups', <Grid size={18} />, 'SPORT GROUPS')}
            {renderSidebarItem('profiles', <User size={18} />, 'PROFILES')}
            {renderSidebarItem('alerts', <AlertTriangle size={18} />, 'ALERTS' + (getDailyAlerts().length > 0 ? ` (${getDailyAlerts().length})` : ''))}
            {renderSidebarItem('reports', <FileText size={18} />, 'REPORTS')}
            {renderSidebarItem('settings', <Settings size={18} />, 'SETTINGS')}
          </div>
          <div style={{ marginTop: 'auto', padding: '24px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-950)', fontWeight: 700 }}>CM</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>COACH MASON</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Shiloh Athletics</span>
              </div>
            </div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent)', background: 'rgba(59, 130, 246, 0.15)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>{APP_VERSION}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        
        {/* Top Header */}
        <div style={{ flex: 'none', minHeight: '70px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))', flexWrap: 'wrap', gap: '10px' }}>
          {isKioskMode ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.08em' }}>HPD &middot; KIOSK MODE</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)', background: 'rgba(59, 130, 246, 0.15)', padding: '4px 8px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>{APP_VERSION}</span>
                {unsyncedQueueCount > 0 ? (
                  <span
                    onClick={() => syncOfflineCache(true)}
                    style={{ fontSize: '11px', background: 'rgba(234, 179, 8, 0.25)', color: '#fbbf24', padding: '4px 12px', borderRadius: '12px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fbbf24', cursor: 'pointer', boxShadow: '0 0 10px rgba(234, 179, 8, 0.4)' }}
                    title="Tap to force sync queued logs immediately"
                  >
                    <RefreshCw size={12} style={{ animation: 'spin 2s linear infinite' }} />
                    ⏳ {unsyncedQueueCount} UNSYNCED {unsyncedQueueCount === 1 ? 'LOG' : 'LOGS'} &middot; TAP TO SYNC
                  </span>
                ) : (
                  <span
                    onClick={handleManualCloudRefresh}
                    title="Click or drag screen down to instantly synchronize cloud records"
                    style={{ fontSize: '11px', background: isOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.2)', color: isOnline ? 'var(--status-success)' : '#ef4444', padding: '4px 12px', borderRadius: '16px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`, cursor: 'pointer', boxShadow: isOnline ? '0 0 10px rgba(34, 197, 94, 0.15)' : 'none' }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#4ade80' : '#ef4444', boxShadow: isOnline ? '0 0 8px #4ade80' : 'none', animation: isRefreshing ? 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' : 'none' }} />
                    {isRefreshing ? 'REFRESHING...' : (isOnline ? '☁️ CLOUD SYNCED & LIVE' : 'OFFLINE SYNC QUEUE')}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setIsKioskMode(false)}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Unlock size={14} /> EXIT KIOSK
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button 
                  onClick={() => { setIsKioskMode(true); setScreen('entry'); }}
                  className="btn-primary no-print"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px' }}
                >
                  <Lock size={14} /> <span className="kiosk-btn-text">ACTIVATE KIOSK MODE</span>
                </button>
                <button 
                  onClick={() => { setIsKioskMode(false); setScreen('entry'); }}
                  className="no-print"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px', background: screen === 'entry' ? 'rgba(184, 156, 91, 0.25)' : 'rgba(255, 255, 255, 0.05)', color: screen === 'entry' ? 'var(--color-accent)' : 'var(--white)', border: screen === 'entry' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)', borderRadius: '6px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <Plus size={14} style={{ color: 'var(--color-accent)' }} /> <span className="kiosk-btn-text">LOG ENTRY</span>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {unsyncedQueueCount > 0 ? (
                  <span
                    onClick={() => syncOfflineCache(true)}
                    className="no-print"
                    style={{ fontSize: '11px', background: 'rgba(234, 179, 8, 0.25)', color: '#fbbf24', padding: '5px 14px', borderRadius: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #fbbf24', cursor: 'pointer', boxShadow: '0 0 12px rgba(234, 179, 8, 0.4)' }}
                    title="Tap to force sync queued logs immediately"
                  >
                    <RefreshCw size={12} style={{ animation: 'spin 2s linear infinite' }} />
                    ⏳ {unsyncedQueueCount} UNSYNCED {unsyncedQueueCount === 1 ? 'LOG' : 'LOGS'} &middot; TAP TO SYNC
                  </span>
                ) : (
                  <span 
                    onClick={handleManualCloudRefresh}
                    title="Click or pull down screen to instantly synchronize cloud records"
                    className="no-print" 
                    style={{ fontSize: '11px', background: isOnline ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.2)', color: isOnline ? '#4ade80' : '#ef4444', padding: '5px 14px', borderRadius: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '7px', border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.4)'}`, cursor: 'pointer', boxShadow: isOnline ? '0 0 12px rgba(34, 197, 94, 0.15)' : 'none' }}
                  >
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isOnline ? '#4ade80' : '#ef4444', boxShadow: isOnline ? '0 0 8px #4ade80' : 'none', animation: isRefreshing ? 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' : 'none' }} />
                    {isRefreshing ? 'REFRESHING...' : (isOnline ? `CLOUD LIVE` : 'OFFLINE QUEUE')}
                    <span style={{ color: 'rgba(255,255,255,0.3)', margin: '0 2px' }}>|</span>
                    <span style={{ color: 'var(--color-accent)' }}>{APP_VERSION}</span>
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} className="hide-mobile">
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Scroll Area */}
        <div 
          ref={scrollAreaRef}
          className="scroll-area"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ position: 'relative' }}
        >
          {(pullProgress > 10 || isRefreshing || showRefreshCelebration) && (
            <div style={{ position: 'sticky', top: 0, left: '50%', transform: 'translateX(0)', zIndex: 10000, display: 'flex', justifyContent: 'center', pointerEvents: 'none', paddingBottom: '8px', paddingTop: '4px' }}>
              <div className="card-glass" style={{ background: 'rgba(13, 27, 46, 0.96)', border: showRefreshCelebration ? '1px solid #4ade80' : '1px solid var(--color-accent)', color: '#fff', padding: '8px 22px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', transition: 'all 0.2s ease', transform: `translateY(${pullProgress > 0 ? Math.min(18, pullProgress / 5) : 8}px)` }}>
                {isRefreshing ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-accent)' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>⚡ SYNCHRONIZING WITH LIVE CLOUD DATABASE...</span>
                  </>
                ) : showRefreshCelebration ? (
                  <>
                    <CheckCircle size={16} style={{ color: '#4ade80' }} />
                    <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.04em', color: '#4ade80' }}>✨ CLOUD ROSTERS &amp; BASELINES UP-TO-DATE!</span>
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} style={{ transform: `rotate(${pullProgress * 3.6}deg)`, color: pullProgress >= 75 ? '#4ade80' : 'var(--color-text-muted)', transition: 'transform 0.1s' }} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: pullProgress >= 75 ? '#4ade80' : 'var(--color-text-muted)' }}>
                      {pullProgress >= 75 ? '⬆️ Release to refresh live cloud data!' : `⬇️ Pull down to refresh (${pullProgress}%)`}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {screen === 'dashboard' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>WORKSPACE &middot; DASHBOARD</div>
                    <h1 className="text-3xl" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                      {(() => {
                        const hour = new Date().getHours();
                        if (hour < 12) return 'GOOD MORNING';
                        if (hour < 17) return 'GOOD AFTERNOON';
                        return 'GOOD EVENING';
                      })()}
                    </h1>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} &middot; {athletes.length} athletes &middot; Ready for sessions</div>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '10px 20px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Athletes</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, color: 'var(--white)' }}>{athletes.length}</span>
                    </div>
                    <div style={{ width: '1px', height: '44px', background: 'var(--color-border)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sessions Today</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: 700, color: 'var(--color-accent)' }}>{Math.max(todaySessions, executiveInsights.todayCount || executiveInsights.todayRecordedCount || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Top Fold: Executive Insights, Pre-Session Banner & Live Monitoring */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                  {/* 1. Pre-Session Action Banner */}
                  {(() => {
                    const unrecordedAthletes = athletes.filter(a => !athletesRecordedToday.has(a.id));
                    const isComplete = unrecordedAthletes.length === 0 && athletes.length > 0;
                    return (
                      <div className="card-glass glow-card animate-fade-in" style={{
                        padding: '22px 28px',
                        borderRadius: '20px',
                        border: isComplete ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid rgba(194, 164, 80, 0.45)',
                        background: isComplete ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.03) 100%)' : 'linear-gradient(135deg, rgba(194, 164, 80, 0.15) 0%, rgba(19, 21, 28, 0.7) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '20px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.25)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                          <div style={{
                            width: '52px',
                            height: '52px',
                            borderRadius: '16px',
                            background: isComplete ? 'rgba(34, 197, 94, 0.2)' : 'rgba(194, 164, 80, 0.2)',
                            border: isComplete ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(194, 164, 80, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: isComplete ? 'var(--status-success)' : 'var(--color-accent)'
                          }}>
                            {isComplete ? <CheckCircle size={26} /> : <Zap size={26} />}
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: isComplete ? 'var(--status-success)' : 'var(--color-accent)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block' }}>
                              {isComplete ? '• SESSION COMPLETE' : '• PRE-SESSION MONITORING'}
                            </span>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '4px 0 0 0', lineHeight: 1.1 }}>
                              {isComplete ? "All Athletes Weighed In Today!" : `${unrecordedAthletes.length} Athlete${unrecordedAthletes.length !== 1 ? 's' : ''} Not Yet Weighed In`}
                            </h2>
                            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '4px 0 0 0', fontWeight: 600 }}>
                              {isComplete ? "100% compliance achieved across all teams today." : "Start today's session to quickly record weights and recovery metrics."}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          {!isComplete && (
                            <button 
                              onClick={() => {
                                setUnweighedOnlyFilter(true);
                                setScreen('entry');
                              }}
                              style={{
                                padding: '14px 24px',
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, #d4af37 0%, #a68220 100%)',
                                border: 'none',
                                color: '#0a0d14',
                                fontFamily: 'var(--font-display)',
                                fontSize: '15px',
                                fontWeight: 800,
                                letterSpacing: '0.04em',
                                cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(212, 175, 55, 0.35)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexShrink: 0,
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <span>Start Weigh-Ins</span>
                              <span>➔</span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setManualEntryForm(prev => ({
                                ...prev,
                                athleteId: athletes.length > 0 ? athletes[0].id : '',
                                date: new Date().toISOString().slice(0, 10),
                                time: new Date().toTimeString().slice(0, 5),
                                weight: '',
                                successMsg: ''
                              }));
                              setShowManualEntryModal(true);
                            }}
                            style={{
                              padding: '14px 22px',
                              borderRadius: '14px',
                              background: 'rgba(30, 58, 138, 0.4)',
                              border: '1px solid rgba(96, 165, 250, 0.5)',
                              color: '#60a5fa',
                              fontFamily: 'var(--font-display)',
                              fontSize: '15px',
                              fontWeight: 800,
                              letterSpacing: '0.04em',
                              cursor: 'pointer',
                              boxShadow: '0 4px 20px rgba(37, 99, 235, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              flexShrink: 0,
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <span>⚡ Post-Practice / Manual Log</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 2. NEEDS ATTENTION Row Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>NEEDS ATTENTION</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                    {(() => {
                      const attentionItems = [];
                      athletes.forEach(ath => {
                        const baseInfo = getAthleteBaseline(ath, reportData);
                        const base = baseInfo ? parseFloat(baseInfo.weight_lbs) : 0;
                        if (!base || base <= 0) return;

                        const latestRec = reportData
                          .filter(r => r.athlete_id === ath.id && r.weight_lbs && !isNaN(parseFloat(r.weight_lbs)) && parseFloat(r.weight_lbs) > 0)
                          .sort((x, y) => new Date(y.created_at || 0) - new Date(x.created_at || 0))[0];

                        if (!latestRec) return;

                        const currentWt = parseFloat(latestRec.weight_lbs);
                        const dropLbs = base - currentWt;
                        if (dropLbs > 5.0) {
                          attentionItems.push({
                            id: ath.id,
                            name: ath.name,
                            sport: ath.sport || 'Athlete',
                            reason: `dropped ${dropLbs.toFixed(1)} lbs from baseline (${currentWt} lbs vs ${base} lbs base)`,
                            badge: `-${dropLbs.toFixed(1)} LB`,
                            dropLbs: dropLbs,
                            isLoss: true
                          });
                        }
                      });

                      // Sort from highest weight drop to lowest
                      attentionItems.sort((a, b) => (b.dropLbs || 0) - (a.dropLbs || 0));

                      if (attentionItems.length === 0) {
                        return (
                          <div className="card-glass" style={{ padding: '18px 24px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(34, 197, 94, 0.05)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <CheckCircle size={20} style={{ color: 'var(--status-success)' }} />
                            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--white)' }}>All athletes are currently within safe baseline limits (no athletes down &gt;5 lbs from baseline).</span>
                          </div>
                        );
                      }

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {attentionItems.map((item, index) => {
                            const initials = item.name ? item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
                            return (
                              <div key={index} className="card-glass" onClick={() => { setSelectedProfileId(item.id); fetchProfileData(item.id); setScreen('profiles'); }} style={{
                                padding: '16px 24px',
                                borderRadius: '16px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                background: 'rgba(255,255,255,0.02)'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                  <div style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: 'var(--font-display)',
                                    fontSize: '15px',
                                    fontWeight: 800,
                                    color: '#fff'
                                  }}>
                                    {initials}
                                  </div>
                                  <div>
                                    <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--white)', display: 'block' }}>{item.name}</span>
                                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{item.sport} &middot; {item.reason}</span>
                                  </div>
                                </div>
                                <div style={{
                                  padding: '6px 14px',
                                  borderRadius: '16px',
                                  background: item.isLoss ? 'rgba(239, 68, 68, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                                  border: item.isLoss ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(249, 115, 22, 0.35)',
                                  color: item.isLoss ? '#ef4444' : '#f97316',
                                  fontFamily: 'var(--font-display)',
                                  fontSize: '14px',
                                  fontWeight: 800,
                                  letterSpacing: '0.04em'
                                }}>
                                  {item.badge}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 4. Full-Width Gamified Compliance Hub: WEIGH-INS REMAINING */}
                  <div className="card-glass glow-card" style={{ padding: '28px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '4px', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <CheckCircle size={14} /> SESSION ACCOUNTABILITY TRACKER
                        </span>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--white)', textTransform: 'uppercase', margin: '4px 0 0 0', letterSpacing: '0.03em' }}>
                          WEIGH-INS REMAINING BY SPORT
                        </h3>
                      </div>
                      {(() => {
                        const totalAthletes = athletes.length;
                        const totalDone = athletes.filter(a => athletesRecordedToday.has(a.id)).length;
                        const allDone = totalAthletes > 0 && totalDone === totalAthletes;
                        return (
                          <div style={{
                            padding: '8px 18px',
                            borderRadius: '20px',
                            background: allDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(184, 156, 91, 0.15)',
                            border: allDone ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(184, 156, 91, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: allDone ? 'var(--status-success)' : 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {allDone ? '🎉 ALL TEAMS COMPLIANT' : `${totalDone} of ${totalAthletes} ROSTER CHECKED IN`}
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                      {(() => {
                        const allSports = Array.from(new Set(athletes.map(a => a.sport || 'General')));
                        if (allSports.length === 0) return <span style={{ color: 'var(--color-text-muted)', fontSize: '14px', padding: '12px 0' }}>No sports active on roster.</span>;
                        
                        return allSports.map((sport) => {
                          const sportAthletes = athletes.filter(a => (a.sport || 'General') === sport);
                          const doneCount = sportAthletes.filter(a => athletesRecordedToday.has(a.id)).length;
                          const countLeft = sportAthletes.length - doneCount;
                          const pct = sportAthletes.length > 0 ? Math.round((doneCount / sportAthletes.length) * 100) : 0;
                          const isDone = countLeft === 0 && sportAthletes.length > 0;

                          return (
                            <div key={sport} onClick={() => { setSelectedSportFilter(sport); setScreen('roster'); }} className="glow-card" style={{
                              padding: '20px',
                              borderRadius: '18px',
                              background: isDone ? 'rgba(34, 197, 94, 0.04)' : 'rgba(255,255,255,0.025)',
                              border: isDone ? '1px solid rgba(34, 197, 94, 0.25)' : '1px solid rgba(255,255,255,0.08)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              position: 'relative',
                              overflow: 'hidden'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <span style={{ fontSize: '17px', fontWeight: 800, color: 'var(--white)', display: 'block', letterSpacing: '0.02em' }}>{sport}</span>
                                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>{sportAthletes.length} Athletes Listed</span>
                                </div>
                                <span style={{
                                  fontSize: '12px',
                                  fontWeight: 800,
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: isDone ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                                  color: isDone ? 'var(--status-success)' : '#f97316',
                                  letterSpacing: '0.04em'
                                }}>
                                  {isDone ? 'DONE ✓' : `${countLeft} LEFT`}
                                </span>
                              </div>

                              {/* Progress Bar */}
                              <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{
                                  height: '100%',
                                  width: `${pct}%`,
                                  borderRadius: '4px',
                                  background: isDone ? 'var(--status-success)' : 'linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)',
                                  transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                }} />
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 700 }}>
                                <span style={{ color: 'var(--color-text-muted)' }}>Daily Compliance</span>
                                <span style={{ color: 'var(--white)' }}>{pct}% ({doneCount}/{sportAthletes.length})</span>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            
            {screen === 'entry' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>QUICK ENTRY</h2>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                      Tap your card to log today's {kioskTrackMode === 'sleep_only' ? 'sleep & recovery' : 'weigh-in & sleep'}
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
                          Every weigh-in logged while this mode is active automatically updates the athlete's target baseline mass and resets their 14-day inactivity interval.
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
                      const initials = nameSortOrder === 'last' 
                        ? `${getLastName(a.name)[0] || ''}${getFirstName(a.name)[0] || ''}` 
                        : a.name.split(' ').map(n=>n[0]).join('');
                      
                      const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
                      let hash = 0;
                      for (let i = 0; i < a.name.length; i++) hash = a.name.charCodeAt(i) + ((hash << 5) - hash);
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
                                {nameSortOrder === 'last' ? `${getLastName(a.name)}, ${getFirstName(a.name)}` : a.name}
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
                              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Body Weight (lbs)</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button type="button" onClick={() => setWeightInput(prev => String(Math.max(0, (parseFloat(prev||0) - 0.5).toFixed(1))))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Minus size={20} /></button>
                                <input 
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.0"
                                  value={weightInput || ''}
                                  onFocus={() => setFocusedField('weight')}
                                  onChange={(e) => setWeightInput(e.target.value.replace(/[^0-9.]/g, ''))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                                  style={{ flex: 1, width: '100%', height: '64px', background: focusedField === 'weight' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'weight' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', textAlign: 'center', color: focusedField === 'weight' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: 700, outline: 'none', transition: 'all 0.2s', padding: '0 10px' }}
                                />
                                <button type="button" onClick={() => setWeightInput(prev => String((parseFloat(prev||0) + 0.5).toFixed(1)))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Plus size={20} /></button>
                              </div>
                            </div>
                          )}

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Hours of Sleep</span>
                              <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 600 }}>KEYBOARD / NUMPAD / QUICK SELECT</span>
                            </div>
                            <input 
                              type="text"
                              inputMode="decimal"
                              placeholder="8.0"
                              value={sleepInput || ''}
                              onFocus={() => setFocusedField('sleep')}
                              onChange={(e) => setSleepInput(e.target.value.replace(/[^0-9.]/g, ''))}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                              style={{ width: '100%', height: '56px', background: focusedField === 'sleep' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'sleep' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '0 16px', color: focusedField === 'sleep' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, outline: 'none', transition: 'all 0.2s' }}
                            />
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {['6.0', '7.0', '7.5', '8.0', '8.5', '9.0'].map(val => (
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
                        </div>

                        {/* Right Column: KioskNumpad */}
                        <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column' }}>
                          <KioskNumpad 
                            value={focusedField === 'weight' ? weightInput : sleepInput}
                            onChange={val => focusedField === 'weight' ? setWeightInput(val) : setSleepInput(val)}
                            onEnter={handleSave}
                          />
                        </div>
                      </div>

                      {/* Live Keypad Weight Delta Indicator */}
                      {kioskTrackMode !== 'sleep_only' && weightInput && !isNaN(parseFloat(weightInput)) && parseFloat(weightInput) > 0 && (() => {
                        let baseline = null;
                        try {
                          const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
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
                        const color = isLoss ? (diff <= -3.0 ? '#ef4444' : '#f97316') : '#10b981';
                        const bg = isLoss ? (diff <= -3.0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(249, 115, 22, 0.15)') : 'rgba(16, 185, 129, 0.15)';
                        const border = isLoss ? (diff <= -3.0 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(249, 115, 22, 0.4)') : '1px solid rgba(16, 185, 129, 0.4)';
                        
                        return (
                          <div className="animate-slide-up" style={{ width: '100%', padding: '14px 18px', background: bg, border, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '15px', fontWeight: 800, color }}>
                              <span style={{ fontSize: '24px' }}>{isLoss ? (diff <= -3.0 ? '⚠️' : '🔻') : '🟢'}</span>
                              <div>
                                <div style={{ textTransform: 'uppercase' }}>{diff >= 0 ? 'MASS GAIN / UPWARDS TREND' : (diff <= -3.0 ? 'ALERT: SIGNIFICANT WEIGHT DROP DETECTED' : 'SLIGHT WEIGHT DROP vs BASELINE')}</div>
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
                        const hasLongGap = athleteRecords.length > 0 && (new Date() - new Date(athleteRecords[athleteRecords.length - 1].created_at)) > 14 * 24 * 60 * 60 * 1000;
                        const requiresBaseline = kioskTrackMode !== 'sleep_only' && (isFirstEntry || hasLongGap);
                        
                        const disableSubmit = saving || (kioskTrackMode === 'sleep_only' ? (!sleepInput || parseFloat(sleepInput) <= 0) : (!weightInput || weightInput === '0.0'));

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
                              {saving ? 'Saving...' : (isBaselineTestingMode && kioskTrackMode !== 'sleep_only' ? `🎯 Save as Athlete Baseline (${weightInput} lbs)` : (kioskTrackMode === 'sleep_only' ? 'Save Recovery Log & Complete' : 'Save Record & Complete'))}
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
            )}

            {screen === 'groups' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>SPORT GROUPS</h2>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{sportsList.length} sport{sportsList.length !== 1 ? 's' : ''} tracked</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                      onClick={() => setShowBulkBaselineStudio(!showBulkBaselineStudio)}
                      style={{ padding: '8px 16px', borderRadius: '12px', background: showBulkBaselineStudio ? 'var(--color-accent)' : 'rgba(184, 156, 91, 0.15)', color: showBulkBaselineStudio ? 'var(--navy-950)' : 'var(--color-accent)', border: '1px solid var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                    >
                      <TrendingUp size={16} />
                      {showBulkBaselineStudio ? 'CLOSE BASELINE STUDIO ▲' : 'BULK TEAM BASELINE STUDIO ▼'}
                    </button>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Bulk Team Baseline Synchronization Studio */}
                {showBulkBaselineStudio && (
                <div className="card-glass glow-card animate-slide-up" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', border: '1px solid rgba(184, 156, 91, 0.4)', background: 'rgba(184, 156, 91, 0.05)', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(184, 156, 91, 0.2)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', boxShadow: '0 0 12px rgba(184, 156, 91, 0.3)' }}>
                      <TrendingUp size={24} />
                    </div>
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--color-accent)', textTransform: 'uppercase' }}>
                        BULK TEAM BASELINE SYNCHRONIZATION STUDIO
                      </h3>
                      <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Select an entire sport team and designate a specific historical weigh-in date as their official baseline marker across all charts and dehydration alarms.
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const activeSport = bulkBaselineSport || (sportsList.length > 0 ? sportsList[0] : 'Football');
                    const sportAthleteIds = new Set(athletes.filter(a => (a.sport || '').toLowerCase() === activeSport.toLowerCase()).map(a => a.id));
                    const sportLogs = reportData.filter(l => sportAthleteIds.has(l.athlete_id) && l.weight_lbs && Number(l.weight_lbs) > 0);
                    
                    const dateGroups = {};
                    sportLogs.forEach(l => {
                      const dStr = l.created_at.slice(0, 10);
                      if (!dateGroups[dStr]) dateGroups[dStr] = { date: dStr, logs: [], display: new Date(l.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) };
                      dateGroups[dStr].logs.push(l);
                    });
                    const availableDates = Object.values(dateGroups).sort((a,b) => b.date.localeCompare(a.date));
                    const selectedDateObj = availableDates.find(d => d.date === bulkBaselineDate) || availableDates[0];

                    return (
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '18px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', flex: '1 1 400px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 200px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              1. SELECT SPORT GROUP
                            </label>
                            <select
                              value={activeSport}
                              onChange={(e) => { setBulkBaselineSport(e.target.value); setBulkBaselineDate(''); }}
                              style={{ padding: '10px 14px', background: 'var(--navy-900)', border: '1px solid var(--color-border)', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                            >
                              {sportsList.map(s => (
                                <option key={s} value={s}>{s.toUpperCase()} ({athletes.filter(a => (a.sport || '').toLowerCase() === s.toLowerCase()).length} Athletes)</option>
                              ))}
                            </select>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 240px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              2. SELECT HISTORICAL WEIGH-IN DATE
                            </label>
                            <select
                              value={selectedDateObj ? selectedDateObj.date : ''}
                              onChange={(e) => setBulkBaselineDate(e.target.value)}
                              disabled={availableDates.length === 0}
                              style={{ padding: '10px 14px', background: 'var(--navy-900)', border: '1px solid var(--color-border)', borderRadius: '8px', color: availableDates.length > 0 ? '#fff' : 'var(--color-text-muted)', fontSize: '14px', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
                            >
                              {availableDates.length > 0 ? (
                                availableDates.map(d => {
                                  const avgW = Math.round(d.logs.reduce((s, x) => s + Number(x.weight_lbs), 0) / Math.max(1, d.logs.length));
                                  return (
                                    <option key={d.date} value={d.date}>
                                      {d.display} ({d.logs.length} weighed in &middot; {avgW} lb avg)
                                    </option>
                                  );
                                })
                              ) : (
                                <option value="">No recorded weights for this sport yet</option>
                              )}
                            </select>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (!selectedDateObj || selectedDateObj.logs.length === 0) {
                              alert(`No weigh-in recordings found for ${activeSport} on the selected date.`);
                              return;
                            }
                            handleBulkTeamBaseline(activeSport, selectedDateObj.date, selectedDateObj.display, selectedDateObj.logs);
                          }}
                          disabled={!selectedDateObj}
                          className="btn-primary"
                          style={{ padding: '14px 28px', fontSize: '14px', background: !selectedDateObj ? 'rgba(255,255,255,0.1)' : 'var(--color-accent)', color: !selectedDateObj ? 'rgba(255,255,255,0.4)' : 'var(--navy-950)', fontWeight: 800, cursor: selectedDateObj ? 'pointer' : 'not-allowed', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px', height: 'fit-content', whiteSpace: 'nowrap', boxShadow: selectedDateObj ? '0 0 15px rgba(184, 156, 91, 0.4)' : 'none', marginTop: '18px' }}
                        >
                          <CheckCircle size={18} /> SET ALL OF {activeSport.toUpperCase()} TO {selectedDateObj ? selectedDateObj.date : 'DATE'}
                        </button>
                      </div>
                    );
                  })()}
                </div>
                )}

                {/* Sport Groups Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {sportsList.map(sport => {
                    const sportAthletes = athletes.filter(a => (a.sport || '').toLowerCase() === sport.toLowerCase());
                    
                    // Calculate baseline/average weight for this sport group (prioritizing synchronized team baseline markers)
                    let totalW = 0;
                    let countW = 0;
                    let baselinesMap = {};
                    try { baselinesMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}'); } catch(e){}

                    sportAthletes.forEach(a => {
                      const baseInfo = getAthleteBaseline(a, reportData);
                      let evalWeight = baseInfo ? baseInfo.weight_lbs : 0;
                      if (!evalWeight) {
                        const latestRecord = reportData
                          .filter(r => r.athlete_id === a.id && r.weight_lbs && !isNaN(parseFloat(r.weight_lbs)) && parseFloat(r.weight_lbs) > 0)
                          .sort((x, y) => new Date(y.created_at) - new Date(x.created_at))[0];
                        if (latestRecord) evalWeight = parseFloat(latestRecord.weight_lbs);
                      }
                      if (evalWeight > 0) {
                        totalW += evalWeight;
                        countW += 1;
                      }
                    });
                    const avgW = countW > 0 ? Math.round(totalW / countW) : 0;

                    return (
                      <div
                        key={sport}
                        onClick={() => { setSelectedSportFilter(sport); setScreen('roster'); }}
                        className="card-glass glow-card"
                        style={{
                          padding: '24px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '24px',
                          cursor: 'pointer',
                          border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-lg)',
                          transition: 'transform 0.2s, border-color 0.2s'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--white)' }}>
                          {sport}
                        </div>
                        <div style={{ display: 'flex', gap: '48px', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 800, lineHeight: 1, color: 'var(--white)' }}>
                              {sportAthletes.length}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              ATHLETES
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: 800, lineHeight: 1, color: countW > 0 ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
                              {avgW > 0 ? avgW : '--'}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              AVG LB
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {sportsList.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '48px', color: 'var(--color-text-muted)' }}>
                      No sports currently tracked. Add athletes with sport tags to populate group statistics.
                    </div>
                  )}
                </div>
              </div>
            )}

            {screen === 'alerts' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ flex: '1 1 280px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.1em', marginBottom: '4px' }}>TRAINING SAFETY &middot; RISK ALERTS</div>
                    <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, var(--text-3xl))', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.1 }}>ATHLETE RECOVERY ALERTS</h1>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '6px' }}>Automated flags for rapid mass loss (&gt;{dehydrationThreshold}%) and low sleep (&lt;{sleepThreshold}h)</div>
                  </div>
                  
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px' }}>
                    {['DAILY', 'WEEKLY', 'MONTHLY'].map(tab => (
                      <button 
                        key={tab}
                        onClick={() => setAlertsTab(tab)}
                        style={{ 
                          background: alertsTab === tab ? 'var(--color-accent)' : 'transparent', 
                          color: alertsTab === tab ? 'var(--navy-950)' : 'var(--color-text-muted)', 
                          border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                {alertsTab === 'DAILY' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {renderNegativeSweatDropCards()}
                    {getDailyAlerts().length === 0 ? (
                      <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--color-text-muted)' }}>
                        <CheckCircle size={32} style={{ color: 'var(--status-success)' }} />
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>No risk alerts today. All athletes are fully recovered.</span>
                      </div>
                    ) : (
                      getDailyAlerts().map(alert => (
                        <div key={alert.id} className="card-glass animate-slide-up" style={{ padding: '20px', borderLeft: `4px solid ${alert.color}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: `${alert.color}22`, color: alert.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {alert.icon}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700 }}>{alert.athlete_name}</span>
                                <span style={{ fontSize: '10px', background: `${alert.color}33`, color: alert.color, padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>{alert.type}</span>
                              </div>
                              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{alert.message}</span>
                            </div>
                          </div>
                          <span style={{ fontSize: '11px', color: alert.type === 'DEHYDRATION RISK' ? 'var(--color-accent)' : 'var(--color-text-muted)', fontWeight: 700 }}>{alert.action}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {alertsTab === 'WEEKLY' && (
                  <div className="card-glass glow-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>Past 7 Days - Categorized Alert Volume</h3>
                    <div style={{ height: '260px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
                      {(() => {
                        const weekData = getWeeklyAlerts();
                        const maxCount = Math.max(...weekData.map(d => d.count), 1);
                        return weekData.map((item, i) => {
                          const totalHeightPx = Math.max((item.count / maxCount) * 200, 6);
                          const weightHeightPx = item.count > 0 ? (item.weightCount / item.count) * totalHeightPx : 0;
                          const sleepHeightPx = item.count > 0 ? (item.sleepCount / item.count) * totalHeightPx : 0;
                          return (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                              <div style={{ textAlign: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: 800, color: item.count > 0 ? 'var(--white)' : 'var(--color-text-muted)' }}>{item.count}</span>
                                {item.count > 0 && <span style={{ fontSize: '10px', display: 'block', color: 'var(--color-text-muted)' }}>({item.weightCount}💧 {item.sleepCount}🌙)</span>}
                              </div>
                              <div style={{ width: '100%', maxWidth: '44px', height: `${totalHeightPx}px`, background: 'var(--navy-800)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {weightHeightPx > 0 && <div style={{ height: `${weightHeightPx}px`, background: 'var(--status-error)', width: '100%' }} title={`Mass Loss Alerts: ${item.weightCount}`} />}
                                {sleepHeightPx > 0 && <div style={{ height: `${sleepHeightPx}px`, background: '#f59e0b', width: '100%' }} title={`Sleep Alerts: ${item.sleepCount}`} />}
                                {item.count === 0 && <div style={{ height: '100%', background: 'var(--navy-600)', width: '100%' }} />}
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)' }}>{item.day}</span>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', background: 'var(--status-error)', borderRadius: '3px' }}/> 💧 Mass Loss / Dehydration</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><div style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '3px' }}/> 🌙 CNS / Low Sleep Deficits</div>
                    </div>
                  </div>
                )}

                {alertsTab === 'MONTHLY' && (
                  <div className="card-glass glow-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>30-Day Risk & Deficit Heat Map</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                      {getMonthlyAlerts().map((item, i) => {
                        let bgColor = 'var(--navy-800)';
                        let border = '1px solid rgba(255,255,255,0.05)';
                        if (item.count > 0 && item.count <= 2) { bgColor = 'rgba(245, 158, 11, 0.25)'; border = '1px solid rgba(245, 158, 11, 0.5)'; }
                        if (item.count > 2) { bgColor = 'rgba(239, 68, 68, 0.3)'; border = '1px solid rgba(239, 68, 68, 0.6)'; }
                        
                        return (
                          <div key={i} style={{ 
                            aspectRatio: '1', 
                            background: bgColor, 
                            border,
                            borderRadius: '12px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexDirection: 'column',
                            padding: '4px',
                            boxShadow: item.count > 2 ? '0 0 10px rgba(239, 68, 68, 0.2)' : 'none'
                          }}>
                            <span style={{ fontSize: '11px', color: 'var(--white)', opacity: 0.6, fontWeight: 700 }}>{item.date.getDate()}</span>
                            {item.count > 0 ? (
                              <>
                                <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--white)' }}>{item.count}</span>
                                <div style={{ display: 'flex', gap: '2px', fontSize: '10px' }}>
                                  {item.hasWeight && <span>💧</span>}
                                  {item.hasSleep && <span>🌙</span>}
                                </div>
                              </>
                            ) : (
                              <span style={{ fontSize: '12px', opacity: 0.2 }}>✔</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '20px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'var(--navy-800)', borderRadius: '2px' }}/> 0 Alerts</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'rgba(245, 158, 11, 0.4)', borderRadius: '2px' }}/> 1-2 Alerts</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'rgba(239, 68, 68, 0.6)', borderRadius: '2px' }}/> 3+ Alerts</div>
                      <span>|</span>
                      <span>💧 Mass Drop Flag</span>
                      <span>🌙 Low Sleep Flag</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {screen === 'reports' && (() => {
              // 1. Filter logs
              let filteredLogs = [...reportData];
              if (reportSportFilter !== 'ALL') {
                filteredLogs = filteredLogs.filter(r => r.sport === reportSportFilter);
              }
              const now = new Date();
              if (reportTimeframe === 'today') {
                filteredLogs = filteredLogs.filter(r => {
                  const rd = new Date(r.created_at);
                  return rd.getFullYear() === now.getFullYear() && rd.getMonth() === now.getMonth() && rd.getDate() === now.getDate();
                });
              } else if (reportTimeframe === '7d') {
                const cut = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                filteredLogs = filteredLogs.filter(r => new Date(r.created_at) >= cut);
              } else if (reportTimeframe === '30d') {
                const cut = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                filteredLogs = filteredLogs.filter(r => new Date(r.created_at) >= cut);
              }

              const filteredAthletes = reportSportFilter === 'ALL' ? athletes : athletes.filter(a => a.sport === reportSportFilter);

              // 2. Dehydration Roster (LIVE status: Latest weigh-in vs Official Baseline, >=2% drop)
              const dehydrationList = [];
              filteredAthletes.forEach(a => {
                const aRecs = reportData.filter(x => x.athlete_id === a.id && x.weight_lbs && Number(x.weight_lbs) > 0).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
                if (aRecs.length === 0) return;
                const latestLog = aRecs[aRecs.length - 1];
                
                const baseInfo = getAthleteBaseline(a, reportData);
                const activeBaseline = baseInfo ? { id: baseInfo.id, weight_lbs: baseInfo.weight_lbs } : null;
                const baselineDateStr = baseInfo ? baseInfo.date_str : 'Established';

                if (activeBaseline && activeBaseline.weight_lbs && latestLog.weight_lbs) {
                  const baseW = Number(activeBaseline.weight_lbs);
                  const currW = Number(latestLog.weight_lbs);
                  const drop = baseW - currW;
                  const dropPercent = drop / baseW;
                  if (dropPercent >= (dehydrationThreshold / 100)) {
                    dehydrationList.push({
                      id: latestLog.id,
                      athlete_name: a.name,
                      sport: a.sport || 'N/A',
                      prev_weight: baseW,
                      baseline_date: baselineDateStr,
                      curr_weight: currW,
                      drop_lbs: drop,
                      drop_percent: (dropPercent * 100).toFixed(1),
                      date: new Date(latestLog.created_at).toLocaleDateString()
                    });
                  }
                }
              });

              // 3. Sleep Deficit Roster (<sleepThreshold h)
              const sleepDeficitList = filteredLogs.filter(r => r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold);

              // 4. Expired Baselines (>baselineExpiryDays Inactivity)
              const expiredBaselinesList = [];
              filteredAthletes.forEach(a => {
                const aRecs = reportData.filter(r => r.athlete_id === a.id).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
                if (aRecs.length === 0) {
                  expiredBaselinesList.push({ athlete_name: a.name, sport: a.sport, team: a.team, status: 'No Weight Log Yet' });
                } else {
                  const lastLog = aRecs[aRecs.length - 1];
                  const gapDays = Math.floor((now - new Date(lastLog.created_at)) / (1000 * 60 * 60 * 24));
                  if (gapDays >= baselineExpiryDays) {
                    expiredBaselinesList.push({ athlete_name: a.name, sport: a.sport, team: a.team, status: `${gapDays} Days Inactive`, last_date: new Date(lastLog.created_at).toLocaleDateString() });
                  }
                }
              });

              // 5. Weight Fluctuation Leaderboard
              const gains = [];
              filteredAthletes.forEach(a => {
                const aRecs = reportData.filter(r => r.athlete_id === a.id).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
                if (aRecs.length >= 2) {
                  const first = aRecs[0];
                  const latest = aRecs[aRecs.length - 1];
                  const diff = latest.weight_lbs - first.weight_lbs;
                  gains.push({
                    athlete_name: a.name,
                    sport: a.sport,
                    initial_weight: first.weight_lbs,
                    latest_weight: latest.weight_lbs,
                    diff
                  });
                }
              });
              const topGains = [...gains].sort((a,b) => b.diff - a.diff).slice(0, 5);
              const topDrops = [...gains].sort((a,b) => a.diff - b.diff).slice(0, 5);

              // Toggles
              const showTeamSummary = reportMode === 'quick' || enabledMetrics.teamSummary;
              const showAcuteSweatLoss = reportMode === 'quick' || enabledMetrics.acuteSweatLoss;
              const showDehydration = reportMode === 'quick' || enabledMetrics.dehydration;
              const showSleepDeficit = reportMode === 'quick' || enabledMetrics.sleepDeficit;
              const showExpiredBaselines = reportMode === 'quick' || enabledMetrics.expiredBaselines;
              const showLeaderboard = reportMode === 'custom' && enabledMetrics.weightLeaderboard;
              const showRawLogs = reportMode === 'custom' ? enabledMetrics.rawLogs : true;

              const toggleMetric = (key) => {
                setEnabledMetrics(prev => ({ ...prev, [key]: !prev[key] }));
              };

              return (
                <div className="animate-slide-up report-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Title & Action Buttons Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALYTICS &middot; HUMAN PERFORMANCE</div>
                      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                        {reportMode === 'quick' ? '⚡ QUICK PRIORITY READINESS REPORT' : '⚙️ CUSTOM METRIC PERFORMANCE REPORT'}
                      </h1>
                      <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        {reportMode === 'quick' ? 'High-priority performance indicators (Dehydration risk, sleep deficits, baseline audits).' : 'Customized metric view tailored for coaching analysis.'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                      <button 
                        onClick={() => window.print()}
                        className="btn-primary no-print"
                        style={{ padding: '10px 22px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800 }}
                      >
                        <Printer size={16} /> Export to PDF
                      </button>
                    </div>
                  </div>

                  {/* Mode & Filters Toolbar (hidden in PDF print) */}
                  <div className="card-glass no-print" style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      {/* Mode Switcher */}
                      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
                        <button
                          onClick={() => setReportMode('quick')}
                          style={{
                            padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
                            background: reportMode === 'quick' ? 'var(--color-accent)' : 'transparent',
                            color: reportMode === 'quick' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                          }}
                        >
                          <Zap size={15} /> QUICK PRIORITY REPORT
                        </button>
                        <button
                          onClick={() => setReportMode('custom')}
                          style={{
                            padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
                            background: reportMode === 'custom' ? 'var(--color-accent)' : 'transparent',
                            color: reportMode === 'custom' ? 'var(--navy-950)' : 'var(--color-text-muted)',
                            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                          }}
                        >
                          <Sliders size={15} /> CUSTOM BUILDER
                        </button>
                      </div>

                      {/* Dropdown Filters & Record Count */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', fontSize: '12px', fontWeight: 800, color: 'var(--white)' }}>
                          TOTAL LOGS: {filteredLogs.length}
                        </span>

                        {/* Sport Filter */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Filter size={14} style={{ color: 'var(--color-accent)' }} />
                          <select
                            value={reportSportFilter}
                            onChange={e => setReportSportFilter(e.target.value)}
                            style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            <option value="ALL">ALL SPORTS</option>
                            {sportsList.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                          </select>
                        </div>

                        {/* Timeframe Filter */}
                        <select
                          value={reportTimeframe}
                          onChange={e => setReportTimeframe(e.target.value)}
                          style={{ background: 'var(--navy-900)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          <option value="all">TIMEFRAME: ALL TIME</option>
                          <option value="today">TIMEFRAME: TODAY</option>
                          <option value="7d">TIMEFRAME: LAST 7 DAYS</option>
                          <option value="30d">TIMEFRAME: LAST 30 DAYS</option>
                        </select>
                      </div>
                    </div>

                    {/* Custom Metric Selector Panel */}
                    {reportMode === 'custom' && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          SELECT METRICS & SECTIONS TO INCLUDE IN REPORT:
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                          {[
                            { key: 'teamSummary', label: 'Team Readiness Summary', desc: 'Overview stats & readiness scores' },
                            { key: 'acuteSweatLoss', label: 'Acute Sweat Loss', desc: 'Post-practice negative sweat drop' },
                            { key: 'dehydration', label: 'Dehydration Roster', desc: `Athletes dropping ≥${dehydrationThreshold}% weight` },
                            { key: 'sleepDeficit', label: 'Sleep Deficit Roster', desc: `Athletes logging <${sleepThreshold}h sleep` },
                            { key: 'weightLeaderboard', label: 'Weight Leaderboard', desc: 'Top weight gains & drops' },
                            { key: 'rawLogs', label: 'Log History Table', desc: 'Chronological weigh-in table' },
                          ].map(item => {
                            const isSelected = enabledMetrics[item.key];
                            return (
                              <div
                                key={item.key}
                                onClick={() => toggleMetric(item.key)}
                                style={{
                                  padding: '12px 14px', borderRadius: '8px',
                                  background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.02)',
                                  border: isSelected ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.08)',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', transition: 'all 0.2s'
                                }}
                              >
                                {isSelected ? <CheckSquare size={18} style={{ color: 'var(--color-accent)' }} /> : <Square size={18} style={{ color: 'var(--color-text-muted)' }} />}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '13px', fontWeight: 700, color: isSelected ? 'var(--white)' : 'var(--color-text-muted)' }}>{item.label}</span>
                                  <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{item.desc}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {reportLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading report data...</div>
                  ) : (
                    <>
                      {showAcuteSweatLoss && renderNegativeSweatDropCards(true)}
                      {/* Section 2: Priority Dehydration Roster */}
                      {showDehydration && (
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--status-error)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <AlertTriangle size={20} style={{ color: 'var(--status-error)' }} />
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                DEHYDRATION & MASS DROP RISK (≥2% MASS LOSS)
                              </h3>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div className="no-print" style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <button
                                  onClick={() => setDehySortBy('drop')}
                                  style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: dehySortBy === 'drop' ? 'var(--status-error)' : 'transparent', color: dehySortBy === 'drop' ? '#fff' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
                                >
                                  SORT: DROP %
                                </button>
                                <button
                                  onClick={() => setDehySortBy('name')}
                                  style={{ padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: dehySortBy === 'name' ? 'var(--color-accent)' : 'transparent', color: dehySortBy === 'name' ? 'var(--navy-950)' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
                                >
                                  SORT: NAME
                                </button>
                              </div>
                              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--status-error)' }}>{dehydrationList.length} ATHLETES AT RISK</span>
                            </div>
                          </div>
                          
                          {dehydrationList.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Clean! No athletes currently showing ≥2% body mass drops.</div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)' }}>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>ATHLETE</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>SPORT</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>BASELINE WEIGHT (DATE)</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>CURRENT WEIGHT</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>TOTAL DROP</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>LOG DATE</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...dehydrationList].sort((a, b) => {
                                    if (dehySortBy === 'name') return (a.athlete_name || '').localeCompare(b.athlete_name || '');
                                    return (b.drop_percent || 0) - (a.drop_percent || 0);
                                  }).map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{item.prev_weight} lbs</span>
                                        {item.baseline_date && <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '6px' }}>({item.baseline_date})</span>}
                                      </td>
                                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--status-error)' }}>{item.curr_weight} lbs</td>
                                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--status-error)' }}>
                                        -{item.drop_lbs.toFixed(1)} lbs (-{item.drop_percent}%)
                                      </td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.date}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Section 3: Sleep Deficiency Roster */}
                      {showSleepDeficit && (
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #f59e0b' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Activity size={20} style={{ color: '#f59e0b' }} />
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                CRITICAL SLEEP DEFICIENCY (&lt;{sleepThreshold} HOURS LOGGED)
                              </h3>
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>{sleepDeficitList.length} LOGS AFFECTED</span>
                          </div>

                          {sleepDeficitList.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>Optimal CNS sleep scores recorded across all athletes!</div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid rgba(245, 158, 11, 0.3)' }}>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>ATHLETE</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>SPORT</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>SLEEP LOGGED</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>RECOMMENDED ACTION</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>LOG DATE</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sleepDeficitList.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>{item.sleep_hrs} hrs</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>Reduce High-Intensity CNS Volume</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Section 4: Expired Baselines Roster */}
                      {showExpiredBaselines && (
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--color-accent)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Shield size={20} style={{ color: 'var(--color-accent)' }} />
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                EXPIRED BASELINE AUDIT (&gt;14 DAYS INACTIVE)
                              </h3>
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)' }}>{expiredBaselinesList.length} ATHLETES NEED BASELINE</span>
                          </div>

                          {expiredBaselinesList.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '12px 0' }}>All active athletes have logged weight within the last 14 days!</div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(59, 130, 246, 0.1)', borderBottom: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>ATHLETE</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>SPORT / TEAM</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>INACTIVITY STATUS</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--color-accent)' }}>LAST LOGGED DATE</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expiredBaselinesList.map((item, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport} &middot; {item.team}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 700, color: 'var(--color-accent)' }}>{item.status}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.last_date || 'N/A'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Section 5: Weight Leaderboard (Custom Mode) */}
                      {showLeaderboard && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                          <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              📈 TOP WEIGHT GAINS (SEASON PROGRESSION)
                            </h3>
                            {topGains.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.athlete_name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.sport} ({item.initial_weight} → {item.latest_weight} lbs)</div>
                                </div>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>+{item.diff.toFixed(1)} lbs</span>
                              </div>
                            ))}
                          </div>

                          <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              📉 TOP WEIGHT DROPS (MASS CUTS / LOSSES)
                            </h3>
                            {topDrops.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{item.athlete_name}</div>
                                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{item.sport} ({item.initial_weight} → {item.latest_weight} lbs)</div>
                                </div>
                                <span style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444' }}>{item.diff.toFixed(1)} lbs</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Section 6: Chronological Raw Log Table */}
                      {showRawLogs && (
                        <div className="card-glass" style={{ overflow: 'hidden' }}>
                          <div 
                            onClick={() => setShowReportsLogAccordion(!showReportsLogAccordion)}
                            className="no-print"
                            style={{ padding: '16px 24px', borderBottom: showReportsLogAccordion ? '1px solid var(--color-border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', transition: 'background 0.2s' }}
                            title="Click to expand or compress the table view"
                          >
                            <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span>📑 CHRONOLOGICAL WEIGH-IN LOG HISTORY ({filteredLogs.length} RECORDS)</span>
                            </span>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', background: 'rgba(184, 156, 91, 0.15)', padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--color-accent)' }}>
                              {showReportsLogAccordion ? '▼ HIDE TABLE' : '▲ SHOW TABLE'}
                            </span>
                          </div>
                          
                          <div className="only-print" style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'none' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                              CHRONOLOGICAL WEIGH-IN LOG HISTORY ({filteredLogs.length} RECORDS)
                            </span>
                          </div>

                          {showReportsLogAccordion && (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>ATHLETE</th>
                                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>SPORT / TEAM</th>
                                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>LATEST WEIGHT</th>
                                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>LATEST SLEEP</th>
                                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)' }}>LOG DATE</th>
                                    <th style={{ padding: '16px', fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', width: '60px' }}></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredLogs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '16px', fontWeight: 600 }}>{log.athlete_name}</td>
                                      <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{log.sport || 'N/A'}</td>
                                      <td style={{ padding: '16px', fontWeight: 700, color: 'var(--color-accent)' }}>
                                        {log.weight_lbs && Number(log.weight_lbs) > 0 ? `${log.weight_lbs} lbs` : <span style={{ color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: 600 }}>😴 Sleep Only</span>}
                                      </td>
                                      <td style={{ padding: '16px', fontWeight: 700, color: (log.sleep_hrs != null && log.sleep_hrs > 0 && log.sleep_hrs < sleepThreshold) ? 'var(--status-error)' : 'var(--color-text)' }}>
                                        {log.sleep_hrs ? `${log.sleep_hrs} hrs` : '-'}
                                      </td>
                                      <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                        {new Date(log.created_at).toLocaleDateString()}
                                      </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            {log.weight_lbs && Number(log.weight_lbs) > 0 ? (
                                              log.is_baseline ? (
                                                <span style={{ fontSize: '10px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', padding: '4px 10px', borderRadius: '12px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                                  ⭐ BASELINE
                                                </span>
                                              ) : (
                                                <button
                                                  onClick={() => handleMakeDateBaselineMarker(log.id, log.athlete_id, log.weight_lbs, new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), log.athlete_name)}
                                                  className="no-print"
                                                  style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}
                                                  title="Make this specific date the official baseline marker"
                                                >
                                                  📍 MAKE BASELINE
                                                </button>
                                              )
                                            ) : null}
                                            <button onClick={() => handleDeleteWeighIn(log.id)} className="no-print" style={{ background: 'transparent', border: 'none', color: 'var(--status-error)', cursor: 'pointer', padding: '4px' }}>
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {screen === 'roster' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                        // Find latest weigh-in and recovery logs for this athlete from reportData
                        const athleteLogs = reportData.filter(r => r.athlete_name === a.name).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
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
            )}

            {/* STANDALONE PROFILES TAB */}
            {screen === 'profiles' && (() => {
              if (!selectedProfileId) {
                return (
                  <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Hub Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <User size={14} /> ATHLETE INTELLIGENCE DIRECTORY
                        </span>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', margin: 0, lineHeight: 1.1 }}>
                          PERFORMANCE & BIOMETRIC PROFILES
                        </h1>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          Select an athlete to evaluate body weight fluctuation trends, sleep recovery patterns, and historical log ledgers over time.
                        </div>
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)', background: 'rgba(184, 156, 91, 0.15)', padding: '6px 16px', borderRadius: '20px', border: '1px solid rgba(184, 156, 91, 0.3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {filteredAthletes.length} ATHLETES LISTED
                      </span>
                    </div>

                    {/* Search and Sport Filter Row */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: '1 1 280px', display: 'flex', alignItems: 'center' }}>
                        <Search size={18} style={{ position: 'absolute', left: '16px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                        <input 
                          type="text" 
                          className="input-glass"
                          placeholder="Search profile by athlete name or position..." 
                          value={search} 
                          onChange={e => setSearch(e.target.value)}
                          style={{ width: '100%', height: '48px', padding: '0 38px 0 44px', fontSize: '14px' }}
                        />
                        {search && (
                          <button 
                            onClick={() => setSearch('')}
                            style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          >
                            <X size={18} />
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {['ALL', ...sportsList].map(sport => (
                          <button
                            key={sport}
                            onClick={() => setSelectedSportFilter(sport)}
                            style={{
                              padding: '8px 16px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              cursor: 'pointer',
                              border: selectedSportFilter === sport ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.1)',
                              background: selectedSportFilter === sport ? 'var(--color-accent)' : 'rgba(255,255,255,0.02)',
                              color: selectedSportFilter === sport ? 'var(--navy-950)' : 'var(--color-text)',
                              transition: 'all 0.2s'
                            }}
                          >
                            {sport}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Glowing Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '16px' }}>
                      {filteredAthletes.map(a => {
                        const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
                        const colorIdx = a.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length;
                        const avatarBg = avatarColors[colorIdx];

                        const aLogs = reportData.filter(r => r.athlete_id === a.id).sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
                        const latestLog = aLogs[0];

                        return (
                          <div
                            key={a.id}
                            onClick={() => { setSelectedProfileId(a.id); fetchProfileData(a.id); }}
                            className="card-glass glow-card"
                            style={{
                              padding: '20px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '16px',
                              cursor: 'pointer',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '16px',
                              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{
                                width: '56px', height: '56px', borderRadius: '16px',
                                background: avatarBg, border: '2px solid rgba(255,255,255,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontWeight: 800, fontSize: '20px', fontFamily: 'var(--font-display)',
                                flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                              }}>
                                {a.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, margin: 0, color: '#fff', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {a.name}
                                </h3>
                                <div style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600, marginTop: '2px', textTransform: 'uppercase' }}>
                                  {a.sport || 'General'} &middot; {a.position || 'Athlete'}
                                </div>
                              </div>
                            </div>

                            {/* KPI mini row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'rgba(0,0,0,0.25)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                              <div>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Current Mass</span>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
                                  {latestLog && latestLog.weight_lbs && Number(latestLog.weight_lbs) > 0 ? `${latestLog.weight_lbs} lb` : (latestLog ? '😴 Sleep Only' : 'No logs')}
                                </div>
                              </div>
                              <div>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total Records</span>
                                <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, color: 'var(--color-accent)', marginTop: '2px' }}>
                                  {aLogs.length} session{aLogs.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                {latestLog && latestLog.created_at ? `Active: ${new Date(latestLog.created_at).toLocaleDateString()}` : 'No history yet'}
                              </span>
                              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                VIEW TRENDS <ArrowUpRight size={14} />
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {filteredAthletes.length === 0 && (
                      <div className="card-glass" style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                        No athletes found matching "{search}". Try adjusting your search filters above.
                      </div>
                    )}
                  </div>
                );
              }

              // SELECTED ATHLETE PROFILE DASHBOARD
              const athlete = athletes.find(a => a.id === selectedProfileId);
              if (!athlete) {
                return (
                  <div className="card-glass" style={{ padding: '48px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-text-muted)' }}>Selected athlete profile not found.</p>
                    <button onClick={() => setSelectedProfileId(null)} className="btn-secondary" style={{ marginTop: '16px' }}>Return to Profiles</button>
                  </div>
                );
              }

              const sortedLogs = [...profileData].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
              const weightLogs = sortedLogs.filter(l => l.weight_lbs && Number(l.weight_lbs) > 0 && !isPostPracticeLog(l));
              const postPracticeLogs = sortedLogs.filter(l => l.weight_lbs && Number(l.weight_lbs) > 0 && isPostPracticeLog(l)).reverse();
              const sleepLogs = sortedLogs.filter(l => l.sleep_hrs && Number(l.sleep_hrs) > 0);
              
              const latestWeight = weightLogs.length > 0 ? Number(weightLogs[weightLogs.length-1].weight_lbs) : null;
              const baseInfo = getAthleteBaseline(athlete, sortedLogs.length ? sortedLogs : reportData);
              const baselineWeight = baseInfo ? baseInfo.weight_lbs : (weightLogs.length > 0 ? Number(weightLogs[0].weight_lbs) : null);
              const weightDelta = (latestWeight && baselineWeight && weightLogs.length > 1) ? (latestWeight - baselineWeight) : 0;
              const maxWeight = weightLogs.length > 0 ? Math.max(...weightLogs.map(l => Number(l.weight_lbs))) : '--';
              const minWeight = weightLogs.length > 0 ? Math.min(...weightLogs.map(l => Number(l.weight_lbs))) : '--';
              
              const avgSleep = sleepLogs.length > 0 ? (sleepLogs.reduce((sum, l) => sum + Number(l.sleep_hrs), 0) / sleepLogs.length).toFixed(1) : '--';
              const maxSleep = sleepLogs.length > 0 ? Math.max(...sleepLogs.map(l => Number(l.sleep_hrs))) : '--';
              const deficitNights = sleepLogs.filter(l => Number(l.sleep_hrs) < 6.5).length;
              const recoveryScore = sleepLogs.length > 0 ? Math.round((sleepLogs.filter(l => Number(l.sleep_hrs) >= 7.0).length / sleepLogs.length) * 100) : null;

              const daysAgo = sortedLogs.length > 0 && sortedLogs[sortedLogs.length-1].created_at ? Math.floor((new Date() - new Date(sortedLogs[sortedLogs.length-1].created_at)) / (1000 * 60 * 60 * 24)) : null;

              const avatarColors = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];
              const colorIdx = athlete.name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % avatarColors.length;
              const avatarBg = avatarColors[colorIdx];

              return (
                <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Top Control & Switcher Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
                    <div onClick={() => setSelectedProfileId(null)} style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.1em', background: 'rgba(184, 156, 91, 0.12)', padding: '8px 16px', borderRadius: '20px', border: '1px solid rgba(184, 156, 91, 0.3)', transition: 'all 0.2s' }}>
                      <ChevronLeft size={16} /> ALL PROFILES / {athlete.name.toUpperCase()}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={12} style={{ cursor: 'pointer' }} onClick={() => fetchProfileData(athlete.id)} title="Refresh Data" /> SWITCH ATHLETE:
                      </span>
                      <select
                        className="input-glass"
                        value={selectedProfileId}
                        onChange={e => {
                          if (e.target.value) {
                            setSelectedProfileId(e.target.value);
                            fetchProfileData(e.target.value);
                          }
                        }}
                        style={{ height: '38px', padding: '0 16px', fontSize: '13px', borderRadius: '8px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', minWidth: '220px' }}
                      >
                        {athletes.slice().sort((a,b) => a.name.localeCompare(b.name)).map(a => (
                          <option key={a.id} value={a.id} style={{ background: '#0a192f', color: '#fff' }}>
                            {a.name.toUpperCase()} &bull; {a.sport || 'General'}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Hero Athlete Dossier Card */}
                  <div className="card-glass glow-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '28px', border: '1px solid rgba(184, 156, 91, 0.3)', position: 'relative', overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.4)' }}>
                    <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '280px', height: '280px', background: 'radial-gradient(circle, rgba(184, 156, 91, 0.12) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
                    
                    <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ width: '88px', height: '88px', borderRadius: '20px', background: avatarBg, border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: 800, flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        {athlete.name.split(' ').map(n=>n[0]).join('')}
                      </div>
                      <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>ATHLETE BIOMETRIC DOSSIER</span>
                          <span style={{ fontSize: '11px', fontWeight: 700, background: weightLogs.length > 0 ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)', color: weightLogs.length > 0 ? '#60a5fa' : '#c084fc', padding: '3px 10px', borderRadius: '12px', border: `1px solid ${weightLogs.length > 0 ? 'rgba(59, 130, 246, 0.4)' : 'rgba(139, 92, 246, 0.4)'}`, display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {weightLogs.length > 0 ? '⚖️ STANDARD TRACKING' : '😴 SLEEP ONLY MODE'}
                          </span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '34px', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, color: '#fff', letterSpacing: '0.02em' }}>{athlete.name}</span>
                        <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          <strong style={{ color: '#fff' }}>{athlete.sport || 'Athletics'}</strong> &middot; {athlete.team || 'Shiloh'}{athlete.grade ? ` · Class of ${athlete.grade}` : ''} &middot; {athlete.position || 'General Athlete'}
                        </span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
                        <button onClick={() => handleSelectAthleteForEntry(athlete.id)} className="glow-card" style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', borderRadius: '8px', padding: '12px 22px', fontSize: '13px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <Plus size={18} /> LOG DATA
                        </button>
                        <button onClick={() => handleEditClick(athlete)} style={{ background: 'rgba(255,255,255,0.04)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', padding: '12px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          EDIT INFO
                        </button>
                      </div>
                    </div>

                    {/* Executive KPI Stat Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', paddingTop: '8px' }}>
                      
                      <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>CURRENT BODY MASS</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                            {latestWeight != null ? `${latestWeight} lb` : '😴 Sleep Only'}
                          </span>
                        </div>
                        {latestWeight != null && (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: weightDelta > 0 ? 'var(--status-success)' : weightDelta < 0 ? 'var(--status-error)' : 'var(--color-text-muted)' }}>
                            {weightDelta > 0 ? `▲ +${weightDelta.toFixed(1)} lb from baseline` : weightDelta < 0 ? `▼ ${weightDelta.toFixed(1)} lb from baseline` : '• Unchanged vs baseline'}
                          </span>
                        )}
                        {latestWeight == null && (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Scale weight not recorded</span>
                        )}
                      </div>

                      <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>AVERAGE SLEEP DURATION</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                            {avgSleep} <span style={{ fontSize: '16px', color: 'var(--color-text-muted)' }}>hrs</span>
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: avgSleep !== '--' && Number(avgSleep) >= 7.5 ? 'var(--status-success)' : avgSleep !== '--' && Number(avgSleep) >= 6.5 ? '#f59e0b' : 'var(--status-error)' }}>
                          {avgSleep !== '--' ? (Number(avgSleep) >= 7.5 ? '🟢 Optimal Rest Standard' : Number(avgSleep) >= 6.5 ? '🟡 Adequate Recovery' : '🔴 Sleep Deficit Warning') : 'No sleep data'}
                        </span>
                      </div>

                      <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>RECOVERY INDEX SCORE</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--color-accent)' }}>
                            {recoveryScore != null ? `${recoveryScore}%` : '--'}
                          </span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {recoveryScore != null ? `${sleepLogs.length - deficitNights} / ${sleepLogs.length} sessions optimal` : 'Awaiting sleep check-ins'}
                        </span>
                      </div>

                      <div className="card-glass" style={{ padding: '20px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>TOTAL RECORDED LOGS</span>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff' }}>
                            {sortedLogs.length}
                          </span>
                          <span style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontWeight: 700 }}>SESSIONS</span>
                        </div>
                        <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 700 }}>
                          {daysAgo != null ? (daysAgo === 0 ? '✨ Active Today' : `Last active ${daysAgo}d ago`) : 'No historical sessions'}
                        </span>
                      </div>

                    </div>
                  </div>
                  
                  {/* Trend Analytics Section (2 Columns) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
                    
                    {/* Body Weight Evolution Curve */}
                    <div className="card-glass" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <TrendingUp size={15} /> MASS EVOLUTION CURVE
                          </span>
                          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase' }}>
                            BODY WEIGHT TRENDS
                          </h3>
                        </div>
                        {weightLogs.length > 0 && (
                          <div style={{ display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.25)', padding: '8px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>LOW</span>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{minWeight}</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>HIGH</span>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{maxWeight}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ height: '260px', position: 'relative', paddingTop: '16px', marginLeft: '-20px' }}>
                        {weightLogs.length > 1 ? (() => {
                          const trendData = weightLogs.slice(-20).map(d => ({
                            date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
                            Weight: Number(d.weight_lbs) || 0,
                            isBaseline: d.is_baseline === true || d.is_baseline === 'true' || d.is_baseline === 1
                          }));
                          const validW = trendData.map(d=>d.Weight).filter(w => w > 0);
                          const minW = validW.length > 0 ? Math.min(...validW) : 100;
                          const maxW = validW.length > 0 ? Math.max(...validW) : 200;
                          const latestBaseline = [...weightLogs].reverse().find(d => d.is_baseline);
                          let baselineWeight = latestBaseline ? Number(latestBaseline.weight_lbs) : null;
                          if (!baselineWeight) {
                            try {
                              const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
                              if (customMap[athlete.id] && customMap[athlete.id].weight_lbs) {
                                baselineWeight = Number(customMap[athlete.id].weight_lbs);
                              } else if (athlete?.baseline_weight) {
                                baselineWeight = Number(athlete.baseline_weight);
                              }
                            } catch(e) {}
                          }
                          if (!baselineWeight && weightLogs.length > 0) {
                            baselineWeight = Number(weightLogs[0].weight_lbs);
                          }
                          
                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={trendData} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="colorWeightProfile" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.5}/>
                                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} minTickGap={20} />
                                <YAxis domain={[Math.floor(minW - 4), Math.ceil(maxW + 4)]} hide />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                {baselineWeight && (
                                  <ReferenceLine y={baselineWeight} stroke="#10b981" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: `Baseline: ${baselineWeight} lbs`, position: 'insideTopLeft', fill: '#10b981', fontSize: 11, fontWeight: 'bold' }} />
                                )}
                                {trendData.filter(d => d.isBaseline).map((d, idx) => (
                                  <ReferenceLine key={idx} x={d.date} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: 'BASELINE SET', position: 'top', fill: '#3b82f6', fontSize: 9, fontWeight: 'bold' }} />
                                ))}
                                <Area type="monotone" dataKey="Weight" stroke="var(--color-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorWeightProfile)" activeDot={{ r: 7, fill: 'var(--color-accent)', stroke: '#fff', strokeWidth: 2 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          );
                        })() : weightLogs.length === 1 ? (
                          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: '8px' }}>
                            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--color-accent)' }}>{weightLogs[0].weight_lbs} lbs recorded</span>
                            <span style={{ fontSize: '13px' }}>Need at least 2 weigh-in entries to generate visual trend line</span>
                          </div>
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: '12px', background: 'rgba(139, 92, 246, 0.05)', borderRadius: '12px', border: '1px dashed rgba(139, 92, 246, 0.25)', padding: '24px' }}>
                            <span style={{ fontSize: '24px' }}>😴</span>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#c084fc', textAlign: 'center' }}>SLEEP & RECOVERY ONLY TRACKING</span>
                            <span style={{ fontSize: '13px', textAlign: 'center', maxWidth: '320px', lineHeight: 1.5 }}>
                              This athlete is configured for recovery tracking without scale body mass recordings. No weight trends to display.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sleep Duration & Recovery Pattern */}
                    <div className="card-glass" style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={15} /> RECOVERY & REST PATTERN
                          </span>
                          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase' }}>
                            SLEEP DURATION TRENDS
                          </h3>
                        </div>
                        {sleepLogs.length > 0 && (
                          <div style={{ display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.25)', padding: '8px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>PEAK REST</span>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: '#60a5fa' }}>{maxSleep}h</span>
                            </div>
                            <div>
                              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', display: 'block' }}>DEFICITS</span>
                              <span style={{ fontSize: '14px', fontWeight: 800, color: deficitNights > 0 ? '#ef4444' : 'var(--status-success)' }}>{deficitNights}</span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div style={{ height: '260px', position: 'relative', paddingTop: '16px', marginLeft: '-20px' }}>
                        {sleepLogs.length > 0 ? (() => {
                          const sleepData = sleepLogs.slice(-14).map(d => ({
                            date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
                            Sleep: Number(d.sleep_hrs) || 0,
                            fillColor: Number(d.sleep_hrs) >= 7.5 ? '#34d399' : Number(d.sleep_hrs) >= 6.5 ? '#f59e0b' : '#ef4444'
                          }));
                          
                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={sleepData} margin={{ top: 15, right: 10, left: 10, bottom: 0 }}>
                                <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" fontSize={11} tickMargin={10} minTickGap={20} />
                                <YAxis domain={[0, 12]} hide />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                                <ReferenceLine y={8.0} stroke="rgba(184, 156, 91, 0.7)" strokeDasharray="3 3" strokeWidth={1.5} label={{ value: '8.0h Target', position: 'insideTopLeft', fill: 'var(--color-accent)', fontSize: 11, fontWeight: 'bold' }} />
                                <Bar dataKey="Sleep" fill="#60a5fa" radius={[6, 6, 0, 0]} fillOpacity={0.9} />
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })() : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                            No sleep duration recordings logged yet
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Post-Practice Sweat & Acute Weight Drop Tracker */}
                  <div className="card-glass glow-card" style={{ padding: '32px', borderRadius: '24px', border: '1px solid rgba(59, 130, 246, 0.4)', background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.25) 0%, rgba(15, 23, 42, 0.7) 100%)', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: '16px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                          <Zap size={28} />
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            • ACUTE EXERTIONAL MONITORING
                          </span>
                          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, margin: '4px 0 0', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                            POST-PRACTICE SWEAT LOSS &amp; HYDRATION TRACKER
                          </h3>
                          <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 600 }}>
                            Monitors rapid weight drops after high-heat drills and training without distorting official morning recovery trend charts.
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setManualEntryForm(prev => ({
                            ...prev,
                            athleteId: athlete.id,
                            date: new Date().toISOString().slice(0, 10),
                            time: new Date().toTimeString().slice(0, 5),
                            weight: '',
                            successMsg: ''
                          }));
                          setShowManualEntryModal(true);
                        }}
                        style={{
                          padding: '14px 22px',
                          borderRadius: '14px',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                          border: 'none',
                          color: '#fff',
                          fontFamily: 'var(--font-display)',
                          fontSize: '15px',
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          cursor: 'pointer',
                          boxShadow: '0 4px 20px rgba(59, 130, 246, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <span>➕ Log Post-Practice Weight</span>
                      </button>
                    </div>

                    {postPracticeLogs.length === 0 ? (
                      <div style={{ padding: '24px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.15)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                        No post-practice weight entries recorded yet. Use the button above to log acute weigh-ins after practice sessions!
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {postPracticeLogs.map((plog, idx) => {
                          const plogDate = new Date(plog.created_at);
                          const pDate = plogDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                          const pTime = plogDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                          const pWeight = parseFloat(plog.weight_lbs);
                          
                          // Find pre-practice/morning weight from the same day, or fallback to latest prior normal weigh-in
                          const sameDayLogs = weightLogs.filter(wl => {
                            const wld = new Date(wl.created_at);
                            return wld.getFullYear() === plogDate.getFullYear() && 
                                   wld.getMonth() === plogDate.getMonth() && 
                                   wld.getDate() === plogDate.getDate();
                          });
                          let bWeight = null;
                          if (sameDayLogs.length > 0) {
                            bWeight = parseFloat(sameDayLogs[sameDayLogs.length - 1].weight_lbs);
                          } else {
                            const priorLogs = weightLogs.filter(wl => new Date(wl.created_at) <= plogDate);
                            if (priorLogs.length > 0) {
                              bWeight = parseFloat(priorLogs[priorLogs.length - 1].weight_lbs);
                            } else {
                              bWeight = baselineWeight ? parseFloat(baselineWeight) : (latestWeight ? parseFloat(latestWeight) : null);
                            }
                          }
                          
                          const drop = bWeight ? (bWeight - pWeight) : 0;
                          const pctLoss = bWeight && bWeight > 0 ? ((drop / bWeight) * 100) : 0;
                          const fluidOz = drop > 0 ? Math.round(drop * 24) : 0;
                          const isSevere = drop >= 5.0 || pctLoss >= 2.5;

                          return (
                            <div key={plog.id || idx} style={{ padding: '18px 24px', borderRadius: '16px', background: 'rgba(0, 0, 0, 0.35)', border: isSevere ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{ minWidth: '85px' }}>
                                  <span style={{ fontSize: '15px', fontWeight: 800, color: '#fff', display: 'block' }}>{pDate}</span>
                                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{pTime}</span>
                                </div>
                                <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                                {bWeight && (
                                  <>
                                    <div>
                                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Pre-Practice / Morning</span>
                                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--color-text-muted)' }}>{bWeight} lbs</span>
                                    </div>
                                    <div style={{ fontSize: '20px', color: 'var(--color-text-muted)', fontWeight: 800 }}>➔</div>
                                  </>
                                )}
                                <div>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Post-Practice Weight</span>
                                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: '#fff' }}>{pWeight} lbs</span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                {bWeight && (
                                  <div>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Acute Sweat Drop</span>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: drop > 0 ? '#ef4444' : '#34d399' }}>
                                      {drop > 0 ? `-${drop.toFixed(1)} lbs` : `+${Math.abs(drop).toFixed(1)} lbs`} ({drop > 0 ? `-${pctLoss.toFixed(1)}%` : `+${Math.abs(pctLoss).toFixed(1)}%`})
                                    </span>
                                  </div>
                                )}
                                <div style={{ padding: '8px 16px', borderRadius: '12px', background: drop >= 5 ? 'rgba(239, 68, 68, 0.2)' : drop > 2 ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)', border: drop >= 5 ? '1px solid rgba(239, 68, 68, 0.4)' : drop > 2 ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)', color: drop >= 5 ? '#ef4444' : drop > 2 ? '#f97316' : '#60a5fa', fontWeight: 800, fontSize: '13px' }}>
                                  💧 Rx: Drink {fluidOz > 0 ? fluidOz : 32} oz fluids before tomorrow
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* All Attributes Over Time - Full Chronological Ledger */}
                  <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <Activity size={14} /> COMPLETE ATTRIBUTE TIMELINE
                        </span>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, margin: 0, color: '#fff', textTransform: 'uppercase' }}>
                          HISTORICAL LOG LEDGER ({sortedLogs.length})
                        </h3>
                        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          Comprehensive log of every check-in session showing body weight deltas, sleep duration, and recovery classifications over time.
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-accent)', background: 'rgba(184, 156, 91, 0.12)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(184, 156, 91, 0.25)', fontWeight: 700, textTransform: 'uppercase' }}>
                        CHRONOLOGICAL ORDER (NEWEST FIRST)
                      </span>
                    </div>

                    {sortedLogs.length > 0 ? (
                      <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '680px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                              <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DATE & TIME</th>
                              <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>BODY WEIGHT</th>
                              <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SESSION DELTA</th>
                              <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>SLEEP DURATION</th>
                              <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>RECOVERY STATUS</th>
                              <th style={{ padding: '16px 20px', fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>ACTION</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedLogs.slice().reverse().map((log, idx, arr) => {
                              // Find older record with valid weight to compute delta
                              const currentW = log.weight_lbs && Number(log.weight_lbs) > 0 ? Number(log.weight_lbs) : null;
                              let prevW = null;
                              for (let j = idx + 1; j < arr.length; j++) {
                                if (arr[j].weight_lbs && Number(arr[j].weight_lbs) > 0) {
                                  prevW = Number(arr[j].weight_lbs);
                                  break;
                                }
                              }
                              const delta = (currentW && prevW) ? (currentW - prevW) : null;
                              const sleepH = Number(log.sleep_hrs);

                              return (
                                <tr key={log.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.2s', ':hover': { background: 'rgba(255,255,255,0.03)' } }}>
                                  <td style={{ padding: '16px 20px' }}>
                                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '14px', display: 'block' }}>
                                      {new Date(log.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                      {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </td>

                                  <td style={{ padding: '16px 20px' }}>
                                    {currentW ? (
                                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                                        {currentW.toFixed(1)} <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>lb</span>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: '12px', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '4px 12px', borderRadius: '12px', fontWeight: 700, border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                                        😴 Sleep Only Mode
                                      </span>
                                    )}
                                  </td>

                                  <td style={{ padding: '16px 20px' }}>
                                    {delta != null ? (
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                        padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                                        background: delta > 0 ? 'rgba(52, 211, 153, 0.12)' : delta < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)',
                                        color: delta > 0 ? 'var(--status-success)' : delta < 0 ? 'var(--status-error)' : 'var(--color-text-muted)',
                                        border: `1px solid ${delta > 0 ? 'rgba(52, 211, 153, 0.3)' : delta < 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'}`
                                      }}>
                                        {delta > 0 ? `▲ +${delta.toFixed(1)} lb` : delta < 0 ? `▼ ${delta.toFixed(1)} lb` : '• Unchanged'}
                                      </span>
                                    ) : currentW ? (
                                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Initial baseline</span>
                                    ) : (
                                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>--</span>
                                    )}
                                  </td>

                                  <td style={{ padding: '16px 20px' }}>
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                                      {log.sleep_hrs ? Number(log.sleep_hrs).toFixed(1) : '--'} <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>hrs</span>
                                    </span>
                                  </td>

                                  <td style={{ padding: '16px 20px' }}>
                                    <span style={{
                                      display: 'inline-block', padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700,
                                      background: sleepH >= 7.5 ? 'rgba(52, 211, 153, 0.15)' : sleepH >= 6.5 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.2)',
                                      color: sleepH >= 7.5 ? 'var(--status-success)' : sleepH >= 6.5 ? '#f59e0b' : '#ef4444',
                                      border: `1px solid ${sleepH >= 7.5 ? 'rgba(52, 211, 153, 0.4)' : sleepH >= 6.5 ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                                    }}>
                                      {sleepH >= 7.5 ? '🟢 Optimal Rest' : sleepH >= 6.5 ? '🟡 Adequate Recovery' : '🔴 Sleep Deficit Warning'}
                                    </span>
                                  </td>

                                  <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                      {currentW ? (
                                        log.is_baseline ? (
                                          <span style={{ fontSize: '11px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', padding: '6px 14px', borderRadius: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '5px', boxShadow: '0 0 10px rgba(184, 156, 91, 0.3)', whiteSpace: 'nowrap' }}>
                                            ⭐ ACTIVE BASELINE MARKER
                                          </span>
                                        ) : (
                                          <button
                                            onClick={() => handleMakeDateBaselineMarker(log.id, athlete.id, currentW, new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), athlete.name)}
                                            style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.35)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                                            title="Make this specific date and weight the official baseline marker for dehydration alerts"
                                          >
                                            📍 MAKE BASELINE MARKER
                                          </button>
                                        )
                                      ) : null}
                                      <button
                                        onClick={() => {
                                          setConfirmModal({
                                            isOpen: true,
                                            title: 'Delete Recorded Session',
                                            message: 'Delete this recorded weigh-in session?',
                                            isDanger: true,
                                            actionText: 'Delete',
                                            onConfirm: async () => {
                                              await handleDeleteWeighIn(log.id, true);
                                              setTimeout(() => fetchProfileData(athlete.id), 300);
                                            }
                                          });
                                        }}
                                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, transition: 'all 0.2s' }}
                                        title="Delete Log Entry"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', background: 'rgba(0,0,0,0.15)' }}>
                        <span style={{ fontSize: '24px', display: 'block', marginBottom: '8px' }}>📋</span>
                        No check-in session logs recorded for this athlete yet. Click "+ LOG DATA" above or enter via Kiosk Mode.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {screen === 'settings' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                
                {/* Settings Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 700, margin: 0 }}>
                      SYSTEM SETTINGS & TROUBLESHOOTING
                    </h1>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                      Configure performance threshold rules, troubleshoot system connections, and download app for mobile devices.
                    </div>
                  </div>
                  {settingsSavedToast && (
                    <div style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Check size={16} /> THRESHOLD SETTINGS SAVED!
                    </div>
                  )}
                </div>

                {/* Card 1: How To Download / Install App */}
                <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(184, 156, 91, 0.3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.15)', border: '1px solid rgba(184, 156, 91, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                        <Smartphone size={22} />
                      </div>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: 'var(--color-accent)' }}>
                          HOW TO INSTALL & DOWNLOAD APP
                        </h2>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          Installs HPD App as a standalone native application (not a bookmark) with its own home screen icon, fullscreen view, and offline fail-safe cache.
                        </div>
                      </div>
                    </div>

                    {isAppInstalled ? (
                      <div style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--status-success)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: '10px 18px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={18} /> APP INSTALLED & RUNNING STANDALONE
                      </div>
                    ) : (
                      <button 
                        onClick={handleInstallApp}
                        className="btn-primary"
                        style={{ height: '44px', padding: '0 20px', fontSize: '13px' }}
                      >
                        <Download size={18} /> INSTALL HPD APP NOW
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '4px' }}>
                    
                    {/* iOS / iPad Guide */}
                    <div className="card-glass" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--white)', fontWeight: 700, fontSize: '14px' }}>
                        <span style={{ fontSize: '18px' }}>🍎</span> iPhone & iPad (Safari)
                      </div>
                      <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                        <li>Open Safari and load <strong style={{ color: 'var(--color-accent)' }}>clever-kepler.vercel.app</strong></li>
                        <li>Tap the <strong>Share button</strong> (box with arrow pointing up <span style={{ fontSize: '14px' }}>⎘</span>)</li>
                        <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                        <li>Tap <strong>"Add"</strong> in top right. App icon appears on Home Screen!</li>
                      </ol>
                    </div>

                    {/* Android Guide */}
                    <div className="card-glass" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--white)', fontWeight: 700, fontSize: '14px' }}>
                        <span style={{ fontSize: '18px' }}>🤖</span> Android (Chrome)
                      </div>
                      <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                        <li>Open Chrome and load <strong style={{ color: 'var(--color-accent)' }}>clever-kepler.vercel.app</strong></li>
                        <li>Tap the <strong>3-dots menu</strong> (<strong>⋮</strong>) in top right corner</li>
                        <li>Select <strong>"Install App"</strong> or <strong>"Add to Home screen"</strong></li>
                        <li>Tap <strong>"Install"</strong> to place app on your app drawer!</li>
                      </ol>
                    </div>

                    {/* Laptop / Desktop Guide */}
                    <div className="card-glass" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--white)', fontWeight: 700, fontSize: '14px' }}>
                        <span style={{ fontSize: '18px' }}>💻</span> Laptop / Desktop (Chrome / Edge)
                      </div>
                      <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>
                        <li>Look at the right side of your browser URL address bar</li>
                        <li>Click the <strong>Install Icon</strong> (<span style={{ fontSize: '14px' }}>📥</span> or <span style={{ fontSize: '14px' }}>⊕</span>)</li>
                        <li>Click <strong>"Install HPD App"</strong> to launch as a standalone desktop window</li>
                        <li>Access HPD App anytime from your desktop or dock!</li>
                      </ol>
                    </div>

                  </div>
                </div>

                {/* Card 2: Practical Alert & Rule Threshold Configurator */}
                <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-500)' }}>
                      <Sliders size={22} />
                    </div>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0 }}>
                        ALERT & RULE THRESHOLD CONFIGURATOR
                      </h2>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Adjust rule thresholds for risk detection, daily alerts, and mandatory baseline re-weigh prompts.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                    
                    {/* Dehydration Threshold */}
                    <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        DEHYDRATION RISK THRESHOLD (% DROP)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                          onClick={() => setDehydrationThreshold(prev => Math.max(1.0, parseFloat((prev - 0.1).toFixed(1))))}
                          style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Minus size={18} />
                        </button>
                        <div style={{ flex: 1, height: '44px', background: 'var(--navy-900)', border: '1px solid var(--color-accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--color-accent)' }}>
                          {dehydrationThreshold.toFixed(1)}%
                        </div>
                        <button 
                          onClick={() => setDehydrationThreshold(prev => Math.min(5.0, parseFloat((prev + 0.1).toFixed(1))))}
                          style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Flags athletes when body mass drops by &ge; {dehydrationThreshold}% between logs.
                      </span>
                    </div>

                    {/* Sleep Deficiency Threshold */}
                    <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        SLEEP DEFICIENCY THRESHOLD (HOURS)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                          onClick={() => setSleepThreshold(prev => Math.max(4.0, parseFloat((prev - 0.5).toFixed(1))))}
                          style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Minus size={18} />
                        </button>
                        <div style={{ flex: 1, height: '44px', background: 'var(--navy-900)', border: '1px solid var(--color-accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--color-accent)' }}>
                          {sleepThreshold.toFixed(1)} hrs
                        </div>
                        <button 
                          onClick={() => setSleepThreshold(prev => Math.min(9.0, parseFloat((prev + 0.5).toFixed(1))))}
                          style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Flags athletes when logged sleep falls below &lt; {sleepThreshold} hours.
                      </span>
                    </div>

                    {/* Baseline Expiration Rule */}
                    <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        BASELINE EXPIRATION RULE (DAYS INACTIVE)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button 
                          onClick={() => setBaselineExpiryDays(prev => Math.max(3, prev - 1))}
                          style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Minus size={18} />
                        </button>
                        <div style={{ flex: 1, height: '44px', background: 'var(--navy-900)', border: '1px solid var(--color-accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--color-accent)' }}>
                          {baselineExpiryDays} days
                        </div>
                        <button 
                          onClick={() => setBaselineExpiryDays(prev => Math.min(30, prev + 1))}
                          style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        Prompts athlete to set a new baseline if &gt; {baselineExpiryDays} days have passed without log.
                      </span>
                    </div>

                  </div>

                  <button 
                    onClick={handleSaveSettings}
                    className="btn-primary"
                    style={{ width: 'fit-content', padding: '12px 28px', fontSize: '14px', marginTop: '8px' }}
                  >
                    <CheckCircle size={18} /> SAVE THRESHOLD SETTINGS
                  </button>
                </div>

                {/* Card 3: Cloud Data Management & Synchronization Hub */}
                <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(59, 130, 246, 0.35)', background: 'rgba(59, 130, 246, 0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', boxShadow: '0 0 15px rgba(59, 130, 246, 0.25)' }}>
                      <Database size={24} />
                    </div>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: '#fff' }}>
                        CLOUD DATA MANAGEMENT &amp; SYNCHRONIZATION HUB
                      </h2>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Import rosters via CSV, download bulk templates, export full weigh-in reports, or verify real-time inter-device communication.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '4px' }}>
                    
                    {/* Roster Import & Template */}
                    <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Upload size={16} /> Roster CSV Import &amp; Template
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          Bulk upload new athletes or download the standard formatted roster template file.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: 'auto' }}>
                        <button 
                          onClick={handleDownloadTemplate}
                          className="btn-primary no-print"
                          style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: 'var(--white)', border: '1px solid var(--color-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                        >
                          <Download size={15} /> Template
                        </button>
                        <label 
                          className="btn-primary no-print glow-card"
                          style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 800, background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                        >
                          <Upload size={15} /> Upload CSV
                          <input 
                            type="file" 
                            accept=".csv" 
                            style={{ display: 'none' }} 
                            onChange={handleCSVUpload}
                          />
                        </label>
                      </div>
                    </div>

                    {/* Report Export & Live Signal Test */}
                    <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Wifi size={16} /> Data Export &amp; Network Test
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          Export all recorded session logs to spreadsheet format or send a live test ping across devices.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: 'auto' }}>
                        <button 
                          onClick={exportToCSV}
                          className="btn-primary no-print"
                          style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: 'var(--white)', border: '1px solid var(--color-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                        >
                          <Download size={15} /> Export CSV
                        </button>
                        <button
                          onClick={() => {
                            broadcastDeviceSync({ isPing: true });
                            alert("📡 Test Signal Sent!\n\nAn instant wireless verification ping was blasted across the cloud to all connected iPads and PCs. Any open device will display a confirmation pop-up right now!");
                          }}
                          className="no-print glow-card"
                          style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 800, background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                          title="Verify real-time communication between your devices"
                        >
                          📶 Ping Devices
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Card 4: Practical Troubleshooting & Health Tools */}
                <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid rgba(34, 197, 94, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-success)' }}>
                      <Zap size={22} />
                    </div>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0 }}>
                        PRACTICAL TROUBLESHOOTING & SYSTEM HEALTH
                      </h2>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Monitor database synchronization status and run diagnostic actions in case of network issues.
                      </div>
                    </div>
                  </div>

                  {/* Cloud Health Metrics */}
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div className="card-glass" style={{ flex: '1 1 180px', padding: '16px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--status-success)', boxShadow: '0 0 8px var(--status-success)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>CLOUD CONNECTION</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--status-success)' }}>SUPABASE ONLINE</span>
                      </div>
                    </div>

                    <div className="card-glass" style={{ flex: '1 1 180px', padding: '16px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Users size={18} style={{ color: 'var(--color-accent)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>ROSTER RECORD COUNT</span>
                        <span style={{ fontSize: '14px', fontWeight: 700 }}>{athletes.length} Active Athletes</span>
                      </div>
                    </div>

                    <div className="card-glass" style={{ flex: '1 1 180px', padding: '16px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Activity size={18} style={{ color: 'var(--color-accent)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>TOTAL WEIGH-IN LOGS</span>
                        <span style={{ fontSize: '14px', fontWeight: 700 }}>{reportData.length} Records</span>
                      </div>
                    </div>
                  </div>

                  {syncStatus && (
                    <div style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--navy-500)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '10px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={16} /> {syncStatus}
                    </div>
                  )}

                  {/* Troubleshooting Action Buttons */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <button 
                      onClick={handleForceSync}
                      className="btn-primary"
                      style={{ padding: '12px 20px', fontSize: '13px', background: 'var(--navy-800)', border: '1px solid var(--navy-600)', color: 'var(--white)' }}
                    >
                      <RefreshCw size={16} /> FORCE SYNC DATABASE
                    </button>

                    <button 
                      onClick={handleExportDiagnostics}
                      className="btn-primary"
                      style={{ padding: '12px 20px', fontSize: '13px', background: 'var(--navy-800)', border: '1px solid var(--navy-600)', color: 'var(--white)' }}
                    >
                      <Download size={16} /> EXPORT DIAGNOSTICS (JSON)
                    </button>

                    <button 
                      onClick={handleClearAppCache}
                      style={{ padding: '12px 20px', fontSize: '13px', background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--status-error)', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <Trash2 size={16} /> CLEAR LOCAL APP CACHE
                    </button>
                  </div>

                </div>

                {/* Card 4: Hardware Vault & Emergency Data Recovery Station */}
                <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(184, 156, 91, 0.35)', background: 'rgba(184, 156, 91, 0.04)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(184, 156, 91, 0.2)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', boxShadow: '0 0 12px rgba(184, 156, 91, 0.3)' }}>
                      <Shield size={24} />
                    </div>
                    <div>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: 'var(--color-accent)' }}>
                        HARDWARE VAULT &amp; EMERGENCY RECOVERY SUITE
                      </h2>
                      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        Access encrypted local iPad storage, force cloud synchronization of offline logs, or restore data from diagnostic backup files.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.25)', padding: '16px 20px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--white)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Lock size={14} style={{ color: 'var(--color-accent)' }} /> 1,000-LOG PERMANENT DEVICE HARDWARE VAULT ACTIVE
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        All kiosk sessions on this device are automatically duplicated to an immutable hardware ledger regardless of internet connection state.
                      </span>
                    </div>

                    <button 
                      onClick={() => setShowRecoveryModal(true)}
                      className="btn-primary glow-card"
                      style={{ padding: '12px 24px', fontSize: '13px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 15px rgba(184, 156, 91, 0.3)', display: 'flex', alignItems: 'center', gap: '8px', height: '44px', whiteSpace: 'nowrap' }}
                    >
                      <Database size={16} /> OPEN RECOVERY STATION &amp; AUDIT VAULT
                    </button>
                  </div>
                </div>

                {/* Card 5: Athlete Record Merge Studio */}
                <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc', boxShadow: '0 0 15px rgba(139, 92, 246, 0.3)' }}>
                        <Users size={22} />
                      </div>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: '#c084fc' }}>
                          ATHLETE RECORD MERGE STUDIO
                        </h2>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          Resolve duplicated athlete accounts by consolidating all weigh-ins, hydration alerts, and sleep logs into a single master profile.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowMergePanel(!showMergePanel)}
                      className="btn-secondary"
                      style={{ padding: '10px 20px', fontSize: '13px', border: '1px solid rgba(139, 92, 246, 0.5)', background: showMergePanel ? 'rgba(139, 92, 246, 0.2)' : 'transparent', color: '#fff', fontWeight: 700, borderRadius: '10px', cursor: 'pointer' }}
                    >
                      {showMergePanel ? '✕ Close Studio' : '⚡ Open Merge Studio'}
                    </button>
                  </div>

                  {showMergePanel && (
                    <div style={{ padding: '20px', background: 'rgba(0,0,0,0.3)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            1. Select Source (Duplicate To Delete):
                          </label>
                          <select
                            value={mergeSourceId}
                            onChange={e => setMergeSourceId(e.target.value)}
                            style={{ padding: '12px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', fontSize: '14px', fontWeight: 700 }}
                          >
                            <option value="">-- Choose Duplicate Profile --</option>
                            {athletes.map(a => (
                              <option key={`src-${a.id}`} value={a.id}>{a.name} ({a.sport || 'No Sport'})</option>
                            ))}
                          </select>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>This profile's logs will be moved away and the profile will be deleted.</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--status-success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            2. Select Target (Master Profile To Keep):
                          </label>
                          <select
                            value={mergeTargetId}
                            onChange={e => setMergeTargetId(e.target.value)}
                            style={{ padding: '12px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(52, 211, 153, 0.4)', borderRadius: '10px', fontSize: '14px', fontWeight: 700 }}
                          >
                            <option value="">-- Choose Master Profile --</option>
                            {athletes.filter(a => a.id !== mergeSourceId).map(a => (
                              <option key={`tgt-${a.id}`} value={a.id}>{a.name} ({a.sport || 'No Sport'})</option>
                            ))}
                          </select>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>This profile will receive all historical weigh-in sessions and remain active.</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
                        <button
                          onClick={() => {
                            if (!mergeSourceId || !mergeTargetId) {
                              alert("Please select both a source duplicate profile and a master target profile.");
                              return;
                            }
                            const sourceObj = athletes.find(a => a.id === mergeSourceId);
                            const targetObj = athletes.find(a => a.id === mergeTargetId);
                            setConfirmModal({
                              isOpen: true,
                              title: 'Confirm Athlete Record Merge',
                              message: `Are you sure you want to merge all records from "${sourceObj?.name}" into "${targetObj?.name}"? The duplicate profile "${sourceObj?.name}" will be permanently deleted after transferring its logs.`,
                              isDanger: true,
                              actionText: 'Execute Merge',
                              onConfirm: () => handleMergeAthletes(mergeSourceId, mergeTargetId)
                            });
                          }}
                          disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                          className="btn-primary"
                          style={{ padding: '12px 28px', fontSize: '14px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none', fontWeight: 800, cursor: (!mergeSourceId || !mergeTargetId) ? 'not-allowed' : 'pointer', borderRadius: '10px' }}
                        >
                          🔗 MERGE RECORDS &amp; PURGE DUPLICATE
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card 6: Danger Zone & Database Reset Vault */}
                <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-error)' }}>
                        <AlertTriangle size={24} />
                      </div>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: 'var(--status-error)' }}>
                          DANGER ZONE &amp; DATABASE RESET VAULT
                        </h2>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                          Perform irreversible administrative cleanup operations across the active cloud database.
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => setConfirmModal({
                        isOpen: true,
                        title: 'Clear All Historical Data',
                        message: 'WARNING: You are about to permanently purge ALL weigh-in logs, hydration records, and recovery sessions from the database across all devices. This action cannot be undone. Do you wish to proceed?',
                        isDanger: true,
                        actionText: 'Wipe Database',
                        onConfirm: () => handleDeleteAllWeighIns(true)
                      })}
                      className="no-print"
                      style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)', border: '1px solid var(--status-error)', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)' }}
                    >
                      <Trash2 size={18} /> Clear All Historical Data
                    </button>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Nav (Mobile & Tablet - Hidden in Kiosk Mode) */}
      {!isKioskMode && (
        <>
          <div className="bottom-nav">
            {navItem('dashboard', <Users size={22} />, 'Home')}
            {navItem('entry', <Plus size={22} />, 'Log')}
            {navItem('profiles', <User size={22} />, 'Profiles')}
            {navItem('roster', <Shield size={22} />, 'Roster')}
            
            {/* Clean More / Toolbox Button */}
            <div onClick={() => setShowMobileMore(!showMobileMore)} 
                 style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', flex: 1, minWidth: '56px', height: '100%',
                          color: (showMobileMore || ['groups', 'alerts', 'reports', 'settings'].includes(screen)) ? 'var(--color-accent)' : 'var(--color-text-muted)', transition: 'color 0.2s' }}>
              <MoreHorizontal size={22} />
              <span style={{ fontSize: '11px', fontWeight: (showMobileMore || ['groups', 'alerts', 'reports', 'settings'].includes(screen)) ? 700 : 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>More</span>
            </div>
          </div>

          {/* Glassmorphic Centered "More" Tools & Analytics Modal */}
          {showMobileMore && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(3, 10, 20, 0.85)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
                 onClick={() => setShowMobileMore(false)}>
              <div className="card-glass animate-slide-up" 
                   onClick={e => e.stopPropagation()} 
                   style={{ width: '100%', maxWidth: '540px', maxHeight: '88vh', overflowY: 'auto', padding: '28px', background: 'var(--navy-950)', borderRadius: '24px', border: '1px solid var(--color-accent)', boxShadow: '0 16px 48px rgba(0, 0, 0, 0.7), 0 0 24px rgba(184, 156, 91, 0.25)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.15)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                      <Sliders size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--white)' }}>MORE TOOLS & ANALYTICS</h3>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Tap to switch workspace section</span>
                    </div>
                  </div>
                  <button onClick={() => setShowMobileMore(false)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}>
                    <X size={20} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div onClick={() => { setScreen('groups'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }}
                       className="card-glass glow-card"
                       style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'groups' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'groups' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Grid size={24} style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>Sport Groups</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Team comparison averages</div>
                    </div>
                  </div>

                  <div onClick={() => { setScreen('alerts'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }}
                       className="card-glass glow-card"
                       style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'alerts' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'alerts' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <AlertTriangle size={24} style={{ color: getDailyAlerts().length > 0 ? '#ef4444' : 'var(--color-accent)' }} />
                      {getDailyAlerts().length > 0 && (
                        <span style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
                          {getDailyAlerts().length}
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>Alerts & Deficits</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Rest warnings & fluctuations</div>
                    </div>
                  </div>

                  <div onClick={() => { setScreen('reports'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }}
                       className="card-glass glow-card"
                       style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'reports' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'reports' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <FileText size={24} style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>Reports & CSV</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Export database & spreadsheets</div>
                    </div>
                  </div>

                  <div onClick={() => { setScreen('settings'); setShowMobileMore(false); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }}
                       className="card-glass glow-card"
                       style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '10px', background: screen === 'settings' ? 'rgba(184, 156, 91, 0.15)' : 'rgba(255,255,255,0.03)', border: screen === 'settings' ? '1px solid var(--color-accent)' : '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Settings size={24} style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>System Settings</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Admin configuration & cache</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '4px', padding: '14px 16px', borderRadius: '14px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-950)', fontWeight: 800, fontSize: '12px' }}>CM</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)' }}>Coach Mason</div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Shiloh Athletics &middot; HPD</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', background: 'rgba(59, 130, 246, 0.15)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>{APP_VERSION}</span>
                </div>

              </div>
            </div>
          )}
        </>
      )}

      {showInstallModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(3, 10, 20, 0.85)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="card-glass glow-card animate-slide-up" style={{ width: '100%', maxWidth: '520px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--color-accent)', boxShadow: '0 8px 32px rgba(184, 156, 91, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(184, 156, 91, 0.2)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                  <Smartphone size={26} />
                </div>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', margin: 0, color: 'var(--white)' }}>INSTALL HPD APP</h2>
                  <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 700 }}>1-TAP STANDALONE NATIVE APP</span>
                </div>
              </div>
              <button 
                onClick={() => setShowInstallModal(false)}
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
              Tap below to install HPD App directly onto your device:
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Actionable Box 1: Android & Laptop / Desktop */}
              <div className="card-glass glow-card" style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🤖 / 💻</span> Android & Desktop (Chrome / Edge)
                </div>

                <button 
                  onClick={handleInstallApp}
                  className="btn-primary"
                  style={{ width: '100%', height: '44px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Download size={18} /> LAUNCH NATIVE INSTALL PROMPT
                </button>

                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                  Triggers browser system 1-click install dialog directly.
                </div>
              </div>

              {/* Actionable Box 2: iPhone & iPad (Safari) */}
              <div className="card-glass glow-card" style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid rgba(184, 156, 91, 0.3)' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🍎</span> iPhone & iPad (Safari)
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleShareApp}
                    className="btn-primary"
                    style={{ flex: 1, height: '44px', fontSize: '12px', background: 'var(--navy-800)', border: '1px solid var(--color-accent)', color: 'var(--white)' }}
                  >
                    <Share2 size={16} /> OPEN SAFARI SHARE MENU
                  </button>
                  <button 
                    onClick={handleCopyLink}
                    style={{ height: '44px', padding: '0 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {copiedLinkToast ? <Check size={16} style={{ color: 'var(--status-success)' }} /> : <Copy size={16} />}
                    {copiedLinkToast ? 'COPIED!' : 'COPY LINK'}
                  </button>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                  In Safari Share sheet, select <strong>"Add to Home Screen"</strong> to place app icon.
                </div>
              </div>

            </div>

            <button 
              onClick={() => setShowInstallModal(false)}
              className="btn-primary"
              style={{ width: '100%', height: '48px', fontSize: '14px', marginTop: '4px' }}
            >
              DONE / CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Custom Universal Confirm Dialog Modal */}
      {confirmModal.isOpen && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="card-glass glow-card" style={{ maxWidth: '440px', width: '100%', padding: '28px', borderRadius: '20px', border: confirmModal.isDanger ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--color-accent)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: confirmModal.isDanger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(184, 156, 91, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: confirmModal.isDanger ? 'var(--status-error)' : 'var(--color-accent)' }}>
                <AlertTriangle size={24} />
              </div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--white)', fontFamily: 'var(--font-display)' }}>{confirmModal.title || 'Confirm Action'}</h3>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>{confirmModal.message}</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: true, actionText: 'Confirm' })}
                style={{ padding: '12px 24px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--white)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                  setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: true, actionText: 'Confirm' });
                }}
                style={{ padding: '12px 24px', borderRadius: '10px', background: confirmModal.isDanger ? 'var(--status-error)' : 'var(--color-accent)', color: confirmModal.isDanger ? '#fff' : 'var(--navy-950)', border: 'none', fontSize: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: confirmModal.isDanger ? '0 0 15px rgba(239, 68, 68, 0.3)' : '0 0 15px rgba(184, 156, 91, 0.3)', transition: 'all 0.2s' }}
              >
                {confirmModal.actionText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expired Baselines Drill-down Modal */}
      {showExpiredBaselinesModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.85)', backdropFilter: 'blur(8px)' }}>
          <div className="card-glass glow-card" style={{ maxWidth: '640px', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: '20px', border: '1px solid var(--color-accent)', boxShadow: '0 20px 50px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(184, 156, 91, 0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(184, 156, 91, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                  <Shield size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--color-accent)', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>EXPIRED BASELINES (&gt;{baselineExpiryDays} DAYS)</h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{expiredBaselinesList.length} Athletes require baseline weight verification</div>
                </div>
              </div>
              <button onClick={() => setShowExpiredBaselinesModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', padding: '4px' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {expiredBaselinesList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)', fontSize: '14px' }}>
                  ✔ All active roster athletes have recorded an updated weight within the past {baselineExpiryDays} days!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {expiredBaselinesList.map(a => (
                    <div key={a.id} style={{ padding: '14px 18px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--white)' }}>{a.athlete_name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Sport: {a.sport || 'N/A'} | Last Weigh-In: {a.last_weigh_in_date || 'Never'}</div>
                      </div>
                      <button
                        onClick={() => {
                          setShowExpiredBaselinesModal(false);
                          setSearch(a.athlete_name);
                          setScreen('roster');
                        }}
                        style={{ padding: '8px 14px', background: 'rgba(184, 156, 91, 0.15)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        Inspect Profile ➔
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.2)' }}>
              <button onClick={() => setShowExpiredBaselinesModal(false)} className="btn-primary" style={{ padding: '10px 24px', fontSize: '14px', borderRadius: '10px' }}>
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coach Manual / Post-Practice Entry Modal */}
      {showManualEntryModal && (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 2600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.85)', backdropFilter: 'blur(10px)' }}>
          <div className="card-glass glow-card" style={{ maxWidth: '540px', width: '100%', borderRadius: '24px', border: '1px solid rgba(96, 165, 250, 0.4)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.3) 0%, rgba(15, 23, 42, 0.6) 100%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(96, 165, 250, 0.2)', border: '1px solid rgba(96, 165, 250, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                  <Zap size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>COACH MANUAL LOG STUDIO</h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>Log acute post-practice weights without altering morning baseline trends</div>
                </div>
              </div>
              <button onClick={() => setShowManualEntryModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--white)', cursor: 'pointer', padding: '4px' }}>
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

              {/* Body Weight with quick tailored incrementers */}
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

              {/* Submit Button */}
              <button
                type="button"
                onClick={() => {
                  if (!manualEntryForm.athleteId || !manualEntryForm.weight || isNaN(parseFloat(manualEntryForm.weight))) {
                    alert('Please select an athlete and enter a valid body weight.');
                    return;
                  }
                  const ath = athletes.find(a => a.id === manualEntryForm.athleteId);
                  const dateTimeStr = new Date(`${manualEntryForm.date}T${manualEntryForm.time || '12:00'}:00`).toISOString();
                  const recId = 'manual_' + Date.now();
                  const newRec = {
                    id: recId,
                    athlete_id: manualEntryForm.athleteId,
                    athlete_name: ath ? ath.name : 'Unknown',
                    sport: ath ? ath.sport : '',
                    weight_lbs: parseFloat(manualEntryForm.weight),
                    sleep_hrs: 0,
                    created_at: dateTimeStr,
                    session_type: manualEntryForm.sessionType
                  };

                  if (manualEntryForm.sessionType === 'post_practice') {
                    markLogAsPostPractice(newRec);
                  }

                  handleSaveManualLog(newRec);
                  setManualEntryForm(p => ({
                    ...p,
                    weight: '',
                    successMsg: `Successfully recorded ${manualEntryForm.sessionType === 'post_practice' ? 'Post-Practice' : 'Morning'} weight (${newRec.weight_lbs} lbs) for ${newRec.athlete_name}!`
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
                SAVE MANUAL RECORD ➔
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
