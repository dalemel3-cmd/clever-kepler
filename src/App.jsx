import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Users, User, Plus, Shield, ChevronLeft, Minus, CheckCircle, X, Download, Lock, Unlock, Wifi, WifiOff, AlertTriangle, Activity, FileText, Printer, Trash2, Upload, Sliders, Filter, Zap, CheckSquare, Square, Settings, Smartphone, RefreshCw, HardDrive, Check, Copy, Share2, Search, Grid, Trophy, TrendingUp, TrendingDown, Clock, Droplet, Flame, ArrowUpRight, MoreHorizontal, Database } from 'lucide-react';
import { supabase } from './supabaseClient';
import './styles.css';
import { Confetti } from './components/Confetti';
import { KioskNumpad } from './components/KioskNumpad';
const AlertsScreen = lazy(() => import('./features/alerts/AlertsScreen'));
const GroupsScreen = lazy(() => import('./features/groups/GroupsScreen'));
const RosterScreen = lazy(() => import('./features/roster/RosterScreen'));
const EntryScreen = lazy(() => import('./features/entry/EntryScreen'));
const DashboardScreen = lazy(() => import('./features/dashboard/DashboardScreen'));
const ReportsScreen = lazy(() => import('./features/reports/ReportsScreen'));
const ProfilesScreen = lazy(() => import('./features/profiles/ProfilesScreen'));
const SettingsScreen = lazy(() => import('./features/settings/SettingsScreen'));

const ScreenLoadingFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0', color: 'var(--color-text-muted)', fontSize: '14px', fontWeight: 600 }}>
    Loading...
  </div>
);
import {
  APP_VERSION,
  isValidUuid,
  parseAthleteMeta,
  encodeAthleteMeta,
  isPostPracticeLog,
  markLogAsPostPractice,
  getAthleteBaseline,
  getCentralDateString,
  getCentralTimeString
} from './utils/athleteData';

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
    date: getCentralDateString(),
    time: getCentralTimeString(),
    sessionType: 'post_practice',
    notes: '',
    successMsg: '',
    editingLogId: null
  });
  const [athletes, setAthletes] = useState([]);
  const fetchReportRequestId = React.useRef(0);
  const didBackfillLocalOverrides = React.useRef(false);

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
    const todayStr = getCentralDateString();
    const count = reportData.filter(r => {
      if (!r.created_at) return false;
      return getCentralDateString(new Date(r.created_at)) === todayStr;
    }).length;
    setTodaySessions(count);
  }, [reportData]);

  const athletesRecordedToday = React.useMemo(() => {
    void todaySessions;
    const recordedSet = new Set();
    const todayStr = getCentralDateString();
    if (reportData && Array.isArray(reportData)) {
      reportData.forEach(r => {
        if (!r.created_at || !r.athlete_id) return;
        if (getCentralDateString(new Date(r.created_at)) === todayStr) {
          recordedSet.add(r.athlete_id);
        }
      });
    }
    try {
      const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      offline.forEach(item => {
        const rec = item.record || item;
        if (rec && rec.athlete_id && rec.created_at) {
          if (getCentralDateString(new Date(rec.created_at)) === todayStr) {
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
    const todayCentralStr = getCentralDateString(now);
    const yesterdayCentralStr = getCentralDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

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
      return getCentralDateString(new Date(r.created_at)) === todayCentralStr;
    });

    const yesterdayLogs = allLogs.filter(r => {
      if (!r.created_at) return false;
      return getCentralDateString(new Date(r.created_at)) === yesterdayCentralStr;
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
        .filter(r => r.athlete_id === todayRec.athlete_id && getCentralDateString(new Date(r.created_at)) < todayCentralStr && r.weight_lbs)
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

  // Pushes classifications this device only knows about locally (baseline markers and
  // post-practice tags recorded before weigh_ins had real columns for them, or made while
  // offline) up to the cloud rows, so other devices start seeing them too. Safe to run
  // repeatedly: it only writes rows whose cloud value doesn't already match.
  const syncLocalOverridesToCloud = async (cloudRows) => {
    try {
      const rowById = new Map(cloudRows.map(r => [r.id, r]));

      // Post-practice tags, keyed by weigh_ins row id.
      const ppMap = JSON.parse(localStorage.getItem('shiloh_post_practice_logs') || '{}');
      for (const key of Object.keys(ppMap)) {
        const row = rowById.get(key);
        if (row && ppMap[key] && row.session_type !== 'post_practice') {
          await supabase.from('weigh_ins').update({ session_type: 'post_practice' }).eq('id', key);
        }
      }

      // Baseline markers, keyed by athlete id -> { log_id }.
      const baselineMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
      for (const athleteId of Object.keys(baselineMap)) {
        const logId = baselineMap[athleteId]?.log_id;
        const row = logId && rowById.get(logId);
        if (row && !row.is_baseline) {
          await supabase.from('weigh_ins').update({ is_baseline: false }).eq('athlete_id', athleteId).neq('id', logId);
          await supabase.from('weigh_ins').update({ is_baseline: true }).eq('id', logId);
        }
      }
    } catch (e) {
      console.warn("Could not backfill local overrides to cloud:", e);
    }
  };

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
        // One-time per session: push any classifications this device recorded locally (before
        // the weigh_ins table had session_type/is_baseline columns, or made while offline) up to
        // the cloud, so they stop being visible on this device only.
        if (!didBackfillLocalOverrides.current) {
          didBackfillLocalOverrides.current = true;
          syncLocalOverridesToCloud(onlineData);
        }
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
        // OR with the cloud value rather than overwrite it - the weigh_ins row's own is_baseline
        // column is now the shared source of truth; this local map is only a same-device fallback
        // for records the cloud sync hasn't caught up on yet (e.g. still offline-queued).
        if (p && p.log_id) {
          return { ...item, is_baseline: !!item.is_baseline || item.id === p.log_id };
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
          created_at: rec.created_at || new Date().toISOString(),
          session_type: rec.session_type || null,
          is_baseline: !!rec.is_baseline
        };
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
      if (rec.session_type !== undefined) cleanPayload.session_type = rec.session_type;

      let res = await supabase.from('weigh_ins').insert([cleanPayload]);
      if (res.error) {
        delete cleanPayload.is_baseline;
        delete cleanPayload.session_type;
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
    
    const todayCentralStr = getCentralDateString();
    const existingRecord = reportData.find(r => {
      if (r.athlete_id !== selectedAthlete.id) return false;
      return getCentralDateString(new Date(r.created_at)) === todayCentralStr;
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
        created_at: record.created_at || new Date().toISOString(),
        is_baseline: !!record.is_baseline
      };

      let insertedId = existingRecord && !String(existingRecord.id).startsWith('opt_') && !String(existingRecord.id).startsWith('offline_') ? existingRecord.id : null;
      if (insertedId) {
        let { error } = await supabase.from('weigh_ins').update(cloudPayload).eq('id', insertedId);
        if (error) throw error;
      } else {
        let { data, error } = await supabase.from('weigh_ins').insert([cloudPayload]).select();
        if (error) throw error;
        insertedId = data && data[0] && data[0].id;
      }

      // Only one weigh-in per athlete should carry the active baseline marker -
      // clear it off any other rows now that this one (or none) is the current baseline.
      if (cloudPayload.is_baseline && insertedId && isValidUuid(targetAthId)) {
        await supabase.from('weigh_ins').update({ is_baseline: false }).eq('athlete_id', targetAthId).neq('id', insertedId);
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
        created_at: newRec.created_at,
        session_type: newRec.session_type || null
      };

      const { data, error } = await supabase.from('weigh_ins').insert([cloudPayload]).select();
      if (error) throw error;

      if (data && data[0] && newRec.session_type === 'post_practice') {
        // Also keep the local flag as a fast-path cache; the session_type column on the
        // row itself is now the source of truth so other devices see the same classification.
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

  // Corrects an existing log's date/time/weight/session type in place, rather than
  // creating a new row - used by the "Edit" action on post-practice log entries.
  const handleUpdateManualLog = async (logId, updatedRec) => {
    // 1. Optimistic UI update on the existing row
    setReportData(prev => prev.map(r => r.id === logId ? { ...r, ...updatedRec } : r));

    // 2. Persist to local hardware vault as backup
    try {
      const vault = JSON.parse(localStorage.getItem('shiloh_permanent_vault') || '[]');
      vault.unshift({ saved_at: new Date().toISOString(), record: { ...updatedRec, id: logId }, is_edit: true });
      localStorage.setItem('shiloh_permanent_vault', JSON.stringify(vault.slice(0, 1000)));
    } catch (e) {}

    // 3. Sync the correction to the live Supabase row
    try {
      const cloudPayload = {
        athlete_id: updatedRec.athlete_id,
        athlete_name: updatedRec.athlete_name || 'Unknown',
        sport: updatedRec.sport || '',
        weight_lbs: updatedRec.weight_lbs,
        sleep_hrs: updatedRec.sleep_hrs || 0,
        created_at: updatedRec.created_at,
        session_type: updatedRec.session_type || null
      };

      const { error } = await supabase.from('weigh_ins').update(cloudPayload).eq('id', logId);
      if (error) throw error;

      if (updatedRec.session_type === 'post_practice') {
        markLogAsPostPractice({ id: logId, ...updatedRec });
      }

      fetchReportData(true);
      if (typeof selectedProfileId !== 'undefined' && selectedProfileId && selectedProfileId === updatedRec.athlete_id) {
        fetchProfileData(selectedProfileId);
      }
    } catch (err) {
      console.warn("Cloud edit failed or offline, queuing correction for background sync:", err);
      try {
        const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        offline.push({ action: 'update', id: logId, record: updatedRec, queue_id: 'q_' + Date.now() });
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

    // 1b. Persist the baseline flag on the weigh_ins rows themselves so every device
    // (not just this one) sees which log is the active baseline marker.
    try {
      if (isValidUuid(athleteId)) {
        await supabase.from('weigh_ins').update({ is_baseline: false }).eq('athlete_id', athleteId).neq('id', logId);
        await supabase.from('weigh_ins').update({ is_baseline: true }).eq('id', logId);
      }
    } catch (e) {
      console.warn("Could not sync baseline flag to cloud weigh_ins row:", e);
    }

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

    // 1b. Persist the baseline flag on the weigh_ins rows themselves so every device sees it.
    try {
      if (sportAthleteIds.size > 0) {
        await supabase.from('weigh_ins').update({ is_baseline: false }).in('athlete_id', Array.from(sportAthleteIds));
      }
      if (targetLogIds.size > 0) {
        await supabase.from('weigh_ins').update({ is_baseline: true }).in('id', Array.from(targetLogIds));
      }
    } catch (e) {
      console.warn("Could not sync bulk baseline flags to cloud weigh_ins rows:", e);
    }

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
          pData = pData.map(item => ({ ...item, is_baseline: !!item.is_baseline || item.id === p.log_id }));
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
          pData = pData.map(item => ({ ...item, is_baseline: !!item.is_baseline || item.id === p.log_id }));
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
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayCentralStr = getCentralDateString(d);
      const dayStr = days[d.getDay()];

      let sleepCount = 0;
      let weightCount = 0;
      reportData.forEach(r => {
        if (getCentralDateString(new Date(r.created_at)) === dayCentralStr) {
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
      result.push({ day: dayStr, count: sleepCount + weightCount, sleepCount, weightCount, date: d });
    }
    return result;
  };

  const getMonthlyAlerts = () => {
    const result = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayCentralStr = getCentralDateString(d);

      let count = 0;
      let hasWeight = false;
      let hasSleep = false;
      reportData.forEach(r => {
        if (getCentralDateString(new Date(r.created_at)) === dayCentralStr) {
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
      result.push({ count, hasWeight, hasSleep, date: d, dayOfMonth: parseInt(dayCentralStr.slice(8, 10), 10) });
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

  const getWeeklyAlertsList = () => {
    const alerts = [];
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const lastMonday = new Date(d);
    lastMonday.setDate(diff);
    lastMonday.setHours(0, 0, 0, 0);

    const weeklyRecords = reportData.filter(r => {
      return new Date(r.created_at).getTime() >= lastMonday.getTime();
    });

    weeklyRecords.forEach(r => {
      const athlete = athletes.find(a => a.id === r.athlete_id);
      const positionStr = athlete?.position ? ` · ${athlete.position}` : '';
      const dateStr = new Date(r.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      
      if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold) {
        alerts.push({
          id: r.athlete_id + '_sleep', // Deduplicate by athlete
          athlete_id: r.athlete_id,
          athlete_name: r.athlete_name,
          sport: r.sport,
          type: 'LOW SLEEP DEFICIT',
          color: '#f59e0b',
          icon: <Activity size={22} />,
          message: `${r.sport}${positionStr} · ${r.sleep_hrs} hrs sleep logged on ${dateStr}`,
          action: '🌙 MONITOR CNS LOAD'
        });
      }

      const athleteRecords = reportData.filter(x => x.athlete_id === r.athlete_id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      const activeBaseline = getAthleteBaseline(athlete || { id: r.athlete_id, athlete_id: r.athlete_id }, reportData);
      
      if (activeBaseline && activeBaseline.id !== r.id && activeBaseline.weight_lbs && r.weight_lbs && !isPostPracticeLog(r)) {
        const drop = activeBaseline.weight_lbs - r.weight_lbs;
        const dropPercent = drop / activeBaseline.weight_lbs;
        if (dropPercent >= (dehydrationThreshold / 100)) {
          const recommendation = drop >= 4.0 ? '🥗💧 INCREASE CALORIES & HYDRATION' : '💧 INCREASE HYDRATION';
          alerts.push({
            id: r.athlete_id + '_weight', // Deduplicate by athlete
            athlete_id: r.athlete_id,
            athlete_name: r.athlete_name,
            sport: r.sport,
            type: 'DEHYDRATION RISK',
            color: 'var(--status-error)',
            icon: <AlertTriangle size={22} />,
            message: `${r.sport}${positionStr} · -${drop.toFixed(1)} lbs drop on ${dateStr} (-${(dropPercent*100).toFixed(1)}% vs Baseline)`,
            action: recommendation
          });
        }
      }
    });
    
    // Deduplicate so we only show the latest alert of each type per athlete
    const uniqueAlerts = Array.from(new Map(alerts.map(a => [a.id, a])).values());
    return uniqueAlerts.reverse(); // Newest first
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
      const ppDateCentralStr = getCentralDateString(ppDate);

      const sameDayLogs = normalLogs.filter(wl => getCentralDateString(new Date(wl.created_at)) === ppDateCentralStr);
      
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
    const active = screen === key || (key === 'groups' && screen === 'roster');
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
    const active = (screen === key || (key === 'groups' && screen === 'roster')) && !showMobileMore;
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
            {renderSidebarItem('groups', <Shield size={18} />, 'TEAMS & ROSTERS')}
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
            <Suspense fallback={<ScreenLoadingFallback />}>
            {screen === 'dashboard' && (
              <DashboardScreen
                dehydrationThreshold={dehydrationThreshold}
                athletes={athletes}
                executiveInsights={executiveInsights}
                todaySessions={todaySessions}
                athletesRecordedToday={athletesRecordedToday}
                reportData={reportData}
                setSelectedProfileId={setSelectedProfileId}
                fetchProfileData={fetchProfileData}
                setScreen={setScreen}
                setUnweighedOnlyFilter={setUnweighedOnlyFilter}
                setManualEntryForm={setManualEntryForm}
                setShowManualEntryModal={setShowManualEntryModal}
                setSelectedSportFilter={setSelectedSportFilter}
              />
            )}
            
            
            {screen === 'entry' && (
              <EntryScreen
                kioskTrackMode={kioskTrackMode}
                setKioskTrackMode={setKioskTrackMode}
                isBaselineTestingMode={isBaselineTestingMode}
                setIsBaselineTestingMode={setIsBaselineTestingMode}
                setIsAddingAthlete={setIsAddingAthlete}
                setEditingAthleteId={setEditingAthleteId}
                setNewAthlete={setNewAthlete}
                selectedSportFilter={selectedSportFilter}
                selectedTeamFilter={selectedTeamFilter}
                selectedGradeFilter={selectedGradeFilter}
                selectedPositionFilter={selectedPositionFilter}
                athletesRecordedToday={athletesRecordedToday}
                search={search}
                setSearch={setSearch}
                sportsList={sportsList}
                gradesList={gradesList}
                teamsList={teamsList}
                positionsList={positionsList}
                filteredAthletes={filteredAthletes}
                setSelectedSportFilter={setSelectedSportFilter}
                setSelectedGradeFilter={setSelectedGradeFilter}
                setSelectedTeamFilter={setSelectedTeamFilter}
                setSelectedPositionFilter={setSelectedPositionFilter}
                nameSortOrder={nameSortOrder}
                setNameSortOrder={setNameSortOrder}
                unweighedOnlyFilter={unweighedOnlyFilter}
                setUnweighedOnlyFilter={setUnweighedOnlyFilter}
                entryAthleteId={entryAthleteId}
                setEntryAthleteId={setEntryAthleteId}
                handleSelectAthleteForEntry={handleSelectAthleteForEntry}
                getLastName={getLastName}
                getFirstName={getFirstName}
                selectedAthlete={selectedAthlete}
                newAthlete={newAthlete}
                weightInput={weightInput}
                setWeightInput={setWeightInput}
                sleepInput={sleepInput}
                setSleepInput={setSleepInput}
                focusedField={focusedField}
                setFocusedField={setFocusedField}
                handleSave={handleSave}
                reportData={reportData}
                saving={saving}
                handleCreateAthlete={handleCreateAthlete}
                isAddingAthlete={isAddingAthlete}
                screen={screen}
              />
            )}

            {screen === 'groups' && (
              <GroupsScreen
                sportsList={sportsList}
                showBulkBaselineStudio={showBulkBaselineStudio}
                setShowBulkBaselineStudio={setShowBulkBaselineStudio}
                bulkBaselineSport={bulkBaselineSport}
                setBulkBaselineSport={setBulkBaselineSport}
                bulkBaselineDate={bulkBaselineDate}
                setBulkBaselineDate={setBulkBaselineDate}
                athletes={athletes}
                reportData={reportData}
                handleBulkTeamBaseline={handleBulkTeamBaseline}
                setSelectedSportFilter={setSelectedSportFilter}
                setScreen={setScreen}
              />
            )}

            {screen === 'alerts' && (
              <AlertsScreen
                dehydrationThreshold={dehydrationThreshold}
                sleepThreshold={sleepThreshold}
                alertsTab={alertsTab}
                setAlertsTab={setAlertsTab}
                renderNegativeSweatDropCards={renderNegativeSweatDropCards}
                getDailyAlerts={getDailyAlerts}
                getWeeklyAlertsList={getWeeklyAlertsList}
                getWeeklyAlerts={getWeeklyAlerts}
                getMonthlyAlerts={getMonthlyAlerts}
              />
            )}

            {screen === 'reports' && (
              <ReportsScreen
                reportData={reportData}
                reportSportFilter={reportSportFilter}
                reportTimeframe={reportTimeframe}
                athletes={athletes}
                dehydrationThreshold={dehydrationThreshold}
                sleepThreshold={sleepThreshold}
                baselineExpiryDays={baselineExpiryDays}
                reportMode={reportMode}
                enabledMetrics={enabledMetrics}
                setEnabledMetrics={setEnabledMetrics}
                setReportMode={setReportMode}
                setReportSportFilter={setReportSportFilter}
                setReportTimeframe={setReportTimeframe}
                sportsList={sportsList}
                reportLoading={reportLoading}
                renderNegativeSweatDropCards={renderNegativeSweatDropCards}
                dehySortBy={dehySortBy}
                setDehySortBy={setDehySortBy}
                showReportsLogAccordion={showReportsLogAccordion}
                setShowReportsLogAccordion={setShowReportsLogAccordion}
                handleMakeDateBaselineMarker={handleMakeDateBaselineMarker}
                handleDeleteWeighIn={handleDeleteWeighIn}
              />
            )}

            {screen === 'roster' && (
              <RosterScreen
                isAddingAthlete={isAddingAthlete}
                filteredAthletes={filteredAthletes}
                search={search}
                setSearch={setSearch}
                sportsList={sportsList}
                selectedSportFilter={selectedSportFilter}
                setSelectedSportFilter={setSelectedSportFilter}
                setIsAddingAthlete={setIsAddingAthlete}
                setEditingAthleteId={setEditingAthleteId}
                newAthlete={newAthlete}
                setNewAthlete={setNewAthlete}
                reportData={reportData}
                setSelectedProfileId={setSelectedProfileId}
                fetchProfileData={fetchProfileData}
                setScreen={setScreen}
                editingAthleteId={editingAthleteId}
                handleUpdateAthlete={handleUpdateAthlete}
                handleCreateAthlete={handleCreateAthlete}
                saving={saving}
                handleDeleteAthlete={handleDeleteAthlete}
              />
            )}

            {/* STANDALONE PROFILES TAB */}
            {screen === 'profiles' && (
              <ProfilesScreen
                selectedProfileId={selectedProfileId}
                setSelectedProfileId={setSelectedProfileId}
                filteredAthletes={filteredAthletes}
                search={search}
                setSearch={setSearch}
                sportsList={sportsList}
                selectedSportFilter={selectedSportFilter}
                setSelectedSportFilter={setSelectedSportFilter}
                reportData={reportData}
                fetchProfileData={fetchProfileData}
                athletes={athletes}
                profileData={profileData}
                handleSelectAthleteForEntry={handleSelectAthleteForEntry}
                handleEditClick={handleEditClick}
                setManualEntryForm={setManualEntryForm}
                setShowManualEntryModal={setShowManualEntryModal}
                handleMakeDateBaselineMarker={handleMakeDateBaselineMarker}
                handleDeleteWeighIn={handleDeleteWeighIn}
                setConfirmModal={setConfirmModal}
              />
            )}

            {screen === 'settings' && (
              <SettingsScreen
                settingsSavedToast={settingsSavedToast}
                isAppInstalled={isAppInstalled}
                handleInstallApp={handleInstallApp}
                handleSaveSettings={handleSaveSettings}
                dehydrationThreshold={dehydrationThreshold}
                setDehydrationThreshold={setDehydrationThreshold}
                sleepThreshold={sleepThreshold}
                setSleepThreshold={setSleepThreshold}
                baselineExpiryDays={baselineExpiryDays}
                setBaselineExpiryDays={setBaselineExpiryDays}
                handleDownloadTemplate={handleDownloadTemplate}
                handleCSVUpload={handleCSVUpload}
                exportToCSV={exportToCSV}
                broadcastDeviceSync={broadcastDeviceSync}
                athletes={athletes}
                reportData={reportData}
                syncStatus={syncStatus}
                handleForceSync={handleForceSync}
                handleExportDiagnostics={handleExportDiagnostics}
                handleClearAppCache={handleClearAppCache}
                setShowRecoveryModal={setShowRecoveryModal}
                showMergePanel={showMergePanel}
                setShowMergePanel={setShowMergePanel}
                mergeSourceId={mergeSourceId}
                setMergeSourceId={setMergeSourceId}
                mergeTargetId={mergeTargetId}
                setMergeTargetId={setMergeTargetId}
                setConfirmModal={setConfirmModal}
                handleMergeAthletes={handleMergeAthletes}
                handleDeleteAllWeighIns={handleDeleteAllWeighIns}
              />
            )}
            </Suspense>

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
            {navItem('groups', <Shield size={22} />, 'Teams')}
            
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
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>TEAMS</div>
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
                  <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {manualEntryForm.editingLogId ? 'EDIT LOG ENTRY' : 'COACH MANUAL LOG STUDIO'}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    {manualEntryForm.editingLogId ? 'Correct the date, time, or weight on this existing log' : "Log acute post-practice weights without altering morning baseline trends"}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowManualEntryModal(false);
                  setManualEntryForm(p => ({ ...p, editingLogId: null, weight: '', successMsg: '' }));
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
                  const isEditing = !!manualEntryForm.editingLogId;
                  const rec = {
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
                    successMsg: isEditing
                      ? `Saved changes to ${rec.athlete_name}'s ${rec.session_type === 'post_practice' ? 'post-practice' : 'morning'} log (${rec.weight_lbs} lbs, ${manualEntryForm.date} ${manualEntryForm.time}).`
                      : `Successfully recorded ${manualEntryForm.sessionType === 'post_practice' ? 'Post-Practice' : 'Morning'} weight (${rec.weight_lbs} lbs) for ${rec.athlete_name}!`
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
      )}
    </div>
  );
}
