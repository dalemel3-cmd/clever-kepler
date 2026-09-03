import React from 'react';
import { Upload, AlertTriangle, CheckCircle, X, UserPlus, HelpCircle } from 'lucide-react';
import { buildImportPlan } from './plyomatImport';

const box = {
  padding: '10px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700,
  display: 'flex', alignItems: 'center', gap: '8px',
};

const Stat = ({ n, label, tone }) => (
  <div style={{ ...box, background: `${tone}14`, border: `1px solid ${tone}44`, flexDirection: 'column', alignItems: 'flex-start', gap: '2px', minWidth: '92px' }}>
    <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: tone, lineHeight: 1 }}>{n}</span>
    <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
  </div>
);

/**
 * Plyomat CSV import, in two deliberate steps: pick a file to get a PLAN, then confirm
 * to write. Nothing reaches the database from step one.
 *
 * The preview is the whole point of this component. The first real export was 569 rows
 * of which 296 belonged to athletes who had never been loaded into Supabase - an
 * importer that just wrote what matched would have reported success while dropping over
 * half the file, which is precisely the silent-rejection failure in docs/HANDOFF.md §1.
 */
export default function PlyomatImportPanel({ athletes, onImport, card, h3, eyebrow, grid: gridColor, existingTests }) {
  const [plan, setPlan] = React.useState(null);
  const [fileName, setFileName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState('');
  // Per-ambiguous-name decision: 'link' (same person) or 'create' (different person).
  // Undecided stays undecided - those rows import under neither reading.
  const [decisions, setDecisions] = React.useState({});
  const inputRef = React.useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setError(''); setResult(null); setDecisions({});
    try {
      const text = await file.text();
      const p = buildImportPlan(text, athletes, { existingTests: existingTests || [], createMissing: true });
      if (p.summary.rowsInFile === 0) { setError('That file has no data rows in it.'); setPlan(null); return; }
      setPlan(p);
      setFileName(file.name);
    } catch (err) {
      setError(`Could not read that file: ${err.message}`);
      setPlan(null);
    }
    // Let the same file be picked again after a correction.
    if (inputRef.current) inputRef.current.value = '';
  };

  const confirm = async () => {
    if (!plan) return;
    setBusy(true); setError('');
    try {
      const res = await onImport(plan, decisions);
      setResult(res);
      if (res && res.ok) setPlan(null);
      else if (res && res.error) setError(res.error);
    } catch (err) {
      setError(err.message || 'Import failed.');
    }
    setBusy(false);
  };

  const s = plan ? plan.summary : null;
  const decidedCount = plan ? plan.needsReview.filter(r => decisions[r.csvName]).length : 0;

  return (
    <div className="card-glass glow-card" style={card}>
      <div>
        <span style={eyebrow('#60a5fa')}><Upload size={14} /> PLYOMAT IMPORT</span>
        <h3 style={h3}>IMPORT JUMP RESULTS FROM A CSV</h3>
        <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
          Export a session from Plyomat and pick the file here. You&rsquo;ll see exactly what will
          be imported, created, and skipped before anything is saved.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={inputRef} id="plyomat-file" type="file" accept=".csv,text/csv" onChange={handleFile}
          aria-label="Plyomat CSV file"
          style={{ fontSize: '12px', color: 'var(--color-text-muted)' }} />
        {fileName && plan && <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{fileName}</span>}
      </div>

      {error && (
        <div style={{ ...box, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {result && result.ok && (
        <div style={{ ...box, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.4)', color: '#34d399' }}>
          <CheckCircle size={15} /> Imported {result.testsWritten} result{result.testsWritten !== 1 ? 's' : ''}
          {result.athletesCreated > 0 ? ` and added ${result.athletesCreated} athlete${result.athletesCreated !== 1 ? 's' : ''} to the roster` : ''}.
        </div>
      )}

      {plan && (
        <>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderTop: `1px solid ${gridColor}`, paddingTop: '14px' }}>
            <Stat n={s.toImport} label="will import" tone="#34d399" />
            <Stat n={s.athletesToCreate} label="new athletes" tone="#60a5fa" />
            {s.needsReview > 0 && <Stat n={s.needsReview} label="need review" tone="#fbbf24" />}
            {s.duplicates > 0 && <Stat n={s.duplicates} label="already in" tone="var(--color-text-muted)" />}
            {s.unsupported > 0 && <Stat n={s.unsupported} label="unsupported" tone="#f87171" />}
            {s.skipped > 0 && <Stat n={s.skipped} label="skipped" tone="#f87171" />}
          </div>

          {s.duplicates > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {s.duplicates} row{s.duplicates !== 1 ? 's were' : ' was'} imported before and will be left alone —
              re-importing the same export does not double anyone&rsquo;s results.
            </div>
          )}

          {plan.needsReview.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={14} /> Same person, or different?
              </span>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                These names are close to someone already on the roster but not close enough to be sure.
                Anything left undecided is not imported — better a missing row than one filed under the wrong athlete.
              </div>
              {plan.needsReview.map(r => {
                const d = decisions[r.csvName];
                return (
                  <div key={r.csvName} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '9px 12px', borderRadius: '10px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--white)' }}>{r.csvName}</span>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      ({r.rowCount} result{r.rowCount !== 1 ? 's' : ''}, group &ldquo;{r.group}&rdquo;)
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>vs roster</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent)' }}>{r.candidate.name}</span>
                    <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                      <button type="button" onClick={() => setDecisions(p => ({ ...p, [r.csvName]: 'link' }))}
                        style={{ padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', border: '1px solid rgba(52,211,153,0.5)', background: d === 'link' ? '#34d399' : 'transparent', color: d === 'link' ? '#06281c' : '#34d399' }}>
                        SAME PERSON
                      </button>
                      <button type="button" onClick={() => setDecisions(p => ({ ...p, [r.csvName]: 'create' }))}
                        style={{ padding: '5px 11px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', border: '1px solid rgba(96,165,250,0.5)', background: d === 'create' ? '#60a5fa' : 'transparent', color: d === 'create' ? '#04203f' : '#60a5fa' }}>
                        DIFFERENT
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {plan.newAthletes.length > 0 && (
            <details>
              <summary style={{ fontSize: '12px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UserPlus size={14} /> {plan.newAthletes.length} athletes will be added to the roster
              </summary>
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {plan.newAthletes.map(a => (
                  <span key={a.name} style={{ fontSize: '11px', padding: '4px 9px', borderRadius: '8px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', color: 'var(--color-text)' }}>
                    {a.name} <span style={{ color: 'var(--color-text-muted)' }}>· {a.sport || 'no sport'}{a.grade ? ` · ${a.grade}` : ''}</span>
                  </span>
                ))}
              </div>
            </details>
          )}

          {(plan.skipped.length > 0 || plan.unsupported.length > 0) && (
            <details>
              <summary style={{ fontSize: '12px', fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <X size={14} /> {plan.skipped.length + plan.unsupported.length} rows will not be imported — see why
              </summary>
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                {plan.unsupported.map((u, i) => (
                  <div key={`u${i}`} style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    <strong style={{ color: 'var(--color-text)' }}>{u.name}</strong> — “{u.metric}” ({u.protocol}) has no matching test type in this app
                  </div>
                ))}
                {plan.skipped.map((k, i) => (
                  <div key={`s${i}`} style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    <strong style={{ color: 'var(--color-text)' }}>{k.name}</strong> — {k.reason}
                  </div>
                ))}
              </div>
            </details>
          )}

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={confirm} disabled={busy || (s.toImport === 0 && decidedCount === 0)}
              style={{
                height: '40px', padding: '0 20px', borderRadius: '10px', border: 'none',
                background: busy ? 'rgba(96,165,250,0.3)' : 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
                color: '#04203f', fontWeight: 800, fontSize: '13px',
                cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '7px',
              }}>
              <Upload size={15} /> {busy ? 'IMPORTING…' : `IMPORT ${s.toImport} RESULT${s.toImport !== 1 ? 'S' : ''}`}
            </button>
            <button type="button" onClick={() => { setPlan(null); setFileName(''); setDecisions({}); }}
              style={{ height: '40px', padding: '0 16px', borderRadius: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--color-text-muted)', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
              CANCEL
            </button>
          </div>
        </>
      )}
    </div>
  );
}
