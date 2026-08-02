import React, { useState, useEffect } from 'react';
import { Users, Plus, Shield, ChevronLeft, Minus, CheckCircle, X, Download, Lock, Unlock, Wifi, AlertTriangle, Activity, FileText, Printer, Trash2, Upload } from 'lucide-react';
import { supabase } from './supabaseClient';
import './styles.css';

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
  const [athletes, setAthletes] = useState([]);
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

  // Roster State
  const [isAddingAthlete, setIsAddingAthlete] = useState(false);
  const [editingAthleteId, setEditingAthleteId] = useState(null);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [profileData, setProfileData] = useState([]);
  const [newAthlete, setNewAthlete] = useState({ name: '', sport: '', team: '', position: '' });
  
  // Alerts State
  const [alertsTab, setAlertsTab] = useState('DAILY');

  useEffect(() => {
    fetchAthletes();

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      setScreenState(hash || 'dashboard');
    };
    window.addEventListener('hashchange', handleHashChange);

    // Auto-sync offline cache when internet reconnects
    const handleOnline = () => syncOfflineCache();
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    setReportLoading(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from('weigh_ins')
        .select('*')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false });
      if (!error && data) {
        setReportData(data);
      }
    } catch {
      console.warn("Could not fetch report data");
    } finally {
      setReportLoading(false);
    }
  };

  const syncOfflineCache = async () => {
    const offlineQueue = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
    if (offlineQueue.length === 0) return;

    try {
      const { error } = await supabase.from('weigh_ins').insert(offlineQueue);
      if (!error) {
        localStorage.removeItem('shiloh_offline_weigh_ins');
        console.log("Successfully synced offline queue to Supabase!");
      }
    } catch {
      console.warn("Could not sync offline queue yet.");
    }
  };

  const fetchAthletes = async () => {
    try {
      const { data, error } = await supabase.from('athletes').select('*').order('name', { ascending: true });
      if (!error && data) {
        setAthletes(data);
      } else {
        setMockAthletes();
      }
    } catch {
      console.warn("Supabase fetch failed (likely placeholder keys). Falling back to mock data.");
      setMockAthletes();
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

  const filteredAthletes = athletes.filter(a => {
    const q = search.toLowerCase();
    const matchesSearch = search === '' || 
      a.name.toLowerCase().includes(q) ||
      (a.sport && a.sport.toLowerCase().includes(q)) ||
      (a.team && a.team.toLowerCase().includes(q)) ||
      (a.position && a.position.toLowerCase().includes(q));

    const matchesSport = selectedSportFilter === 'ALL' || a.sport === selectedSportFilter;
    const matchesTeam = selectedTeamFilter === 'ALL' || a.team === selectedTeamFilter;

    return matchesSearch && matchesSport && matchesTeam;
  });

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
        existing.push(record);
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
        return recordDate >= startOfDay && recordDate < endOfDay && r.sleep_hrs < 6.5;
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
        return recordDate >= startOfDay && recordDate < endOfDay && r.sleep_hrs < 6.5;
      }).length;
      result.push({ count, date: startOfDay });
    }
    return result;
  };

  const getActionRequired = () => {
    const today = new Date();
    return reportData.filter(r => {
      const rd = new Date(r.created_at);
      const isToday = rd.getFullYear() === today.getFullYear() && rd.getMonth() === today.getMonth() && rd.getDate() === today.getDate();
      return isToday && r.sleep_hrs < 6.5;
    });
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
           style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', width: '64px',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
        {icon}
        <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
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
            {renderSidebarItem('alerts', <AlertTriangle size={18} />, 'ALERTS')}
            {renderSidebarItem('reports', <FileText size={18} />, 'REPORTS')}
          </div>
          <div style={{ marginTop: 'auto', padding: '24px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-950)', fontWeight: 700 }}>CM</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>COACH MASON</span>
              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Shiloh Athletics</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content">
        
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
              <div style={{ display: 'flex', gap: '32px' }}>
                <button 
                  onClick={() => { setIsKioskMode(true); setScreen('entry'); }}
                  className="btn-primary no-print"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '12px' }}
                >
                  <Lock size={14} /> ACTIVATE KIOSK MODE
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
                  <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
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
                  <div onClick={() => setScreen('entry')} className="card-glass glow-card" style={{ flex: '1 1 250px', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--color-accent)' }}>
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
                  <div style={{ display: 'flex', gap: '32px', alignItems: 'center', justifyContent: 'flex-start' }}>
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
                  
                  <div onClick={() => setScreen('alerts')} className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px', cursor: 'pointer' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <AlertTriangle size={20} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, textTransform: 'uppercase' }}>Risk Alerts</span>
                      <span style={{ fontSize: '12px', color: 'var(--status-error)', fontWeight: 600 }}>Dehydration & Sleep</span>
                    </div>
                  </div>
                </div>

                {/* Action Required Widget */}
                {getActionRequired().length > 0 && (
                  <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <AlertTriangle size={18} color="var(--status-error)" />
                      <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--white)' }}>ACTION REQUIRED TODAY</span>
                      <span style={{ fontSize: '10px', background: 'var(--status-error)', color: 'var(--white)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>{getActionRequired().length} ATHLETES</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                      {getActionRequired().map(alert => (
                        <div key={alert.id} style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-error)', fontWeight: 700, fontSize: '12px' }}>
                            {alert.athlete_name.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--white)' }}>{alert.athlete_name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--status-error)', fontWeight: 600 }}>{alert.sleep_hrs}h Sleep</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

                {/* Drop-down Menus for Sport and Team/Grade */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <select
                    value={selectedSportFilter}
                    onChange={e => setSelectedSportFilter(e.target.value)}
                    className="input-glass"
                    style={{ flex: 1, height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
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
                    style={{ flex: 1, height: '48px', padding: '0 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}
                  >
                    <option value="ALL" style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>ALL TEAMS / GRADES</option>
                    {teamsList.map(team => (
                      <option key={team} value={team} style={{ background: 'var(--navy-900)', color: 'var(--color-text)' }}>{team.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredAthletes.map(a => (
                    <div key={a.id} onClick={() => setEntryAthleteId(a.id)} className="card-glass glow-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 600, fontSize: '14px' }}>
                        {a.name.split(' ').map(n=>n[0]).join('')}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{a.name}</span>
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

                <div className="card-glass" style={{ padding: '24px', display: 'flex', gap: '32px' }}>
                  
                  {/* Left Column: Inputs */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Body Weight (lbs)</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={() => setWeightInput(prev => String(Math.max(0, (parseFloat(prev||150) - 0.5).toFixed(1))))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={20} /></button>
                        <div 
                          onClick={() => setFocusedField('weight')}
                          style={{ flex: 1, height: '64px', background: focusedField === 'weight' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(0,0,0,0.2)', border: focusedField === 'weight' ? '2px solid var(--color-accent)' : '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: focusedField === 'weight' ? 'var(--color-accent)' : 'var(--white)', fontFamily: 'var(--font-display)', fontSize: '42px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                          {weightInput || '0.0'}
                        </div>
                        <button onClick={() => setWeightInput(prev => String((parseFloat(prev||150) + 0.5).toFixed(1)))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={20} /></button>
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
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <KioskNumpad 
                      value={focusedField === 'weight' ? weightInput : sleepInput}
                      onChange={val => focusedField === 'weight' ? setWeightInput(val) : setSleepInput(val)}
                      onEnter={handleSave}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleSave}
                  disabled={!weightInput || saving}
                  className="btn-primary"
                  style={{ height: '64px', fontSize: '20px' }}
                >
                  {saving ? 'Saving...' : 'Save Record'}
                </button>

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
                    {/* Alert Card 1 */}
                    <div className="card-glass" style={{ padding: '20px', borderLeft: '4px solid var(--status-error)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AlertTriangle size={22} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700 }}>JAYLEN CARTER</span>
                            <span style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--status-error)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>DEHYDRATION RISK</span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Football &middot; Wide Receiver &middot; -4.5 lbs drop (-2.3% body mass)</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 700 }}>INCREASE HYDRATION</span>
                    </div>

                    {/* Alert Card 2 */}
                    <div className="card-glass" style={{ padding: '20px', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Activity size={22} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700 }}>MICAH REEVES</span>
                            <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>LOW SLEEP</span>
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Football &middot; Linebacker &middot; 5.5 hrs sleep logged</span>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>MONITOR CNS LOAD</span>
                    </div>
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

            {screen === 'reports' && (
              <div className="animate-slide-up report-container" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>ANALYTICS &middot; HUMAN PERFORMANCE</div>
                    <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em' }}>TEAM READINESS REPORT</h1>
                    <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Aggregate sleep and weight data across all athletes.</div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
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

                {reportLoading ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading report data...</div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>TOTAL LOGS (ALL TIME)</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700 }}>{reportData.length}</span>
                      </div>
                      <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>TEAM AVG SLEEP</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700 }}>
                          {reportData.length > 0 ? (reportData.reduce((acc, curr) => acc + (curr.sleep_hrs || 0), 0) / reportData.filter(r => r.sleep_hrs).length).toFixed(1) : '0.0'} hrs
                        </span>
                      </div>
                      <div className="card-glass glow-card" style={{ flex: '1 1 200px', padding: '24px', display: 'flex', flexDirection: 'column', border: '1px solid var(--status-error)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--status-error)', letterSpacing: '0.05em' }}>CRITICAL ALERTS (&lt;6.5h SLEEP)</span>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700, color: 'var(--status-error)' }}>
                          {reportData.filter(r => r.sleep_hrs && r.sleep_hrs < 6.5).length}
                        </span>
                      </div>
                    </div>

                    <div className="card-glass" style={{ overflow: 'hidden' }}>
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
                            {/* We just show the latest 20 logs for simplicity, or we could group by athlete. For a simple report, a chronological log is great, or grouped. Let's show recent logs. */}
                            {reportData.slice(0, 50).map(log => (
                              <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '16px', fontWeight: 600 }}>{log.athlete_name}</td>
                                <td style={{ padding: '16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>{log.sport || 'N/A'}</td>
                                <td style={{ padding: '16px', fontWeight: 700, color: 'var(--color-accent)' }}>{log.weight_lbs} lbs</td>
                                <td style={{ padding: '16px', fontWeight: 700, color: log.sleep_hrs < 6.5 ? 'var(--status-error)' : 'var(--color-text)' }}>
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
                  </>
                )}
              </div>
            )}

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
                            {a.name.split(' ').map(n=>n[0]).join('')}
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{a.name}</span>
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
                          <button onClick={() => { setScreen('entry'); setEntryAthleteId(athlete.id); }} style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={16} /> LOG DATA
                          </button>
                          <button onClick={() => handleEditClick(athlete)} style={{ background: 'transparent', color: 'var(--color-text)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                            EDIT
                          </button>
                          <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-muted)', letterSpacing: '0.1em' }}>ID {athlete.id.substring(0,8).toUpperCase()}</span>
                        </div>
                      </div>
                      
                      {/* Trend Charts */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        
                        {/* Body Weight Chart */}
                        <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Body Weight</span>
                              <span style={{ fontFamily: 'var(--font-display)', fontSize: '32px', fontWeight: 700 }}>{latestWeight} <span style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>lbs</span></span>
                            </div>
                          </div>
                          
                          <div style={{ height: '180px', position: 'relative', borderBottom: '1px dashed rgba(255,255,255,0.1)', borderLeft: '1px dashed rgba(255,255,255,0.1)', paddingLeft: '8px', paddingTop: '16px', paddingBottom: '16px' }}>
                            {profileData.length > 1 ? (() => {
                              const trendData = profileData.slice(-14);
                              const minW = Math.min(...trendData.map(d=>d.weight_lbs));
                              const maxW = Math.max(...trendData.map(d=>d.weight_lbs));
                              const range = (maxW - minW) || 1;
                              const points = trendData.map((d, i) => {
                                const x = (i / (trendData.length - 1)) * 100;
                                const y = 100 - (((d.weight_lbs - minW) / range) * 80 + 10);
                                return `${x},${y}`;
                              }).join(' ');

                              return (
                                <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                                    <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 4px 6px rgba(59, 130, 246, 0.4))' }} />
                                    {trendData.map((d, i) => {
                                      const x = (i / (trendData.length - 1)) * 100;
                                      const y = 100 - (((d.weight_lbs - minW) / range) * 80 + 10);
                                      return <circle key={i} cx={x} cy={y} r="3" fill="var(--white)" stroke="var(--color-accent)" strokeWidth="1.5" />;
                                    })}
                                  </svg>
                                  <div style={{ position: 'absolute', bottom: '-24px', left: 0, right: 0, display: 'flex', justifyContent: 'space-between' }}>
                                    {trendData.map((d, i) => {
                                      const isEdgeOrMiddle = i === 0 || i === trendData.length - 1 || i === Math.floor(trendData.length / 2);
                                      if (!isEdgeOrMiddle) return <span key={i} style={{ width: 0 }} />;
                                      return <span key={i} style={{ fontSize: '10px', color: 'var(--color-text-muted)', transform: 'translateX(-50%)', left: `${(i / (trendData.length - 1)) * 100}%`, position: 'absolute' }}>
                                        {new Date(d.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                                      </span>;
                                    })}
                                  </div>
                                </div>
                              );
                            })() : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>Need at least 2 entries for trend line</div>}
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
                          
                          <div style={{ height: '180px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px dashed rgba(255,255,255,0.1)', gap: '6px', paddingTop: '20px' }}>
                            {profileData.length > 0 ? profileData.slice(-7).map((d, i) => {
                              const heightPct = Math.min(100, Math.max(15, (d.sleep_hrs / 12) * 100));
                              const dateStr = d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : `Entry ${i+1}`;
                              return (
                                <div key={i} className="chart-bar-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text)', marginBottom: '4px' }}>{d.sleep_hrs}h</span>
                                  <div className="chart-bar" style={{ height: `${heightPct}%`, background: 'var(--color-text)', width: '100%', maxWidth: '24px', opacity: i === profileData.slice(-7).length - 1 ? 1 : 0.4, borderRadius: '4px 4px 0 0' }} />
                                  <span style={{ fontSize: '9px', fontWeight: 600, color: 'var(--color-text-muted)', marginTop: '6px' }}>{dateStr}</span>
                                </div>
                              )
                            }) : <div style={{ width: '100%', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>No data logged yet</div>}
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Nav (Mobile Only - Hidden in Kiosk Mode) */}
      {!isKioskMode && (
        <div className="bottom-nav">
          {navItem('dashboard', <Users size={22} />, 'Home')}
          {navItem('entry', <Plus size={22} />, 'Log')}
          {navItem('alerts', <AlertTriangle size={22} />, 'Alerts')}
          {navItem('roster', <Shield size={22} />, 'Roster')}
          {navItem('reports', <FileText size={22} />, 'Reports')}
        </div>
      )}
    </div>
  );
}
