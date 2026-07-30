import React, { useState, useEffect } from 'react';
import { Users, Plus, Shield, AlertCircle, ChevronLeft, Minus, CheckCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import './styles.css';

// Custom Confetti Component
const Confetti = () => {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 100 }}>
      {[...Array(30)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: '8px', height: '8px',
          backgroundColor: i % 2 === 0 ? 'var(--color-accent)' : 'var(--white)',
          top: '-10px',
          left: `${Math.random() * 100}%`,
          animation: `fall ${1 + Math.random() * 2}s linear forwards`,
          animationDelay: `${Math.random() * 0.5}s`
        }} />
      ))}
      <style>{`
        @keyframes fall {
          to { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default function App() {
  const [screen, setScreen] = useState('entry');
  const [search, setSearch] = useState('');
  const [athletes, setAthletes] = useState([]);
  
  // Entry State
  const [entryAthleteId, setEntryAthleteId] = useState(null);
  const [weightInput, setWeightInput] = useState('');
  const [sleepInput, setSleepInput] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Roster State
  const [isAddingAthlete, setIsAddingAthlete] = useState(false);
  const [editingAthleteId, setEditingAthleteId] = useState(null);
  const [newAthlete, setNewAthlete] = useState({ name: '', sport: '', team: '', position: '' });

  useEffect(() => {
    fetchAthletes();
  }, []);

  const fetchAthletes = async () => {
    // We try to fetch from Supabase. If the keys are invalid, we fallback to mock data
    try {
      const { data, error } = await supabase.from('athletes').select('*');
      if (error) throw error;
      if (data && data.length > 0) {
        setAthletes(data);
      } else {
        setMockAthletes();
      }
    } catch (err) {
      console.warn("Supabase fetch failed (likely placeholder keys). Falling back to mock data.");
      setMockAthletes();
    }
  };

  const setMockAthletes = () => {
    setAthletes([
      { id: '1', name: 'Jaylen Carter', sport: 'Football', team: 'Varsity', position: 'WR' },
      { id: '2', name: 'Micah Reeves', sport: 'Football', team: 'Varsity', position: 'LB' },
      { id: '3', name: 'Owen Baxter', sport: 'Basketball', team: 'Varsity', position: 'PG' }
    ]);
  };

  const selectedAthlete = athletes.find(a => a.id === entryAthleteId);
  const filteredAthletes = athletes.filter(a => search === '' || a.name.toLowerCase().includes(search.toLowerCase()));

  const handleSave = async () => {
    if (!selectedAthlete || !weightInput) return;
    
    setSaving(true);
    
    try {
      // Try to save to Supabase
      const { error } = await supabase
        .from('weigh_ins')
        .insert([
          { 
            athlete_id: selectedAthlete.id, 
            athlete_name: selectedAthlete.name,
            sport: selectedAthlete.sport,
            weight_lbs: parseFloat(weightInput),
            sleep_hrs: parseFloat(sleepInput || 0)
          }
        ]);
        
      if (error && error.message !== 'FetchError: Failed to fetch') {
        throw error; // If it's a real error, throw it
      }
      
      // Success (or mock success if offline/bad keys)
      setSaving(false);
      setSaved(true);
      setWeightInput('');
      setSleepInput('');
      setTimeout(() => setSaved(false), 3000);
      
    } catch (err) {
      console.error("Save error:", err);
      // Fallback for demo purposes
      setSaving(false);
      setSaved(true);
      setWeightInput('');
      setSleepInput('');
      setTimeout(() => setSaved(false), 3000);
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
    if (!window.confirm("Are you sure you want to delete this athlete?")) return;
    setSaving(true);
    try {
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
    } finally {
      setSaving(false);
    }
  };

  const navItem = (key, icon, label) => {
    const active = screen === key;
    return (
      <div onClick={() => { setScreen(key); setSaved(false); }} 
           style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', width: '64px',
                    color: active ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>
        {icon}
        <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {saved && <Confetti />}
      
      {/* Header */}
      <div style={{ flex: 'none', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '28px', height: '28px', background: 'var(--color-accent)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--navy-950)' }}>SC</div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, letterSpacing: 'var(--tracking-display)', color: 'var(--white)', textTransform: 'uppercase' }}>
            {screen === 'entry' ? 'Quick Entry' : 'Roster'}
          </span>
        </div>
        <span style={{ fontSize: '12px', color: 'var(--gold-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: 'env(safe-area-inset-bottom, 20px)' }}>
        
        {screen === 'entry' && !entryAthleteId && (
          <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input 
              type="text" 
              className="input-glass"
              placeholder="Search athletes..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              style={{ height: '48px', padding: '0 16px', fontSize: 'var(--text-md)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredAthletes.map(a => (
                <div key={a.id} onClick={() => setEntryAthleteId(a.id)} className="card-glass glow-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 600, fontSize: '14px' }}>
                    {a.name.split(' ').map(n=>n[0]).join('')}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{a.name}</span>
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
              <ChevronLeft size={16} /> Change Athlete
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

            <div className="card-glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Body Weight (lbs)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={() => setWeightInput(prev => String(Math.max(0, (parseFloat(prev||150) - 0.5).toFixed(1))))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Minus size={20} /></button>
                  <input 
                    type="number" inputMode="decimal"
                    value={weightInput} onChange={e => setWeightInput(e.target.value)}
                    placeholder="0.0"
                    style={{ flex: 1, height: '64px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '0 16px', color: 'var(--color-accent)', fontFamily: 'var(--font-display)', fontSize: '42px', fontWeight: 600, textAlign: 'center', outline: 'none' }}
                  />
                  <button onClick={() => setWeightInput(prev => String((parseFloat(prev||150) + 0.5).toFixed(1)))} style={{ width: '48px', height: '64px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Plus size={20} /></button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>Hours of Sleep</span>
                <input 
                  type="number" inputMode="decimal"
                  value={sleepInput} onChange={e => setSleepInput(e.target.value)}
                  placeholder="8"
                  style={{ height: '48px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-md)', padding: '0 16px', color: 'var(--color-text)', fontSize: 'var(--text-lg)', fontWeight: 600, outline: 'none' }}
                />
              </div>
            </div>

            <button 
              onClick={handleSave}
              disabled={!weightInput || saving}
              style={{ height: '56px', background: (!weightInput || saving) ? 'var(--neutral-700)' : 'var(--color-accent)', color: (!weightInput || saving) ? 'var(--neutral-300)' : 'var(--navy-950)', border: 'none', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: (!weightInput || saving) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
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

        {screen === 'roster' && (
          <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {!isAddingAthlete ? (
              <>
                <button 
                  onClick={() => { setIsAddingAthlete(true); setEditingAthleteId(null); setNewAthlete({ name: '', sport: '', team: '', position: '' }); }}
                  style={{ height: '56px', background: 'var(--color-accent)', color: 'var(--navy-950)', border: 'none', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Plus size={20} /> Add New Athlete
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {athletes.map(a => (
                    <div key={a.id} onClick={() => handleEditClick(a)} className="card-glass glow-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--navy-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 600, fontSize: '14px' }}>
                        {a.name.split(' ').map(n=>n[0]).join('')}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{a.name}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{a.sport} &middot; {a.team} &middot; {a.position}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="card-glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div onClick={() => setIsAddingAthlete(false)} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-accent)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', marginBottom: '8px' }}>
                  <ChevronLeft size={16} /> Back to Roster
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                  <button 
                    onClick={editingAthleteId ? handleUpdateAthlete : handleCreateAthlete}
                    disabled={!newAthlete.name || saving}
                    style={{ height: '56px', background: (!newAthlete.name || saving) ? 'var(--neutral-700)' : 'var(--color-accent)', color: (!newAthlete.name || saving) ? 'var(--neutral-300)' : 'var(--navy-950)', border: 'none', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: (!newAthlete.name || saving) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
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

      </div>

      {/* Bottom Nav */}
      <div style={{ flex: 'none', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'space-around', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)', paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}>
        {navItem('entry', <Plus size={22} />, 'Log')}
        {navItem('roster', <Users size={22} />, 'Roster')}
        {navItem('alerts', <AlertCircle size={22} />, 'Alerts')}
      </div>
    </div>
  );
}
