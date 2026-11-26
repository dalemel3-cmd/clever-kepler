import React from 'react';
import { label, th, td } from './DeepDiveUi';

// "SWC / SESOI" panel (v5.17.1): explains the two numbers and lets a coach set the SESOI per
// number for every device. `items`: [{ key, label, unit }]; `values`: saved SESOI by key;
// `onSave(patch)` resolves { ok }.
const btn = { height: '44px', padding: '0 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--color-text-muted)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer' };

export default function SesoiPanel({ items, values, onSave }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({});
  const [orig, setOrig] = React.useState({}); // what the boxes showed when opened: only changed ones are saved
  const [msg, setMsg] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const start = () => { const d = Object.fromEntries(items.map(i => [i.key, values[i.key] != null ? String(values[i.key]) : ''])); setDraft(d); setOrig(d); setMsg(null); setOpen(o => !o); };
  const bad = items.some(i => draft[i.key] && !(Number(draft[i.key]) > 0));
  const save = async () => {
    if (bad || busy) return;
    const changed = items.filter(i => (draft[i.key] || '') !== (orig[i.key] || ''));
    if (!changed.length) { setMsg({ ok: true, text: 'Nothing changed.' }); return; }
    setBusy(true);
    const res = await onSave(Object.fromEntries(changed.map(i => [i.key, draft[i.key] || ''])));
    setBusy(false);
    if (res.ok) setOrig(draft);
    setMsg(res.ok ? { ok: true, text: 'Saved for every device.' } : { ok: false, text: "Couldn't save. Check the connection and try again." });
  };
  return (
    <div>
      <button type="button" style={btn} onClick={start} aria-expanded={open}>SWC / SESOI</button>
      {open && (
        <div data-testid="sesoi-panel" style={{ marginTop: '10px', padding: '14px 16px', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '640px' }}>
          <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text-muted)' }}>
            <strong style={{ color: 'var(--white)' }}>SWC</strong> (smallest worthwhile change) is worked out for each athlete: 0.2 × the spread (standard deviation) of their own recent results.{' '}
            <strong style={{ color: 'var(--white)' }}>SESOI</strong> (smallest effect size of interest) is the smallest change you care about, set here for each number. A change counts as real only when it is bigger than both. Leave a SESOI blank to use the SWC alone. A test's SESOI covers all its techniques. Only the numbers you change are saved, so another coach's settings are kept.
          </div>
          <table style={{ borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Number</th><th style={th}>SESOI</th></tr></thead>
            <tbody>
              {items.map(i => (
                <tr key={i.key}>
                  <td style={td}>{i.label}</td>
                  <td style={td}>
                    <input aria-label={`SESOI for ${i.label}`} inputMode="decimal" value={draft[i.key] ?? ''} placeholder="SWC only" onChange={e => setDraft(d => ({ ...d, [i.key]: e.target.value.trim() }))} style={{ height: '44px', width: '110px', padding: '0 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.3)', color: 'var(--white)', fontWeight: 700 }} />
                    <span style={{ marginLeft: '6px', color: 'var(--color-text-muted)', fontSize: '12px' }}>{i.unit}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {bad && <div style={{ ...label, color: '#fbbf24', textTransform: 'none', letterSpacing: 0 }}>Each SESOI must be a number above 0, or blank.</div>}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={bad || busy} style={{ ...btn, border: '1px solid var(--color-accent)', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', opacity: bad || busy ? 0.5 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setOpen(false)} style={btn}>Close</button>
            {msg && <span role="status" style={{ fontSize: '12px', fontWeight: 700, color: msg.ok ? '#34d399' : '#f87171' }}>{msg.text}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
