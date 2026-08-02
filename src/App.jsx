import React, { useState, useEffect } from 'react';
import { Users, Plus, Shield, ChevronLeft, Minus, CheckCircle, X, Download, Lock, Unlock, Wifi, WifiOff, AlertTriangle, Activity, FileText, Printer, Trash2, Upload, Sliders, Filter, Zap, CheckSquare, Square, Settings, Smartphone, RefreshCw, HardDrive, HelpCircle, Check, Copy, Share2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
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

// App Version Tracking
const APP_VERSION = 'v1.5';

const KioskNumpad = ({ value, onChange, onEnter }) => {
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

  const setScreen = (newScreen) => {
    setScreenState(newScreen);
    window.location.hash = newScreen;
  };
  const [search, setSearch] = useState('');
  const [selectedSportFilter, setSelectedSportFilter] = useState('ALL');
  const [selectedTeamFilter, setSelectedTeamFilter] = useState('ALL');
  const [nameSortOrder, setNameSortOrder] = useState('first'); // 'first' | 'last'
  const [athletes, setAthletes] = useState([]);

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
      const q = search.toLowerCase();
      const matchesSearch = search === '' || 
        a.name.toLowerCase().includes(q) ||
        (a.sport && a.sport.toLowerCase().includes(q)) ||
        (a.team && a.team.toLowerCase().includes(q)) ||
        (a.position && a.position.toLowerCase().includes(q));

      const matchesSport = selectedSportFilter === 'ALL' || a.sport === selectedSportFilter;
      const matchesTeam = selectedTeamFilter === 'ALL' || a.team === selectedTeamFilter;

      return matchesSearch && matchesSport && matchesTeam;
    })
    .sort((a, b) => {
      if (nameSortOrder === 'last') {
        const lastA = getLastName(a.name).toLowerCase();
        const lastB = getLastName(b.name).toLowerCase();
        if (lastA !== lastB) return lastA.localeCompare(lastB);
        return getFirstName(a.name).toLowerCase().localeCompare(getFirstName(b.name).toLowerCase());
      } else {
        const firstA = getFirstName(a.name).toLowerCase();
        const firstB = getFirstName(b.name).toLowerCase();
        if (firstA !== firstB) return firstA.localeCompare(firstB);
        return getLastName(a.name).toLowerCase().localeCompare(getLastName(b.name).toLowerCase());
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

  // Reports State
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMode, setReportMode] = useState('quick'); // 'quick' | 'custom'
  const [reportSportFilter, setReportSportFilter] = useState('ALL');
  const [reportTimeframe, setReportTimeframe] = useState('all'); // 'today' | '7d' | '30d' | 'all'
  const [enabledMetrics, setEnabledMetrics] = useState({
    teamSummary: true,
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
  const [newAthlete, setNewAthlete] = useState({ name: '', sport: '', team: '', position: '' });
  
  // Alerts State
  const [alertsTab, setAlertsTab] = useState('DAILY');

  // Settings & PWA State
  const [dehydrationThreshold, setDehydrationThreshold] = useState(2.0); // %
  const [sleepThreshold, setSleepThreshold] = useState(6.5); // hrs
  const [baselineExpiryDays, setBaselineExpiryDays] = useState(14); // days
  const [settingsSavedToast, setSettingsSavedToast] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [copiedLinkToast, setCopiedLinkToast] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    fetchAthletes();

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setScreenState(hash || 'dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);

    // Auto-sync offline cache when internet reconnects
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineCache();
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
    setSettingsSavedToast(true);
    setTimeout(() => setSettingsSavedToast(false), 3000);
  };

  const handleForceSync = async () => {
    setSyncStatus('SYNCING CLOUD DATA...');
    await fetchAthletes();
    await fetchReportData();
    setSyncStatus('ALL CLOUD DATA SYNCED CLEANLY!');
    setTimeout(() => setSyncStatus(''), 3000);
  };

  const handleExportDiagnostics = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      athlete_count: athletes.length,
      report_count: reportData.length,
      thresholds: { dehydrationThreshold, sleepThreshold, baselineExpiryDays },
      athletes: athletes.map(a => ({ id: a.id, name: a.name, sport: a.sport, team: a.team })),
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `hpd_diagnostics_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleClearAppCache = () => {
    if (window.confirm("Are you sure you want to clear browser local cache? This will refresh your session.")) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    setReportLoading(true);
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
        setReportData(data);
        localStorage.setItem('shiloh_reports', JSON.stringify(data));
      } else if (error) {
        throw error;
      }
    } catch {
      console.warn("Could not fetch report data from Supabase. Loading local cache.");
      try {
        const cached = JSON.parse(localStorage.getItem('shiloh_reports'));
        if (cached && Array.isArray(cached)) setReportData(cached);
      } catch (e) {
        console.warn("Local cache empty or invalid.");
      }
    } finally {
      setReportLoading(false);
    }
  };

  const syncOfflineCache = async () => {
    const offlineQueue = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
    if (offlineQueue.length === 0) return;

    try {
      let syncFailed = false;
      for (const item of offlineQueue) {
        if (item.action === 'update') {
          const { error } = await supabase.from('weigh_ins').update(item.record).eq('id', item.id);
          if (error) syncFailed = true;
        } else {
          const { error } = await supabase.from('weigh_ins').insert([item.record || item]);
          if (error) syncFailed = true;
        }
      }
      
      if (!syncFailed) {
        localStorage.removeItem('shiloh_offline_weigh_ins');
        console.log("Successfully synced offline queue to Supabase!");
        fetchReportData();
      } else {
        console.warn("Some items failed to sync.");
      }
    } catch {
      console.warn("Could not sync offline queue yet.");
    }
  };

  const fetchAthletes = async () => {
    try {
      if (!navigator.onLine) throw new Error('Offline');
      const { data, error } = await supabase.from('athletes').select('*').order('name', { ascending: true });
      if (!error && data) {
        setAthletes(data);
        localStorage.setItem('shiloh_roster', JSON.stringify(data));
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
      const gradeIdx = headers.indexOf('grade');
      
      if (nameIdx === -1 || sportIdx === -1 || gradeIdx === -1) {
        return alert("CSV must have headers exactly matching: Athlete, Sport, Grade");
      }

      const athletesToInsert = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length > Math.max(nameIdx, sportIdx, gradeIdx) && cols[nameIdx]) {
          athletesToInsert.push({
            name: cols[nameIdx],
            sport: cols[sportIdx],
            team: cols[gradeIdx],
            position: '',
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
    const csvContent = "Athlete,Sport,Grade\nJohn Doe,Football,Varsity\nJane Smith,Basketball,JV";
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
  const sportsList = Array.from(new Set(athletes.map(a => a.sport).filter(Boolean)));
  const teamsList = Array.from(new Set(athletes.map(a => a.team).filter(Boolean)));

  const handleSelectAthleteForEntry = (athleteId) => {
    setEntryAthleteId(athleteId);
    setScreen('entry');
    
    // Find latest record for baseline
    const records = reportData.filter(r => r.athlete_id === athleteId);
    if (records.length > 0) {
      const sorted = [...records].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      setWeightInput(String(sorted[sorted.length - 1].weight_lbs));
    } else {
      setWeightInput('0.0');
    }
    setSleepInput('');
    setFocusedField('weight');
  };

  const handleSave = async () => {
    if (!selectedAthlete || !weightInput) return;
    
    const now = new Date();
    const existingRecord = reportData.find(r => {
      if (r.athlete_id !== selectedAthlete.id) return false;
      const recordDate = new Date(r.created_at);
      return recordDate.getFullYear() === now.getFullYear() && 
             recordDate.getMonth() === now.getMonth() && 
             recordDate.getDate() === now.getDate();
    });
    
    if (existingRecord) {
      if (!window.confirm("A record already exists for today. Do you want to override it?")) return;
    }
    
    setSaving(true);
    const record = { 
      athlete_id: selectedAthlete.id, 
      athlete_name: selectedAthlete.name,
      sport: selectedAthlete.sport,
      weight_lbs: parseFloat(weightInput),
      sleep_hrs: parseFloat(sleepInput || 0),
      created_at: new Date().toISOString()
    };

    try {
      if (existingRecord) {
        const { error } = await supabase.from('weigh_ins').update(record).eq('id', existingRecord.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('weigh_ins').insert([record]);
        if (error) throw error;
      }
      
      // Update local data immediately
      fetchReportData();
      syncOfflineCache();
    } catch (err) {
      console.warn("Supabase offline, saving locally:", err);
      try {
        const existing = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
        existing.push({
          action: existingRecord ? 'update' : 'insert',
          id: existingRecord ? existingRecord.id : null,
          record
        });
        localStorage.setItem('shiloh_offline_weigh_ins', JSON.stringify(existing));
      } catch (e) {
        console.warn("LocalStorage warning:", e);
      }
    }
      
    // Instant Return
    setSaving(false);
    setSaved(false); // No confetti
    setTodaySessions(prev => prev + 1);
    setWeightInput('');
    setSleepInput('');
    setEntryAthleteId(null);
    setSearch('');
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

  const handleDeleteWeighIn = async (id) => {
    if (!window.confirm("Are you sure you want to delete this weigh-in record?")) return;
    try {
      const { error } = await supabase.from('weigh_ins').delete().eq('id', id);
      if (error) throw error;
      fetchReportData();
    } catch (err) {
      console.error("Could not delete weigh in:", err);
      alert("Failed to delete record.");
    }
  };

  const handleDeleteAllWeighIns = async () => {
    if (!window.confirm("WARNING: Are you sure you want to wipe ALL weigh-in data? This cannot be undone.")) return;
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
    if (!newAthlete.name) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('athletes')
        .insert([newAthlete])
        .select();
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        setAthletes(prev => [...prev, data[0]]);
      }
      setIsAddingAthlete(false);
      setNewAthlete({ name: '', sport: '', team: '', position: '' });
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
    setNewAthlete({ name: athlete.name, sport: athlete.sport, team: athlete.team, position: athlete.position });
    setIsAddingAthlete(true);
  };

  const fetchProfileData = async (id) => {
    try {
      const { data, error } = await supabase
        .from('weigh_ins')
        .select('*')
        .eq('athlete_id', id)
        .order('created_at', { ascending: true })
        .limit(14);
      if (error) throw error;
      setProfileData(data || []);
    } catch {
      console.warn("Could not fetch profile data");
      setProfileData([]);
    }
  };

  const handleUpdateAthlete = async () => {
    if (!newAthlete.name) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('athletes')
        .update(newAthlete)
        .eq('id', editingAthleteId)
        .select();
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        setAthletes(prev => prev.map(a => a.id === editingAthleteId ? data[0] : a));
      }
      setIsAddingAthlete(false);
      setEditingAthleteId(null);
      setNewAthlete({ name: '', sport: '', team: '', position: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error updating athlete:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAthlete = async () => {
    if (!window.confirm("Are you sure you want to delete this athlete and all their records?")) return;
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
      setNewAthlete({ name: '', sport: '', team: '', position: '' });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error deleting athlete:", err);
      alert("Could not delete athlete: " + err.message);
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
      
      const count = reportData.filter(r => {
        const recordDate = new Date(r.created_at);
        return recordDate >= startOfDay && recordDate < endOfDay && r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < 6.5;
      }).length;
      result.push({ day: dayStr, count, date: startOfDay });
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
      
      const count = reportData.filter(r => {
        const recordDate = new Date(r.created_at);
        return recordDate >= startOfDay && recordDate < endOfDay && r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < 6.5;
      }).length;
      result.push({ count, date: startOfDay });
    }
    return result;
  };

  const getDailyAlerts = () => {
    const today = new Date();
    const alerts = [];
    
    // Get today's records
    const todaysRecords = reportData.filter(r => {
      const rd = new Date(r.created_at);
      return rd.getFullYear() === today.getFullYear() && rd.getMonth() === today.getMonth() && rd.getDate() === today.getDate();
    });

    todaysRecords.forEach(r => {
      const athlete = athletes.find(a => a.id === r.athlete_id);
      const positionStr = athlete?.position ? ` · ${athlete.position}` : '';
      
      // Check sleep
      if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < 6.5) {
        alerts.push({
          id: r.id + '_sleep',
          athlete_id: r.athlete_id,
          athlete_name: r.athlete_name,
          sport: r.sport,
          type: 'LOW SLEEP',
          color: '#f59e0b',
          icon: <Activity size={22} />,
          message: `${r.sport}${positionStr} · ${r.sleep_hrs} hrs sleep logged`,
          action: 'MONITOR CNS LOAD'
        });
      }

      // Check weight drop
      const athleteRecords = reportData.filter(x => x.athlete_id === r.athlete_id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
      const currentIndex = athleteRecords.findIndex(x => x.id === r.id);
      if (currentIndex > 0) {
        const prev = athleteRecords[currentIndex - 1];
        if (prev && prev.weight_lbs && r.weight_lbs) {
          const drop = prev.weight_lbs - r.weight_lbs;
          const dropPercent = drop / prev.weight_lbs;
          if (dropPercent >= 0.02) {
            alerts.push({
              id: r.id + '_weight',
              athlete_id: r.athlete_id,
              athlete_name: r.athlete_name,
              sport: r.sport,
              type: 'DEHYDRATION RISK',
              color: 'var(--status-error)',
              icon: <AlertTriangle size={22} />,
              message: `${r.sport}${positionStr} · -${drop.toFixed(1)} lbs drop (-${(dropPercent*100).toFixed(1)}% body mass)`,
              action: 'INCREASE HYDRATION'
            });
          }
        }
      }
    });

    return alerts;
  };

  const renderSidebarItem = (key, icon, label) => {
    const active = screen === key;
    return (
      <div onClick={() => { setScreen(key); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }} 
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
    const active = screen === key;
    return (
      <div onClick={() => { setScreen(key); setSaved(false); setSelectedProfileId(null); setIsAddingAthlete(false); }} 
           style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', width: '56px',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
        {icon}
        <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="app-layout">
      {saved && <Confetti />}
      
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
        
        {/* Connection Status Badge */}
        <div style={{
          position: 'fixed',
          bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
          right: '16px',
          background: isOnline ? 'rgba(34, 197, 94, 0.9)' : 'rgba(239, 68, 68, 0.9)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '24px',
          fontSize: '12px',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`
        }}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          {isOnline ? 'ONLINE' : 'OFFLINE MODE - SYNC PENDING'}
        </div>

        {/* Top Header */}
        <div style={{ flex: 'none', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          {isKioskMode ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em' }}>HPD APP &middot; KIOSK MODE</span>
                <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--status-success)', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Wifi size={12} /> FAIL-SAFE ACTIVE
                </span>
              </div>
              <button 
                onClick={() => setIsKioskMode(false)}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Unlock size={14} /> EXIT KIOSK
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button 
                  onClick={() => { setIsKioskMode(true); setScreen('entry'); }}
                  className="btn-primary no-print"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px' }}
                >
                  <Lock size={14} /> <span className="kiosk-btn-text">ACTIVATE KIOSK MODE</span>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} className="hide-mobile">
                <button onClick={exportToCSV} className="no-print" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={14} /> EXPORT CSV
                </button>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Scroll Area */}
        <div className="scroll-area">
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {screen === 'dashboard' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

                {/* Action Cards */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                  <div onClick={() => setScreen('entry')} className="card-glass glow-card" style={{ flex: '1 1 250px', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--color-accent)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--navy-950)', color: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Plus size={20} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', color: 'var(--navy-950)' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700 }}>LOG ENTRY</span>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>Weigh-ins & Sleep</span>
                      </div>
                    </div>
                    <ChevronLeft size={20} style={{ color: 'var(--navy-950)', transform: 'rotate(180deg)' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Athletes</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 600 }}>{athletes.length}</span>
                    </div>
                    <div style={{ width: '1px', height: '40px', background: 'var(--color-border)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Sessions Today</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 600, color: 'var(--color-accent)' }}>{todaySessions}</span>
                    </div>
                  </div>
                  
                  </div>

                {/* Chart */}
                <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>DAILY ACTIVITY &middot; LAST 7 DAYS</span>
                    <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '4px' }}>ALL ATHLETES</span>
                  </div>
                  
                  <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px dashed var(--color-border)', gap: '4px' }}>
                    {getLast7DaysActivity().map((item, i) => {
                      const activityData = getLast7DaysActivity();
                      const maxCount = Math.max(...activityData.map(d => d.count), 1);
                      const heightPx = Math.max((item.count / maxCount) * 140, 2);
                      const height = `${heightPx}px`;
                      const isActive = i === 6;
                      const val = item.count > 0 ? item.count.toString() : '';
                      return (
                        <div key={i} className="chart-bar-container">
                          <span style={{ fontSize: '14px', fontFamily: 'var(--font-display)', fontWeight: 600, color: isActive ? 'var(--color-accent)' : 'var(--color-text)', minHeight: '20px' }}>{val}</span>
                          <div className={`chart-bar ${item.count === 0 ? 'empty' : ''}`} style={{ height, background: isActive ? 'var(--color-accent)' : 'var(--navy-600)' }} />
                          <span style={{ fontSize: '10px', fontWeight: 700, color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)', marginTop: '8px' }}>{item.day}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {screen === 'entry' && !entryAthleteId && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Search Bar */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    className="input-glass"
                    placeholder="Search by name, sport, team, or grade..." 
                    value={search} 
                    onChange={e => setSearch(e.target.value)}
                    style={{ flex: 1, height: '56px', padding: '0 48px 0 20px', fontSize: 'var(--text-md)' }}
                  />
                  {search && (
                    <button 
                      onClick={() => setSearch('')}
                      style={{ position: 'absolute', right: '16px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>

                {/* Drop-down Menus for Sport, Team/Grade, and First/Last Name Sort */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <select
                    value={selectedSportFilter}
                    onChange={e => setSelectedSportFilter(e.target.value)}
                    className="input-glass"
                    style={{ flex: 1, minWidth: '130px', height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                  >
                    <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>ALL SPORTS</option>
                    {sportsList.map(sport => (
                      <option key={sport} value={sport} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{sport.toUpperCase()}</option>
                    ))}
                  </select>

                  <select
                    value={selectedTeamFilter}
                    onChange={e => setSelectedTeamFilter(e.target.value)}
                    className="input-glass"
                    style={{ flex: 1, minWidth: '130px', height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                  >
                    <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>ALL TEAMS / GRADES</option>
                    {teamsList.map(team => (
                      <option key={team} value={team} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{team.toUpperCase()}</option>
                    ))}
                  </select>

                  <select
                    value={nameSortOrder}
                    onChange={e => setNameSortOrder(e.target.value)}
                    className="input-glass"
                    style={{ flex: 1, minWidth: '130px', height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                  >
                    <option value="first" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>SORT: FIRST NAME</option>
                    <option value="last" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>SORT: LAST NAME</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredAthletes.map(a => (
                    <div key={a.id} onClick={() => handleSelectAthleteForEntry(a.id)} className="card-glass glow-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 600, fontSize: '14px' }}>
                        {nameSortOrder === 'last' 
                          ? `${getLastName(a.name)[0] || ''}${getFirstName(a.name)[0] || ''}` 
                          : a.name.split(' ').map(n=>n[0]).join('')}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                          {nameSortOrder === 'last' ? `${getLastName(a.name)}, ${getFirstName(a.name)}` : a.name}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{a.sport} &middot; {a.team}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {screen === 'entry' && entryAthleteId && selectedAthlete && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div onClick={() => setEntryAthleteId(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
                  <ChevronLeft size={16} /> Back to Search
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 700, fontSize: '24px' }}>
                    {selectedAthlete.name.split(' ').map(n=>n[0]).join('')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--color-accent)', textTransform: 'uppercase' }}>{selectedAthlete.name}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{selectedAthlete.sport} &middot; {selectedAthlete.position}</span>
                  </div>
                </div>

                <div className="card-glass" style={{ padding: '24px', display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                  
                  {/* Left Column: Inputs */}
                  <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Body Weight (lbs)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => setWeightInput(prev => String(Math.max(0, (parseFloat(prev||0) - 0.5).toFixed(1))))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={20} /></button>
                        <div 
                          onClick={() => setFocusedField('weight')}
                          style={{ flex: 1, height: '64px', background: focusedField === 'weight' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'weight' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: focusedField === 'weight' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '42px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          {weightInput || '0.0'}
                        </div>
                        <button onClick={() => setWeightInput(prev => String((parseFloat(prev||0) + 0.5).toFixed(1)))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={20} /></button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Hours of Sleep</span>
                        <span style={{ fontSize: '10px', color: 'var(--color-accent)', fontWeight: 600 }}>QUICK SELECT</span>
                      </div>
                      <div 
                        onClick={() => setFocusedField('sleep')}
                        style={{ height: '56px', background: focusedField === 'sleep' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'sleep' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', padding: '0 16px', color: focusedField === 'sleep' ? 'var(--color-accent)' : 'var(--white)', fontSize: 'var(--text-lg)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                      >
                        {sleepInput || '8.0'}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {['6.0', '7.0', '7.5', '8.0', '8.5', '9.0'].map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => { setSleepInput(val); setFocusedField('sleep'); }}
                            style={{
                              flex: 1, minWidth: '48px', height: '36px',
                              background: sleepInput === val ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)',
                              color: sleepInput === val ? 'var(--navy-950)' : 'var(--color-text)',
                              border: '1px solid var(--color-border)', borderRadius: '6px',
                              fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                            }}
                          >
                            {val}h
                          </button>
                      ))}
                    </div>
                    </div>
                  </div>

                  {/* Right Column: KioskNumpad */}
                  <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column' }}>
                    <KioskNumpad 
                      value={focusedField === 'weight' ? weightInput : sleepInput}
                      onChange={val => focusedField === 'weight' ? setWeightInput(val) : setSleepInput(val)}
                      onEnter={handleSave}
                    />
                  </div>
                </div>

                {(() => {
                  const athleteRecords = reportData.filter(r => r.athlete_id === selectedAthlete.id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                  const isFirstEntry = athleteRecords.length === 0;
                  const hasLongGap = athleteRecords.length > 0 && (new Date() - new Date(athleteRecords[athleteRecords.length - 1].created_at)) > 14 * 24 * 60 * 60 * 1000;
                  const requiresBaseline = isFirstEntry || hasLongGap;
                  
                  if (requiresBaseline) {
                    return (
                      <div style={{ display: 'flex', gap: '16px' }}>
                        <button 
                          onClick={handleSave}
                          disabled={!weightInput || saving}
                          className="btn-primary"
                          style={{ flex: 1, height: '64px', fontSize: '18px', background: 'var(--color-accent)', color: 'var(--navy-950)' }}
                        >
                          {saving ? 'Saving...' : 'This is my baseline'}
                        </button>
                        <button 
                          onClick={handleSave}
                          disabled={!weightInput || saving}
                          className="btn-primary"
                          style={{ flex: 1, height: '64px', fontSize: '18px', background: 'transparent', border: '2px solid var(--color-border)', color: 'var(--white)' }}
                        >
                          {saving ? 'Saving...' : 'Save as new entry'}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <button 
                      onClick={handleSave}
                      disabled={!weightInput || saving}
                      className="btn-primary"
                      style={{ height: '64px', fontSize: '20px' }}
                    >
                      {saving ? 'Saving...' : 'Save Record'}
                    </button>
                  );
                })()}

                {saved && (
                  <div className="animate-slide-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--status-success)' }}>
                    <CheckCircle size={18} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>Saved successfully to database</span>
                  </div>
                )}
              </div>
            )}

            {screen === 'alerts' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.1em', marginBottom: '4px' }}>TRAINING SAFETY &middot; RISK ALERTS</div>
                    <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>ATHLETE RECOVERY ALERTS</h1>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Automated flags for rapid mass loss (&gt;2%) and low sleep (&lt;6.5h)</div>
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
                  <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Past 7 Days - Alert Volume</h3>
                    <div style={{ height: '240px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px' }}>
                      {getWeeklyAlerts().map((item, i) => {
                        const maxCount = Math.max(...getWeeklyAlerts().map(d => d.count), 1);
                        const heightPx = Math.max((item.count / maxCount) * 200, 4);
                        return (
                          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: item.count > 0 ? 'var(--status-error)' : 'var(--color-text-muted)' }}>{item.count}</span>
                            <div style={{ width: '100%', maxWidth: '40px', height: `${heightPx}px`, background: item.count > 0 ? 'var(--status-error)' : 'var(--navy-600)', borderRadius: '4px' }} />
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)' }}>{item.day}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {alertsTab === 'MONTHLY' && (
                  <div className="card-glass" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>30-Day Heat Map</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
                      {getMonthlyAlerts().map((item, i) => {
                        let bgColor = 'var(--navy-600)'; // 0 alerts
                        if (item.count > 0 && item.count <= 2) bgColor = 'rgba(245, 158, 11, 0.4)'; // Yellow
                        if (item.count > 2) bgColor = 'rgba(239, 68, 68, 0.6)'; // Red
                        
                        return (
                          <div key={i} style={{ 
                            aspectRatio: '1', 
                            background: bgColor, 
                            borderRadius: '8px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            flexDirection: 'column'
                          }}>
                            <span style={{ fontSize: '10px', color: 'var(--white)', opacity: 0.5 }}>{item.date.getDate()}</span>
                            {item.count > 0 && <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--white)' }}>{item.count}</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--color-text-muted)', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'var(--navy-600)', borderRadius: '2px' }}/> 0 Alerts</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'rgba(245, 158, 11, 0.4)', borderRadius: '2px' }}/> 1-2 Alerts</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div style={{ width: '12px', height: '12px', background: 'rgba(239, 68, 68, 0.6)', borderRadius: '2px' }}/> 3+ Alerts</div>
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

              // 2. Dehydration Roster (>=2% drop)
              const dehydrationList = [];
              filteredLogs.forEach(r => {
                const athleteRecords = reportData.filter(x => x.athlete_id === r.athlete_id).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
                const idx = athleteRecords.findIndex(x => x.id === r.id);
                if (idx > 0) {
                  const prev = athleteRecords[idx - 1];
                  if (prev && prev.weight_lbs && r.weight_lbs) {
                    const drop = prev.weight_lbs - r.weight_lbs;
                    const dropPercent = drop / prev.weight_lbs;
                    if (dropPercent >= 0.02) {
                      dehydrationList.push({
                        id: r.id,
                        athlete_name: r.athlete_name,
                        sport: r.sport,
                        prev_weight: prev.weight_lbs,
                        curr_weight: r.weight_lbs,
                        drop_lbs: drop,
                        drop_percent: (dropPercent * 100).toFixed(1),
                        date: new Date(r.created_at).toLocaleDateString()
                      });
                    }
                  }
                }
              });

              // 3. Sleep Deficit Roster (<6.5h)
              const sleepDeficitList = filteredLogs.filter(r => r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < 6.5);

              // 4. Expired Baselines (>14d Inactivity)
              const filteredAthletes = reportSportFilter === 'ALL' ? athletes : athletes.filter(a => a.sport === reportSportFilter);
              const expiredBaselinesList = [];
              filteredAthletes.forEach(a => {
                const aRecs = reportData.filter(r => r.athlete_id === a.id).sort((x,y) => new Date(x.created_at) - new Date(y.created_at));
                if (aRecs.length === 0) {
                  expiredBaselinesList.push({ athlete_name: a.name, sport: a.sport, team: a.team, status: 'No Weight Log Yet' });
                } else {
                  const lastLog = aRecs[aRecs.length - 1];
                  const gapDays = Math.floor((now - new Date(lastLog.created_at)) / (1000 * 60 * 60 * 24));
                  if (gapDays >= 14) {
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
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <button 
                        onClick={handleDeleteAllWeighIns}
                        className="no-print"
                        style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-error)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        <Trash2 size={16} /> Clear All Data
                      </button>
                      <button 
                        onClick={() => window.print()}
                        className="btn-primary no-print"
                        style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}
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

                      {/* Dropdown Filters */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                            { key: 'teamSummary', label: 'Team Readiness Cards', desc: 'Overview totals & averages' },
                            { key: 'dehydration', label: 'Dehydration Roster', desc: 'Athletes dropping ≥2% weight' },
                            { key: 'sleepDeficit', label: 'Sleep Deficit Roster', desc: 'Athletes logging <6.5h sleep' },
                            { key: 'expiredBaselines', label: 'Expired Baseline Roster', desc: 'Athletes inactive >14 days' },
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
                      {/* Section 1: Executive Summary Cards */}
                      {showTeamSummary && (
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>TOTAL LOGS</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700 }}>{filteredLogs.length}</span>
                          </div>
                          <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '20px', display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>TEAM AVG SLEEP</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700 }}>
                              {(() => {
                                const validSleep = filteredLogs.filter(r => r.sleep_hrs != null && r.sleep_hrs > 0);
                                return validSleep.length > 0 ? (validSleep.reduce((acc, curr) => acc + Number(curr.sleep_hrs), 0) / validSleep.length).toFixed(1) : '0.0';
                              })()} hrs
                            </span>
                          </div>
                          <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '20px', display: 'flex', flexDirection: 'column', border: '1px solid var(--status-error)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.05em' }}>DEHYDRATION ALERTS (≥2% DROP)</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, color: 'var(--status-error)' }}>{dehydrationList.length}</span>
                          </div>
                          <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '20px', display: 'flex', flexDirection: 'column', border: '1px solid #f59e0b' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>SLEEP DEFICITS (&lt;6.5h)</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, color: '#f59e0b' }}>{sleepDeficitList.length}</span>
                          </div>
                          <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '20px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>EXPIRED BASELINES (&gt;14d)</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, color: 'var(--color-accent)' }}>{expiredBaselinesList.length}</span>
                          </div>
                        </div>
                      )}

                      {/* Section 2: Priority Dehydration Roster */}
                      {showDehydration && (
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid var(--status-error)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <AlertTriangle size={20} style={{ color: 'var(--status-error)' }} />
                              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                DEHYDRATION & MASS DROP RISK (≥2% MASS LOSS)
                              </h3>
                            </div>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)' }}>{dehydrationList.length} ATHLETES AT RISK</span>
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
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>PREVIOUS WEIGHT</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>CURRENT WEIGHT</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>TOTAL DROP</th>
                                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--status-error)' }}>LOG DATE</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dehydrationList.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{item.athlete_name}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--color-text-muted)' }}>{item.sport}</td>
                                      <td style={{ padding: '12px 16px', fontSize: '13px' }}>{item.prev_weight} lbs</td>
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
                                CRITICAL SLEEP DEFICIENCY (&lt;6.5 HOURS LOGGED)
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
                                  {sleepDeficitList.slice(0, 25).map(item => (
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
                          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                              CHRONOLOGICAL WEIGH-IN LOG HISTORY ({filteredLogs.length} RECORDS)
                            </span>
                          </div>
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
                                {filteredLogs.slice(0, 50).map(log => (
                                  <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '16px', fontWeight: 600 }}>{log.athlete_name}</td>
                                    <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{log.sport || 'N/A'}</td>
                                    <td style={{ padding: '16px', fontWeight: 700, color: 'var(--color-accent)' }}>{log.weight_lbs} lbs</td>
                                    <td style={{ padding: '16px', fontWeight: 700, color: (log.sleep_hrs != null && log.sleep_hrs > 0 && log.sleep_hrs < 6.5) ? 'var(--status-error)' : 'var(--color-text)' }}>
                                      {log.sleep_hrs ? `${log.sleep_hrs} hrs` : '-'}
                                    </td>
                                    <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                                      {new Date(log.created_at).toLocaleDateString()}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                      <button onClick={() => handleDeleteWeighIn(log.id)} className="no-print" style={{ background: 'transparent', border: 'none', color: 'var(--status-error)', cursor: 'pointer', padding: '4px' }}>
                                        <Trash2 size={16} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {screen === 'roster' && (
              <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {!isAddingAthlete && !selectedProfileId && (
                  <>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: '1 1 200px', display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          className="input-glass"
                          placeholder="Search roster..." 
                          value={search} 
                          onChange={e => setSearch(e.target.value)}
                          style={{ flex: 1, height: '48px', padding: '0 40px 0 16px', fontSize: '14px' }}
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
                      <select
                        value={selectedSportFilter}
                        onChange={e => setSelectedSportFilter(e.target.value)}
                        className="input-glass"
                        style={{ flex: '1 1 120px', height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                      >
                        <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>ALL SPORTS</option>
                        {sportsList.map(sport => (
                          <option key={sport} value={sport} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{sport.toUpperCase()}</option>
                        ))}
                      </select>
                      <select
                        value={selectedTeamFilter}
                        onChange={e => setSelectedTeamFilter(e.target.value)}
                        className="input-glass"
                        style={{ flex: '1 1 120px', height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                      >
                        <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>ALL GRADES / TEAMS</option>
                        {teamsList.map(team => (
                          <option key={team} value={team} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{team.toUpperCase()}</option>
                        ))}
                      </select>
                      <select
                        value={nameSortOrder}
                        onChange={e => setNameSortOrder(e.target.value)}
                        className="input-glass"
                        style={{ flex: '1 1 120px', height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                      >
                        <option value="first" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>SORT: FIRST NAME</option>
                        <option value="last" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>SORT: LAST NAME</option>
                      </select>
                      <button 
                        onClick={handleDownloadTemplate}
                        className="btn-primary no-print"
                        style={{ height: '48px', padding: '0 20px', fontSize: '14px', flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--navy-800)', border: '1px solid var(--navy-600)' }}
                      >
                        <Download size={18} /> Template
                      </button>
                      <label 
                        className="btn-primary"
                        style={{ height: '48px', padding: '0 20px', fontSize: '14px', flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--navy-600)' }}
                      >
                        <Upload size={18} /> Upload CSV
                        <input 
                          type="file" 
                          accept=".csv" 
                          style={{ display: 'none' }} 
                          onChange={handleCSVUpload}
                        />
                      </label>
                      <button 
                        onClick={() => { setIsAddingAthlete(true); setEditingAthleteId(null); setNewAthlete({ name: '', sport: '', team: '', position: '' }); }}
                        className="btn-primary"
                        style={{ height: '48px', padding: '0 20px', fontSize: '14px', flex: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
                      >
                        <Plus size={18} /> New Athlete
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {filteredAthletes.map(a => (
                        <div key={a.id} onClick={() => { setSelectedProfileId(a.id); fetchProfileData(a.id); }} className="card-glass glow-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 600, fontSize: '14px' }}>
                            {nameSortOrder === 'last' 
                              ? `${getLastName(a.name)[0] || ''}${getFirstName(a.name)[0] || ''}` 
                              : a.name.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>
                              {nameSortOrder === 'last' ? `${getLastName(a.name)}, ${getFirstName(a.name)}` : a.name}
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{a.sport} &middot; {a.team} &middot; {a.position}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                
                {isAddingAthlete && (
                  <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div onClick={() => { setIsAddingAthlete(false); if(editingAthleteId) setSelectedProfileId(editingAthleteId); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
                      <ChevronLeft size={16} /> Back
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Full Name</span>
                      <input type="text" className="input-glass" placeholder="e.g. John Doe" value={newAthlete.name} onChange={e => setNewAthlete({...newAthlete, name: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-sm)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Sport</span>
                      <input type="text" className="input-glass" placeholder="e.g. Football" value={newAthlete.sport} onChange={e => setNewAthlete({...newAthlete, sport: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-sm)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Team</span>
                        <input type="text" className="input-glass" placeholder="e.g. Varsity" value={newAthlete.team} onChange={e => setNewAthlete({...newAthlete, team: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-sm)' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Position</span>
                        <input type="text" className="input-glass" placeholder="e.g. WR" value={newAthlete.position} onChange={e => setNewAthlete({...newAthlete, position: e.target.value})} style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-sm)' }} />
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

                {!isAddingAthlete && selectedProfileId && (() => {
                  const athlete = athletes.find(a => a.id === selectedProfileId);
                  if (!athlete) return null;
                  
                  const latestWeight = profileData.length > 0 ? profileData[profileData.length-1].weight_lbs : '--';
                  const latestSleep = profileData.length > 0 ? profileData[profileData.length-1].sleep_hrs : '--';
                  const daysAgo = profileData.length > 0 ? Math.floor((new Date() - new Date(profileData[profileData.length-1].created_at)) / (1000 * 60 * 60 * 24)) : 0;
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                      <div onClick={() => setSelectedProfileId(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.1em' }}>
                        <ChevronLeft size={16} /> ROSTER / {athlete.name.toUpperCase()}
                      </div>
                      
                      {/* Profile Header */}
                      <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                          <div style={{ width: '80px', height: '80px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700 }}>
                            {athlete.name.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em' }}>ATHLETE PROFILE</span>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, textTransform: 'uppercase', lineHeight: 1 }}>{athlete.name}</span>
                            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{athlete.sport} &middot; {athlete.team} &middot; {athlete.position}</span>
                          </div>
                          
                          {/* Desktop Stats */}
                          <div style={{ display: 'flex', gap: '32px', marginLeft: 'auto', '@media (max-width: 768px)': { display: 'none' } }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>BODY MASS</span>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700 }}>{latestWeight} <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>lb</span></span>
                              <span style={{ fontSize: '10px', color: 'var(--color-accent)' }}>{profileData.length > 0 ? (daysAgo === 0 ? 'Today' : `${daysAgo}d ago`) : 'No data'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>SESSIONS</span>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 700 }}>{profileData.length}</span>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Total</span>
                            </div>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px' }}>
                          <button onClick={() => handleSelectAthleteForEntry(athlete.id)} style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={16} /> LOG DATA
                          </button>
                          <button onClick={() => handleEditClick(athlete)} style={{ background: 'transparent', color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                            EDIT
                          </button>
                          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>ID {athlete.id.substring(0,8).toUpperCase()}</span>
                        </div>
                      </div>
                      
                      {/* Trend Charts */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                        
                        {/* Body Weight Chart */}
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Body Weight</span>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700 }}>{latestWeight} <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>lbs</span></span>
                            </div>
                          </div>
                          
                          <div style={{ height: '220px', position: 'relative', paddingTop: '16px', marginLeft: '-24px' }}>
                            {profileData.length > 1 ? (() => {
                              const trendData = profileData.slice(-14).map(d => ({
                                date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : 'Unknown',
                                Weight: Number(d.weight_lbs) || 0
                              }));
                              const validWeights = trendData.map(d=>d.Weight).filter(w => w > 0);
                              const minW = validWeights.length > 0 ? Math.min(...validWeights) : 100;
                              const maxW = validWeights.length > 0 ? Math.max(...validWeights) : 200;
                              
                              return (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                                      </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} minTickGap={20} />
                                    <YAxis domain={[Math.floor(minW - 5), Math.ceil(maxW + 5)]} hide />
                                    <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                                    <Area type="monotone" dataKey="Weight" stroke="var(--color-accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorWeight)" activeDot={{ r: 6, fill: 'var(--color-accent)', stroke: '#fff', strokeWidth: 2 }} />
                                  </AreaChart>
                                </ResponsiveContainer>
                              );
                            })() : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px', paddingLeft: '24px' }}>Need at least 2 entries for trend line</div>}
                          </div>
                        </div>

                        {/* Sleep Chart */}
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Sleep Hours</span>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700 }}>{latestSleep} <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>hrs</span></span>
                            </div>
                          </div>
                          
                          <div style={{ height: '220px', position: 'relative', paddingTop: '16px', marginLeft: '-24px' }}>
                            {profileData.length > 0 ? (() => {
                              const sleepData = profileData.slice(-7).map(d => ({
                                date: d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : 'Unknown',
                                Sleep: d.sleep_hrs
                              }));
                              
                              return (
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={sleepData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                                    <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" fontSize={10} tickMargin={10} minTickGap={20} />
                                    <YAxis domain={[0, 12]} hide />
                                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Bar dataKey="Sleep" fill="var(--color-text)" radius={[4, 4, 0, 0]} fillOpacity={0.8} />
                                  </BarChart>
                                </ResponsiveContainer>
                              );
                            })() : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px', paddingLeft: '24px' }}>No sleep data</div>}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
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

                {/* Card 3: Practical Troubleshooting & Health Tools */}
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

              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Nav (Mobile Only - Hidden in Kiosk Mode) */}
      {!isKioskMode && (
        <div className="bottom-nav">
          {navItem('dashboard', <Users size={20} />, 'Home')}
          {navItem('entry', <Plus size={20} />, 'Log')}
          {navItem('alerts', <AlertTriangle size={20} />, 'Alerts')}
          {navItem('roster', <Shield size={20} />, 'Roster')}
          {navItem('reports', <FileText size={20} />, 'Reports')}
          {navItem('settings', <Settings size={20} />, 'Settings')}
        </div>
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
    </div>
  );
}
