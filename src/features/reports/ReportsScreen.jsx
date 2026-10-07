import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download } from 'lucide-react';
import ReadinessReport, { REPORT_SECTIONS } from './ReadinessReport';
const PerfReadinessReport = React.lazy(() => import('./PerfReadinessReport'));
import { buildReadinessReport } from './readinessData';

// Reports tab = the Readiness Report (design handoff Part 2, docs/HANDOFF.md §107). The
// on-screen preview is the same document that prints. Export PDF renders it into a portal
// outside #root and prints only that (body class rr-printing), on US Letter, 0.5in margins.
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function ReportsScreen({
  settings, reportData = [], athletes = [], liftLogs = [], performanceTests = [],
  reportSportFilter = 'ALL', setReportSportFilter, sportsList = [], reportLoading, ensureReportWindow,
}) {
  // Custom report: which sections print. Remembered per device.
  const [include, setInclude] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('hpd_rr_sections')); if (Array.isArray(v)) return new Set(v); } catch { /* ignore */ }
    return new Set(REPORT_SECTIONS.map(([k]) => k));
  });
  const toggle = (k) => setInclude(prev => {
    const next = new Set(prev); next.has(k) ? next.delete(k) : next.add(k);
    try { localStorage.setItem('hpd_rr_sections', JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  const showWeighIn = include.has('weighin');
  // Lifts print as the set ("225 × 3"); est. 1RM in brackets is optional.
  const [showE1rm, setShowE1rm] = useState(() => { try { return localStorage.getItem('hpd_rr_e1rm') === '1'; } catch { return false; } });
  const toggleE1rm = (v) => { setShowE1rm(v); try { localStorage.setItem('hpd_rr_e1rm', v ? '1' : '0'); } catch { /* ignore */ } };
  const [printing, setPrinting] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);
  const sport = reportSportFilter || 'ALL';

  // Days-since-weigh-in needs history beyond the default window.
  useEffect(() => { ensureReportWindow?.(90); }, [ensureReportWindow]);

  const data = useMemo(() => buildReadinessReport({ athletes, reportData, liftLogs, performanceTests, settings, sport, showE1rm }),
    [athletes, reportData, liftLogs, performanceTests, settings, sport, showE1rm]);
  const scopeLabel = sport === 'ALL' ? 'All Sports' : sport;

  useEffect(() => {
    if (!printing) return;
    const style = document.createElement('style');
    style.textContent = '@page { size: letter; margin: 0.5in; }';
    document.head.appendChild(style);
    document.body.classList.add('rr-printing');
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const t = setTimeout(() => window.print(), 300);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('rr-printing'); style.remove(); };
  }, [printing]);

  const exportCSV = () => {
    const rows = [['Section', 'Athlete', 'Sport', 'Detail', 'Value']];
    if (include.has('mass')) data.mass.forEach(r => rows.push(['Mass drop', r.name, r.sport, `Baseline ${r.base.toFixed(1)} -> ${r.cur.toFixed(1)} lb`, `-${r.drop.toFixed(1)} lb (${r.pct.toFixed(1)}%)`]));
    if (include.has('sweat')) data.sweat.forEach(r => rows.push(['Sweat loss', r.name, r.sport, r.when, `-${r.drop.toFixed(1)} lb`]));
    if (include.has('sleep')) data.sleep.forEach(r => rows.push(['Sleep', r.name, r.sport, `${r.nights} night(s) under`, `${r.latest} h`]));
    if (include.has('load')) data.load.forEach(r => rows.push(['Load', r.name, r.sport, r.zone, r.ratio == null ? '' : r.ratio.toFixed(2)]));
    if (include.has('flags')) data.flags.forEach(g => g.rows.forEach(r => rows.push(['Below best', r.name, r.sport, `${g.title}: ${r.latest} vs ${r.best}`, `-${Math.round(r.off)}%`])));
    if (include.has('prs')) data.prs.forEach(r => rows.push(['New PR', r.name, r.sport, r.what, r.val]));
    if (showWeighIn) data.weighIn.forEach(g => g.names.forEach(n => rows.push(['Weigh-in needed', n.label, g.sport, '', ''])));
    const blob = new Blob([rows.map(r => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `readiness-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const doc = <ReadinessReport data={data} scopeLabel={scopeLabel} include={include} />;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sport
          <select data-testid="rr-sport" value={sport} onChange={e => setReportSportFilter?.(e.target.value)} className="ml-2 border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-800 normal-case">
            <option value="ALL">All sports</option>
            {sportsList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          {settings.enableSpeedPower && <button data-testid="pr-open" onClick={() => { ensureReportWindow?.(180); setPerfOpen(true); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50">Perf vs readiness</button>}
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download size={16} /> CSV</button>
          <button data-testid="rr-print" onClick={() => setPrinting(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#061c41] text-white text-sm font-bold hover:bg-[#133b78]"><Printer size={16} /> Export PDF</button>
        </div>
        <div className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-slate-100" data-testid="rr-custom">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Include</span>
          {REPORT_SECTIONS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <input data-testid={`rr-include-${k}`} type="checkbox" checked={include.has(k)} onChange={() => toggle(k)} /> {label}
            </label>
          ))}
          {settings.enableLiftTracker && (
            <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <input data-testid="rr-e1rm" type="checkbox" checked={showE1rm} onChange={e => toggleE1rm(e.target.checked)} /> Est. 1RM on lifts
            </label>
          )}
        </div>
      </div>
      {reportLoading && <p className="text-sm text-slate-500">Loading report data…</p>}
      <div className="bg-white shadow-sm border border-slate-200 rounded-xl overflow-x-auto" style={{ padding: '0.5in' }}>
        <div style={{ minWidth: 680 }}>{doc}</div>
      </div>
      {perfOpen && (
        <React.Suspense fallback={null}>
          <PerfReadinessReport athletes={athletes} reportData={reportData} performanceTests={performanceTests} settings={settings} initialSport={sport} onClose={() => setPerfOpen(false)} />
        </React.Suspense>
      )}
      {printing && createPortal(
        <div className="rr-print-root">
          <style>{`
            .rr-print-root { display: none; }
            @media print {
              html body.rr-printing > *:not(.rr-print-root), html body.rr-printing > #root { display: none !important; }
              html body.rr-printing > .rr-print-root { display: block !important; background: #fff; }
            }
          `}</style>
          {doc}
        </div>, document.body)}
    </div>
  );
}
