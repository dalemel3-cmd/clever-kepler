import React from 'react';
import { Plus, Trash2, Copy, Printer, ChevronUp, ChevronDown, Save, Archive, Search, FileDown, FileUp, ChartColumn, Download } from 'lucide-react';
import { usePrograms } from './usePrograms';
import { MAX_KEYS, MAX_WINDOWS, newBlock, newDay, newProgram, newSet, nextCode, sampleProgram } from './programData';
import { parseCsv, rowsToPrograms, programsToRows, templateCsv, toCsv } from './programCsv';
import { isGrid, parseGrid, gridTemplateCsv } from './programGrid';
const ProgramImportPanel = React.lazy(() => import('./ProgramImportPanel'));
const PeriodizationPanel = React.lazy(() => import('./PeriodizationPanel'));
const loadWeightRoomCard = () => import('./WeightRoomCard');
const WeightRoomCard = React.lazy(loadWeightRoomCard);

// Log > Programs: build a week of training (2-4 sessions) and print Weight Room Cards
// with working weights from each athlete's maxes (docs/HANDOFF.md §120).
const card = { padding: '18px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '12px' };
const lbl = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)' };
const inp = { height: '40px', padding: '0 10px', fontSize: '14px', borderRadius: '10px', minWidth: 0 };
const small = { ...inp, height: '34px', fontSize: '13px', padding: '0 8px' };
const opt = { background: 'var(--navy-900)', color: 'var(--color-text)' };
const btn = (primary) => ({ height: '40px', padding: '0 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', border: primary ? 'none' : '1px solid rgba(255,255,255,0.18)', background: primary ? 'var(--color-accent)' : 'transparent', color: primary ? '#030a14' : 'var(--color-text)' });
const iconBtn = { width: '30px', height: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' };
const lines = (arr) => (arr || []).join('\n');
const toLines = (s) => s.split('\n').map(x => x.trim()).filter(Boolean);
const clone = (x) => JSON.parse(JSON.stringify(x));
const downloadCsv = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const fileSafe = (s) => String(s || 'program').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

function Field({ label, children, grow }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: grow ? '1 1 200px' : '0 1 auto', minWidth: 0 }}><span style={lbl}>{label}</span>{children}</label>;
}

