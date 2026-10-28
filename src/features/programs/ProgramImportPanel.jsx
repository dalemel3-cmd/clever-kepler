import React from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, AlertTriangle } from 'lucide-react';

// Upload preview (v5.11.0, docs/HANDOFF.md §137): what the spreadsheet will become -
// programs, days, sets, and anything that needs a look - before anything is saved.
// Imports always create new programs; nothing existing is changed.
const btn = (primary) => ({ height: '44px', padding: '0 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', border: primary ? 'none' : '1px solid rgba(255,255,255,0.18)', background: primary ? 'var(--color-accent)' : 'transparent', color: primary ? '#030a14' : 'var(--color-text)' });
const count = (p) => {
  let sets = 0, ex = 0;
  for (const d of p.days) for (const b of d.blocks) { ex += 1; sets += b.sets.length; }
  return { days: p.days.length, ex, sets, dated: p.days.filter(d => d.date).length };
};

export default function ProgramImportPanel({ fileName, result, existing = [], onImport, onClose }) {
  const [picked, setPicked] = React.useState(() => new Set(result.programs.map(p => p.id)));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const taken = new Set(existing.map(p => `${p.name}|${p.week_label || ''}`.toLowerCase()));
  const chosen = result.programs.filter(p => picked.has(p.id));
  const toggle = (id) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = async () => {
    if (!chosen.length || busy) return;
    setBusy(true); setError('');
    const res = await onImport(chosen);
    setBusy(false);
    if (!res?.ok) setError("Couldn't save the programs - check the connection and try again.");
  };
  React.useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Upload programs" data-testid="pb-import" style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(3,10,20,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div className="card-glass" style={{ width: '100%', maxWidth: '760px', padding: '20px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--navy-900, #0b1220)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, textTransform: 'uppercase' }}>Upload programs</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{fileName}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close upload" style={{ ...btn(false), width: '44px', padding: 0, justifyContent: 'center' }}><X size={18} /></button>
        </div>

        {result.programs.length === 0 ? (
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>No programs found in this file.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>{result.programs.length} program{result.programs.length === 1 ? '' : 's'} found · new copies are added, nothing is overwritten</span>
            {result.programs.map(p => {
              const c = count(p);
              const dup = taken.has(`${p.name}|${p.week_label || ''}`.toLowerCase());
              return (
                <label key={p.id} data-testid="pb-import-item" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${picked.has(p.id) ? 'var(--color-accent)' : 'rgba(255,255,255,0.12)'}`, cursor: 'pointer', minHeight: '44px' }}>
                  <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} style={{ width: '20px', height: '20px', marginTop: '2px' }} aria-label={`Import ${p.name} ${p.week_label || ''}`} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontWeight: 800 }}>{p.name}{p.week_label ? ` · ${p.week_label}` : ''}</span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{[p.phase, p.sport || 'No team', `${c.days} day${c.days === 1 ? '' : 's'}${c.dated < c.days ? ` (${c.days - c.dated} without a date)` : ''}`, `${c.ex} exercises`, `${c.sets} sets`].filter(Boolean).join(' · ')}</span>
                    {p.days.length > 0 && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{p.days.map(d => [d.date && new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }), d.focus].filter(Boolean).join(' ') || 'Day').join(' · ')}</span>}
                    {dup && <span style={{ fontSize: '12px', color: 'var(--color-accent)' }}>A program with this name and week already exists - this adds a second one.</span>}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {result.warnings.length > 0 && (
          <div data-testid="pb-import-warnings" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(184,156,91,0.1)', border: '1px solid rgba(184,156,91,0.35)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-accent)' }}><AlertTriangle size={14} /> {result.warnings.length} thing{result.warnings.length === 1 ? '' : 's'} to check</span>
            <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {result.warnings.slice(0, 100).map((w, i) => <span key={i} style={{ fontSize: '12px' }}>{w.row ? `Row ${w.row}: ` : ''}{w.message}</span>)}
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: '13px', color: '#f87171' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" style={btn(false)} onClick={onClose}>Cancel</button>
          <button type="button" data-testid="pb-import-go" style={{ ...btn(true), opacity: chosen.length && !busy ? 1 : 0.5 }} disabled={!chosen.length || busy} onClick={go}>
            <Upload size={16} /> {busy ? 'Saving…' : `Import ${chosen.length} program${chosen.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