const BlockEditor = React.memo(function BlockEditor({ b, idx, onChangeIdx, onMoveIdx, onDeleteIdx, canUp, canDown }) {
  const set = (k, v) => onChangeIdx(idx, { ...b, [k]: v });
  const loaded = b.sets?.length > 0;
  const setRow = (i, k, v) => set('sets', b.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <div data-testid="pb-block" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Code"><input className="input-glass" style={{ ...small, width: '56px' }} value={b.code} onChange={e => set('code', e.target.value.slice(0, 4))} aria-label="Block code" /></Field>
        <Field label="Exercise" grow><input className="input-glass" style={small} value={b.name} placeholder="e.g. Barbell Back Squat" onChange={e => set('name', e.target.value)} aria-label="Exercise name" /></Field>
        <Field label="Note" grow><input className="input-glass" style={small} value={b.note} placeholder="optional" onChange={e => set('note', e.target.value)} aria-label="Exercise note" /></Field>
        <Field label="% of max">
          <select className="input-glass" style={{ ...small, width: '96px' }} value={b.maxKey} onChange={e => set('maxKey', e.target.value)} aria-label="Percent of which max">
            <option value="" style={opt}>None</option>
            {MAX_KEYS.map(([k, l]) => <option key={k} value={k} style={opt}>{l}</option>)}
          </select>
        </Field>
        <Field label="Velocity (m/s)"><input className="input-glass" style={{ ...small, width: '96px' }} value={b.velocity} placeholder=".55–.65" onChange={e => set('velocity', e.target.value)} aria-label="Velocity target" /></Field>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <button type="button" style={iconBtn} disabled={!canUp} onClick={() => onMoveIdx(idx, -1)} aria-label="Move exercise up"><ChevronUp size={16} /></button>
          <button type="button" style={iconBtn} disabled={!canDown} onClick={() => onMoveIdx(idx, 1)} aria-label="Move exercise down"><ChevronDown size={16} /></button>
          <button type="button" style={iconBtn} onClick={() => onDeleteIdx(idx)} aria-label="Delete exercise"><Trash2 size={15} /></button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={lbl}>Prescription</span>
        <button type="button" data-testid="pb-mode-rx" onClick={() => onChangeIdx(idx, { ...b, sets: [] })} style={{ ...btn(!loaded), height: '30px', fontSize: '11px' }}>Sets × reps text</button>
        <button type="button" data-testid="pb-mode-sets" onClick={() => onChangeIdx(idx, { ...b, sets: b.sets?.length ? b.sets : [newSet('5', b.maxKey ? '70' : '', '')] })} style={{ ...btn(loaded), height: '30px', fontSize: '11px' }}>Set by set</button>
        {!loaded && <input className="input-glass" data-testid="pb-rx" style={{ ...small, flex: '1 1 160px' }} value={b.rx} placeholder="e.g. 3x 8 ea" onChange={e => set('rx', e.target.value)} aria-label="Sets and reps" />}
      </div>
      {loaded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px 80px 70px 80px 30px', gap: '6px', ...lbl, fontSize: '10px' }}><span>#</span><span>Reps</span><span>% max</span><span>Tempo</span><span /></div>
          {b.sets.map((s, i) => (
            <div key={i} data-testid="pb-set" style={{ display: 'grid', gridTemplateColumns: '24px 80px 70px 80px 30px', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{i + 1}</span>
              <input className="input-glass" style={small} value={s.reps} onChange={e => setRow(i, 'reps', e.target.value)} aria-label={`Set ${i + 1} reps`} />
              <input className="input-glass" style={small} inputMode="decimal" value={s.pct} placeholder="%" onChange={e => setRow(i, 'pct', e.target.value.replace(/[^0-9.]/g, ''))} aria-label={`Set ${i + 1} percent`} />
              <input className="input-glass" style={small} value={s.tempo} placeholder="X2X" onChange={e => setRow(i, 'tempo', e.target.value.toUpperCase())} aria-label={`Set ${i + 1} tempo`} />
              <button type="button" style={iconBtn} onClick={() => set('sets', b.sets.filter((_, j) => j !== i))} aria-label={`Remove set ${i + 1}`}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" data-testid="pb-add-set" onClick={() => { const last = b.sets[b.sets.length - 1] || {}; set('sets', [...b.sets, newSet(last.reps || '5', last.pct || '', last.tempo || '')]); }} style={{ ...btn(false), height: '30px', fontSize: '11px', alignSelf: 'flex-start' }}><Plus size={14} /> Set</button>
        </div>
      )}
    </div>
  );
});

const DayEditor = React.memo(function DayEditor({ d, i, onChangeDay, onDeleteDay, canDelete }) {
  const dRef = React.useRef(d);
  dRef.current = d;
  const set = (k, v) => onChangeDay(i, { ...dRef.current, [k]: v });
  const setBlock = React.useCallback((j, nb) => {
    const cur = dRef.current;
    onChangeDay(i, { ...cur, blocks: cur.blocks.map((b, k) => (k === j ? nb : b)) });
  }, [i, onChangeDay]);
  const move = React.useCallback((j, dir) => {
    const cur = dRef.current;
    const arr = [...cur.blocks];
    const t = arr[j + dir]; arr[j + dir] = arr[j]; arr[j] = t;
    onChangeDay(i, { ...cur, blocks: arr });
  }, [i, onChangeDay]);
  const delBlock = React.useCallback((j) => {
    const cur = dRef.current;
    onChangeDay(i, { ...cur, blocks: cur.blocks.filter((_, k) => k !== j) });
  }, [i, onChangeDay]);
  const last = d.blocks[d.blocks.length - 1];
  return (
    <div data-testid="pb-day" className="card-glass" style={card}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', textTransform: 'uppercase', alignSelf: 'center', marginRight: '6px' }}>Day {i + 1}</h3>
        <Field label="Date"><input type="date" className="input-glass" style={inp} value={d.date} onChange={e => set('date', e.target.value)} aria-label={`Day ${i + 1} date`} /></Field>
        <Field label="Focus" grow><input className="input-glass" style={inp} value={d.focus} placeholder="e.g. Lower + Power" onChange={e => set('focus', e.target.value)} aria-label={`Day ${i + 1} focus`} /></Field>
        {canDelete && <button type="button" style={{ ...btn(false), marginLeft: 'auto' }} onClick={() => onDeleteDay(i)}><Trash2 size={15} /> Remove day</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
        <Field label="Pre-lift title"><input className="input-glass" style={inp} value={d.warmTitle} onChange={e => set('warmTitle', e.target.value)} /></Field>
        <Field label="Finisher / core title"><input className="input-glass" style={inp} value={d.finTitle} onChange={e => set('finTitle', e.target.value)} /></Field>
        <Field label="Warm-up (one per line)"><textarea className="input-glass" rows={3} style={{ ...inp, height: 'auto', padding: '8px 10px' }} value={lines(d.warm)} onChange={e => set('warm', e.target.value.split('\n'))} onBlur={e => set('warm', toLines(e.target.value))} aria-label={`Day ${i + 1} warm-up`} /></Field>
        <Field label="Finisher / core (one per line)"><textarea className="input-glass" rows={3} style={{ ...inp, height: 'auto', padding: '8px 10px' }} value={lines(d.fin)} onChange={e => set('fin', e.target.value.split('\n'))} onBlur={e => set('fin', toLines(e.target.value))} aria-label={`Day ${i + 1} finisher`} /></Field>
      </div>
      <span style={lbl}>Exercises</span>
      {d.blocks.map((b, j) => (
        <BlockEditor key={b.id || j} b={b} idx={j} onChangeIdx={setBlock} onMoveIdx={move} onDeleteIdx={delBlock} canUp={j > 0} canDown={j < d.blocks.length - 1} />
      ))}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" data-testid="pb-add-ex" style={btn(false)} onClick={() => set('blocks', [...d.blocks, newBlock(last ? nextCode(last.code) : '1a')])}><Plus size={15} /> Exercise ({last ? nextCode(last.code) : '1a'})</button>
        <button type="button" style={btn(false)} onClick={() => set('blocks', [...d.blocks, newBlock(last ? nextCode(last.code, true) : '1a')])}><Plus size={15} /> New group ({last ? nextCode(last.code, true) : '1a'})</button>
      </div>
    </div>
  );
});

export default function ProgramsScreen({ athletes, liftLogs, settings }) {
  // Include any lift types actually logged in Lift Tracker alongside settings.liftTypes
  // so real team lifts (e.g. Front Squat) are always available in "Maxes come from".
  const liftTypes = React.useMemo(() => {
    const base = settings.liftTypes?.length ? settings.liftTypes : ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];
    const logged = (liftLogs || []).map(l => l?.lift_type).filter(Boolean);
    return Array.from(new Set([...base, ...logged]));
  }, [settings.liftTypes, liftLogs]);
  const sports = React.useMemo(() => Array.from(new Set(athletes.map(a => a.sport || 'General'))).sort(), [athletes]);
  const { programs, mode, load, prefetch, save, setArchived, remove, loadAll, saveMany } = usePrograms();
  const [query, setQuery] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const [draft, setDraft] = React.useState(null);
  const [dirty, setDirty] = React.useState(false);
  const [msg, setMsg] = React.useState('');
  const [printing, setPrinting] = React.useState(false);
  // Spreadsheet template / upload / export and the periodization overview (v5.11.0).
  const [importing, setImporting] = React.useState(null); // { fileName, result }
  const [showPeriod, setShowPeriod] = React.useState(false);
  const fileRef = React.useRef(null);
  const downloadTemplate = () => {
    const ex = sampleProgram(liftTypes);
    ex.name = 'Sample Program'; ex.week_label = 'Week 1';
    const monday = new Date(); monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
    const ymd = (d) => d.toLocaleDateString('en-CA');
    ex.days[0].date = ymd(monday);
    const wed = new Date(monday); wed.setDate(wed.getDate() + 2); ex.days[1].date = ymd(wed);
    downloadCsv('hpd-program-template.csv', templateCsv(ex));
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { setMsg('That is an Excel workbook. In Excel use File > Save As > "CSV UTF-8 (Comma delimited)" and upload the .csv.'); return; }
    const rows = parseCsv(await f.text());
    // Two layouts: one row per set (the template), or a weekly grid (Day sections down,
    // weeks across - the printed-sheet layout). Detected from the file itself.
    if (isGrid(rows)) setImporting({ fileName: f.name, grid: parseGrid(rows, { teams: sports }) });
    else setImporting({ fileName: f.name, result: rowsToPrograms(rows, { liftTypes, teams: sports }) });
  };
  const [tplMenu, setTplMenu] = React.useState(false);
  const doImport = async (list) => {
    const res = await saveMany(list);
    if (res.ok) { setImporting(null); setMsg(`Imported ${res.count} program${res.count === 1 ? '' : 's'}.`); }
    return res;
  };

  // Preload WeightRoomCard chunk on mount so clicking "Print cards" opens with zero chunk-fetch delay.
  React.useEffect(() => { loadWeightRoomCard().catch(() => {}); }, []);

  const edit = (p) => { setDraft(clone(p)); setDirty(false); setMsg(''); };
  const change = (p) => { setDraft(p); setDirty(true); setMsg(''); };
  const set = (k, v) => change({ ...draft, [k]: v });
  const onChangeDay = React.useCallback((idx, nd) => {
    setDraft(prev => prev ? { ...prev, days: prev.days.map((x, j) => (j === idx ? nd : x)) } : prev);
    setDirty(true);
    setMsg('');
  }, []);
  const onDeleteDay = React.useCallback((idx) => {
    setDraft(prev => prev ? { ...prev, days: prev.days.filter((_, j) => j !== idx) } : prev);
    setDirty(true);
    setMsg('');
  }, []);
  const open = async (p) => { setOpening(true); const full = await load(p.id); setOpening(false); if (full) edit(full); else setMsg('Could not open that program - check the connection and try again.'); };
  const doSave = async () => { const res = await save(draft); if (res.ok) setDirty(false); setMsg(res.ok ? (res.local ? 'Saved in this browser.' : 'Saved.') : "Couldn't save - check the connection and try again."); return res.ok; };
  const q = query.trim().toLowerCase();
  const visible = programs.filter(p => (showArchived ? p.archived_at : !p.archived_at) && (!q || [p.name, p.week_label, p.phase, p.sport].some(v => String(v || '').toLowerCase().includes(q))));
  const archivedCount = programs.filter(p => p.archived_at).length;

  return (
    <div className="animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.1em', marginBottom: '4px' }}>LOG · PROGRAMS</div>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 700, textTransform: 'uppercase' }}>Program Builder</h1>
          <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Build a training week, then print a Weight Room Card per athlete with weights from their maxes.</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" data-testid="pb-new" style={btn(true)} onClick={() => { edit(newProgram(liftTypes)); setDirty(true); }}><Plus size={16} /> New program</button>
          <button type="button" data-testid="pb-sample" style={btn(false)} onClick={() => { edit(sampleProgram(liftTypes)); setDirty(true); }}>Start from sample</button>
          <div style={{ position: 'relative' }}>
            <button type="button" data-testid="pb-template-menu" aria-expanded={tplMenu} style={btn(false)} onClick={() => setTplMenu(v => !v)} title="A spreadsheet (CSV) to plan in Excel or Google Sheets and upload"><FileDown size={16} /> Download template</button>
            {tplMenu && (
              <div role="menu" style={{ position: 'absolute', top: '46px', right: 0, zIndex: 30, minWidth: '260px', padding: '6px', borderRadius: '12px', background: 'var(--navy-900, #0b1220)', border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <button type="button" role="menuitem" data-testid="pb-template-grid" onClick={() => { setTplMenu(false); downloadCsv('hpd-program-weekly-grid.csv', gridTemplateCsv()); }} style={{ ...btn(false), border: 'none', height: 'auto', minHeight: '44px', padding: '8px 10px', flexDirection: 'column', alignItems: 'flex-start', textTransform: 'none', gap: '2px' }}><span style={{ fontWeight: 800 }}>Weekly grid</span><span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>Days down, weeks across - like a printed sheet</span></button>
                <button type="button" role="menuitem" data-testid="pb-template" onClick={() => { setTplMenu(false); downloadTemplate(); }} style={{ ...btn(false), border: 'none', height: 'auto', minHeight: '44px', padding: '8px 10px', flexDirection: 'column', alignItems: 'flex-start', textTransform: 'none', gap: '2px' }}><span style={{ fontWeight: 800 }}>One row per set</span><span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-muted)' }}>Every detail, easy to sort and filter</span></button>
              </div>
            )}
          </div>
          <button type="button" data-testid="pb-upload" style={btn(false)} onClick={() => fileRef.current?.click()} title="Upload programs from a filled-in template (.csv)"><FileUp size={16} /> Upload programs</button>
          <input ref={fileRef} data-testid="pb-upload-input" type="file" accept=".csv,text/csv,.xlsx,.xls" onChange={onFile} style={{ display: 'none' }} />
          <button type="button" data-testid="pb-periodization" aria-pressed={showPeriod} style={btn(showPeriod)} onClick={() => setShowPeriod(v => !v)}><ChartColumn size={16} /> Periodization</button>
        </div>
      </div>
      {mode === 'local' && (
        <div data-testid="pb-local" style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(184,156,91,0.12)', border: '1px solid rgba(184,156,91,0.4)', fontSize: '13px', color: 'var(--color-text)' }}>
          The <b>programs</b> table isn't set up in Supabase yet (run <code>db/014_programs.sql</code>), so programs are only kept in this browser for now. They upload automatically the first time the app loads after it's created.
        </div>
      )}
      {!draft && msg && <div role="status" data-testid="pb-msg" style={{ fontSize: '13px', color: /^Imported/.test(msg) ? '#10b981' : 'var(--color-text)' }}>{msg}</div>}
      {showPeriod && (
        <React.Suspense fallback={null}>
          <PeriodizationPanel loadAll={loadAll} sports={sports} initialSport={draft?.sport || 'ALL'} onClose={() => setShowPeriod(false)} />
        </React.Suspense>
      )}
      {mode === 'error' && <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', fontSize: '13px' }}>Couldn't reach the server to load programs. Programs need a connection - they aren't stored on the device.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '16px', alignItems: 'start' }}>
        <div className="card-glass" style={{ ...card, gridColumn: 'span 1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span style={lbl}>{showArchived ? 'Archived' : 'Programs'}</span>
            {(archivedCount > 0 || showArchived) && <button type="button" data-testid="pb-show-archived" onClick={() => setShowArchived(!showArchived)} style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{showArchived ? 'Back to current' : `Archived (${archivedCount})`}</button>}
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input type="search" data-testid="pb-search" className="input-glass" placeholder="Search programs" value={query} onChange={e => setQuery(e.target.value)} style={{ ...inp, width: '100%', paddingLeft: '32px' }} aria-label="Search programs" />
          </div>
          {visible.length === 0 && <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{q ? `No programs match "${query}".` : showArchived ? 'Nothing archived.' : 'None yet. Start a new one or from the sample.'}</span>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
          {visible.map(p => (
            <button key={p.id} type="button" data-testid="pb-item" disabled={opening} onMouseEnter={() => prefetch?.(p.id)} onFocus={() => prefetch?.(p.id)} onClick={() => open(p)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', border: `1px solid ${draft?.id === p.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`, background: draft?.id === p.id ? 'rgba(184,156,91,0.12)' : 'transparent', color: 'var(--color-text)' }}>
              <div style={{ fontWeight: 800 }}>{p.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{[p.week_label, p.phase, p.dayCount ? `${p.dayCount}-day` : '', p.sport].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
          </div>
        </div>

        {draft && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="card-glass" style={card}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Field label="Program name" grow><input data-testid="pb-name" className="input-glass" style={inp} value={draft.name} onChange={e => set('name', e.target.value)} /></Field>
                <Field label="Week"><input className="input-glass" style={{ ...inp, width: '110px' }} value={draft.week_label || ''} onChange={e => set('week_label', e.target.value)} /></Field>
                <Field label="Phase" grow><input className="input-glass" style={inp} value={draft.phase || ''} onChange={e => set('phase', e.target.value)} /></Field>
                <Field label="Default team">
                  <select className="input-glass" style={inp} value={draft.sport || ''} onChange={e => set('sport', e.target.value)}>
                    <option value="" style={opt}>Any</option>
                    {sports.map(s => <option key={s} value={s} style={opt}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <p data-testid="pb-tablet-hint" style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-muted)' }}>
                {draft.sport ? `Shows on the Lift Tracker tablets (Lift Kiosk Mode) for ${draft.sport} on each day's date.` : 'Pick a team to show this program on the Lift Tracker tablets on each day\'s date.'}
              </p>
              <div>
                <span style={lbl}>Maxes come from (best est. 1RM in Lift Tracker)</span>
                <div style={{ marginTop: '6px' }}>
                  <Field label="Max window">
                    <select data-testid="pb-window" className="input-glass" style={{ ...small, width: '170px' }} value={draft.max_map?.window || 'all'} onChange={e => set('max_map', { ...draft.max_map, window: e.target.value })}>
                      {MAX_WINDOWS.map(([k, l]) => <option key={k} value={k} style={opt}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {MAX_KEYS.map(([k, l]) => (
                    <Field key={k} label={l}>
                      <select data-testid={`pb-max-${k}`} className="input-glass" style={{ ...small, width: '150px' }} value={draft.max_map?.[k] || ''} onChange={e => set('max_map', { ...draft.max_map, [k]: e.target.value })}>
                        <option value="" style={opt}>Not used</option>
                        {liftTypes.map(t => <option key={t} value={t} style={opt}>{t}</option>)}
                      </select>
                    </Field>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button type="button" data-testid="pb-save" style={btn(true)} onClick={doSave}><Save size={16} /> {dirty ? 'Save' : 'Saved'}</button>
                <button type="button" data-testid="pb-print" style={btn(false)} onClick={() => { setPrinting(true); if (dirty) doSave(); }}><Printer size={16} /> Print cards</button>
                <button type="button" style={btn(false)} onClick={() => { const c = clone(draft); c.id = newProgram().id; c.name = `${draft.name} (copy)`; edit(c); setDirty(true); }}><Copy size={16} /> Duplicate</button>
                <button type="button" data-testid="pb-export" style={btn(false)} onClick={() => downloadCsv(`${fileSafe(draft.name)}${draft.week_label ? `-${fileSafe(draft.week_label)}` : ''}.csv`, toCsv(programsToRows([draft])))} title="Download this program as a spreadsheet (same layout as the template)"><Download size={16} /> Download CSV</button>
                {programs.some(p => p.id === draft.id) && (
                  <button type="button" data-testid="pb-archive" style={btn(false)} onClick={async () => { const res = await setArchived(draft, !draft.archived_at); if (res.ok) { setDraft(null); setMsg(''); } else setMsg("Couldn't update archive status — check connection."); }}>
                    <Archive size={16} /> {draft.archived_at ? 'Unarchive' : 'Archive'}
                  </button>
                )}
                {programs.some(p => p.id === draft.id) && <button type="button" style={btn(false)} onClick={async () => { if (window.confirm(`Delete "${draft.name}" for good? Archive keeps it for reprints.`)) { const res = await remove(draft.id); if (res.ok) { setDraft(null); setMsg(''); } else setMsg("Couldn't delete — check connection."); } }}><Trash2 size={16} /> Delete</button>}
                <span role="status" style={{ fontSize: '13px', color: dirty ? 'var(--color-text-muted)' : '#10b981' }}>{dirty ? 'Unsaved changes' : msg}</span>
              </div>
            </div>
            {(draft.days || []).map((d, i) => (
              <DayEditor key={d.id || i} d={d} i={i} canDelete={draft.days.length > 1} onChangeDay={onChangeDay} onDeleteDay={onDeleteDay} />
            ))}
            {draft.days.length < 4 && <button type="button" data-testid="pb-add-day" style={{ ...btn(false), alignSelf: 'flex-start' }} onClick={() => set('days', [...draft.days, newDay()])}><Plus size={16} /> Add day ({draft.days.length + 1} of 4)</button>}
          </div>
        )}
      </div>
      {importing && (
        <React.Suspense fallback={null}>
          <ProgramImportPanel fileName={importing.fileName} result={importing.result} grid={importing.grid} teams={sports} liftTypes={liftTypes} existing={programs} onImport={doImport} onClose={() => setImporting(null)} />
        </React.Suspense>
      )}
      {printing && draft && (
        <React.Suspense fallback={null}>
          <WeightRoomCard program={draft} athletes={athletes} liftLogs={liftLogs} settings={settings} onSaveProgram={async (p) => { setDraft(p); await save(p); }} onClose={() => setPrinting(false)} />
        </React.Suspense>
      )}
    </div>
  );
}
