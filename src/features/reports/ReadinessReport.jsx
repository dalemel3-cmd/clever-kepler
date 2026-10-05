// The printable Readiness Report document (design handoff "HPD Printables", Part 2).
// A flowing US Letter document: the browser paginates it, table headers repeat on every
// page, and a running footer prints on every page (the whole document sits inside one
// table whose <tfoot> is the footer - Chromium repeats a table footer per printed page).
// Sections with nothing to show collapse into one "CLEAR" line instead of an empty
// table. Styling is the handoff's, inline, so print and screen match.
const C = {
  navy900: '#061c41', navy700: '#133b78', navy500: '#3467b3', navy100: '#e4eaf3',
  gold300: '#d3bf8c', gold500: '#b89c5b', gold700: '#93783f', gold900: '#6f5c33', white: '#ffffff',
  text: 'oklch(0.19 0.014 258)', muted: 'oklch(0.38 0.012 258)', border: 'oklch(0.88 0.006 258)', borderStrong: 'oklch(0.79 0.008 258)',
  neutral100: 'oklch(0.94 0.004 258)',
  danger: 'oklch(0.55 0.16 25)', dangerBg: 'oklch(0.95 0.04 25)',
  success: 'oklch(0.58 0.11 152)', successDark: 'oklch(0.42 0.09 152)', successBg: 'oklch(0.95 0.03 152)',
  warningBg: 'oklch(0.95 0.05 75)',
};
const DISPLAY = "'Oswald', Impact, sans-serif";
const BODY = "'Manrope', 'Inter', system-ui, sans-serif";

const pill = (bg, fg) => ({ padding: '3px 10px', borderRadius: 999, fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', background: bg, color: fg, whiteSpace: 'nowrap' });
const th = (align = 'left', extra = {}) => ({ padding: '7px 10px', textAlign: align, fontWeight: 700, ...extra });
const td = (align = 'left', extra = {}) => ({ padding: '7px 10px', textAlign: align, ...extra });
const theadRow = { background: C.navy900, color: C.gold300, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const rowLine = { borderBottom: `1px solid ${C.border}` };
const fmt1 = (n) => Number(n).toFixed(1);

function SectionHead({ n, title, pills, note }) {
  return (
    <>
      <div style={{ marginTop: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingBottom: 6, borderBottom: `2px solid ${C.navy900}`, breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, color: C.gold700 }}>{String(n).padStart(2, '0')}</span>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 22, textTransform: 'uppercase', color: C.navy900 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>{pills}</div>
      </div>
      <p style={{ margin: '6px 0 10px', fontSize: 12, color: C.muted, breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>{note}</p>
    </>
  );
}

const ZONE = {
  spike: { label: 'Spike', color: C.danger, bar: C.danger },
  high: { label: 'High', color: C.gold900, bar: C.gold500 },
  target: { label: 'Target', color: C.navy900, bar: C.navy900 },
  under: { label: 'Underloaded', color: C.navy500, bar: C.navy500 },
  none: { label: '—', color: C.muted, bar: 'transparent' },
};

export default function ReadinessReport({ data, scopeLabel, showWeighIn = true, date = new Date() }) {
  const dateLong = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const dateShort = date.toLocaleDateString('en-US');
  const t = data.thresholds;
  const PR_SHOW = 24;

  const tiles = [
    { n: data.mass.length, label: 'Mass drop risk', sub: `>${t.dehydration} lb below baseline`, color: data.mass.length ? C.danger : C.navy900 },
    { n: data.spikes, label: 'Load spikes', sub: 'A:C 1.5 or higher', color: data.spikes ? C.danger : C.navy900 },
    { n: data.flagCount, label: 'Below best', sub: '5%+ off personal best', color: C.navy900 },
    { n: data.under, label: 'Underloaded', sub: 'A:C below 0.8', color: C.navy900 },
    { n: data.prs.length, label: 'New PRs', sub: 'Last 14 days', color: C.successDark },
    { n: data.weighInTotal, label: 'Need weigh-in', sub: 'None in 14+ days', color: C.navy900 },
  ];

  // Each check: [key, title, rows, clear note, render]. Empty ones become CLEAR lines.
  const sections = [
    {
      key: 'mass', title: 'Dehydration & Mass Drop Risk', count: data.mass.length,
      clear: `No athletes more than ${t.dehydration} lb below baseline.`,
      pills: [<span key="p" style={pill(C.dangerBg, C.danger)}>{data.mass.length} at risk</span>],
      note: `Down more than ${t.dehydration} lb from each athlete's baseline weigh-in (not week to week). Rehydrate and recheck before next session.`,
      body: (
        <table style={table}>
          <thead><tr style={theadRow}><th style={th()}>Athlete</th><th style={th()}>Sport</th><th style={th('right')}>Baseline</th><th style={th()}>Baseline date</th><th style={th('right')}>Current</th><th style={th('right')}>Drop</th><th style={th('right')}>Logged</th></tr></thead>
          <tbody>{data.mass.map(r => (
            <tr key={r.id} data-testid="rr-row" style={rowLine}>
              <td style={td('left', { fontWeight: 700, color: C.navy900 })}>{r.name}</td>
              <td style={td('left', { color: C.muted })}>{r.sport}</td>
              <td style={td('right')}>{fmt1(r.base)} lb</td>
              <td style={td('left', { color: C.muted })}>{r.baseDate}</td>
              <td style={td('right')}>{fmt1(r.cur)} lb</td>
              <td style={td('right', { fontWeight: 700, color: r.severe ? C.danger : C.navy900 })}>{'−'}{fmt1(r.drop)} lb <span style={{ fontWeight: 600, color: C.muted }}>({fmt1(r.pct)}%)</span></td>
              <td style={td('right', { color: C.muted })}>{r.logged}</td>
            </tr>))}</tbody>
        </table>
      ),
    },
    {
      key: 'sweat', title: 'Post-Practice Sweat Loss', count: data.sweat.length,
      clear: 'No athletes in negative after practice.',
      pills: [<span key="p" style={pill(C.dangerBg, C.danger)}>{data.sweat.length} in negative</span>],
      note: 'Post-practice weigh-in below that day’s pre-practice weight. Replace about 16-24 oz of fluid per lb lost.',
      body: (
        <table style={table}>
          <thead><tr style={theadRow}><th style={th()}>Athlete</th><th style={th()}>Sport</th><th style={th('right')}>Pre</th><th style={th('right')}>Post</th><th style={th('right')}>Loss</th><th style={th('right')}>Logged</th></tr></thead>
          <tbody>{data.sweat.map(r => (
            <tr key={r.id} data-testid="rr-row" style={rowLine}>
              <td style={td('left', { fontWeight: 700, color: C.navy900 })}>{r.name}</td>
              <td style={td('left', { color: C.muted })}>{r.sport}</td>
              <td style={td('right')}>{fmt1(r.pre)} lb</td>
              <td style={td('right')}>{fmt1(r.post)} lb</td>
              <td style={td('right', { fontWeight: 700, color: r.severe ? C.danger : C.navy900 })}>{'−'}{fmt1(r.drop)} lb <span style={{ fontWeight: 600, color: C.muted }}>({fmt1(r.pct)}%)</span></td>
              <td style={td('right', { color: C.muted })}>{r.when}</td>
            </tr>))}</tbody>
        </table>
      ),
    },
    {
      key: 'sleep', title: 'Sleep Deficiency', count: data.sleep.length,
      clear: `No logs under ${t.sleep} hours this period.`,
      pills: [<span key="p" style={pill(C.warningBg, C.gold900)}>{data.sleep.length} under {t.sleep} h</span>],
      note: `Sleep logged under ${t.sleep} hours in the last 7 days.`,
      body: (
        <table style={table}>
          <thead><tr style={theadRow}><th style={th()}>Athlete</th><th style={th()}>Sport</th><th style={th('right')}>Latest low</th><th style={th('right')}>Nights under</th><th style={th('right')}>Logged</th></tr></thead>
          <tbody>{data.sleep.map(r => (
            <tr key={r.id} data-testid="rr-row" style={rowLine}>
              <td style={td('left', { fontWeight: 700, color: C.navy900 })}>{r.name}</td>
              <td style={td('left', { color: C.muted })}>{r.sport}</td>
              <td style={td('right', { fontWeight: 700 })}>{fmt1(r.latest)} h</td>
              <td style={td('right', { color: C.muted })}>{r.nights}</td>
              <td style={td('right', { color: C.muted })}>{r.when}</td>
            </tr>))}</tbody>
        </table>
      ),
    },
    data.loadEnabled !== false && {
      key: 'load', title: 'Training Load · Acute:Chronic', count: data.load.length,
      clear: 'No RPE sessions logged in the last 28 days.',
      pills: [<span key="s" style={pill(C.dangerBg, C.danger)}>{data.spikes} spike</span>, <span key="u" style={pill(C.navy100, C.navy700)}>{data.under} underloaded</span>],
      note: `7-day RPE load vs. 28-day weekly average. Target band 0.8–${t.high} (shaded). Spike at 1.5 or above; underloaded below 0.8.`,
      body: (
        <table style={table}>
          <thead><tr style={theadRow}><th style={th()}>Athlete</th><th style={th()}>Sport</th><th style={th('right')}>A:C</th><th style={th('left', { width: 150 })}>0 · · · 1.0 · · · 2.0</th><th style={th('right')}>7-day</th><th style={th('right')}>Sess.</th><th style={th('right')}>RPE</th><th style={th()}>Status</th></tr></thead>
          <tbody>{data.load.map(r => {
            const z = ZONE[r.zone];
            const w = r.ratio == null ? 0 : Math.min(100, (r.ratio / 2) * 100);
            const pad = { padding: '5px 10px' };
            return (
              <tr key={r.id} data-testid="rr-row" style={rowLine}>
                <td style={{ ...pad, fontWeight: 700, color: C.navy900 }}>{r.name}</td>
                <td style={{ ...pad, color: C.muted }}>{r.sport}</td>
                <td style={{ ...pad, textAlign: 'right', fontWeight: 700, color: z.color }}>{r.ratio == null ? '—' : r.ratio.toFixed(2)}</td>
                <td style={pad}>
                  <div style={{ position: 'relative', height: 10, background: C.neutral100 }}>
                    <div style={{ position: 'absolute', left: '40%', width: `${((t.high - 0.8) / 2) * 100}%`, top: 0, bottom: 0, background: C.navy100 }} />
                    <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: C.borderStrong }} />
                    <div style={{ position: 'absolute', left: 0, top: 3, height: 4, width: `${w}%`, background: z.bar }} />
                    {r.ratio != null && <div style={{ position: 'absolute', left: `${w}%`, top: -1, width: 3, height: 12, marginLeft: -1, background: z.bar }} />}
                  </div>
                </td>
                <td style={{ ...pad, textAlign: 'right' }}>{r.acute} AU</td>
                <td style={{ ...pad, textAlign: 'right', color: C.muted }}>{r.sessions}</td>
                <td style={{ ...pad, textAlign: 'right', color: C.muted }}>{r.avgRpe.toFixed(1)}</td>
                <td style={{ ...pad, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: z.color }}>{r.zone === 'none' ? 'No baseline' : z.label}</td>
              </tr>
            );
          })}</tbody>
        </table>
      ),
    },
    {
      key: 'flags', title: 'Performance Flags', count: data.flagCount,
      clear: 'No athletes 5% or more below their personal best.',
      pills: [<span key="p" style={pill(C.warningBg, C.gold900)}>{data.flagCount} below best</span>],
      note: 'Latest test 5% or more below personal best, sorted by size of drop. 15%+ in red.',
      body: data.flags.map(g => (
        <div key={g.title} style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0 0 6px', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.navy900 }}>{g.title}</span>
            <span style={{ fontSize: 12, color: C.muted }}>{g.rows.length} athlete{g.rows.length === 1 ? '' : 's'}</span>
          </div>
          <table style={table}>
            <thead><tr style={theadRow}><th style={th('left', { padding: '6px 10px' })}>Athlete</th><th style={th('left', { padding: '6px 10px' })}>Sport</th><th style={th('right', { padding: '6px 10px' })}>Latest</th><th style={th('right', { padding: '6px 10px' })}>Best</th><th style={th('left', { padding: '6px 10px', width: 130 })}>Drop</th></tr></thead>
            <tbody>{g.rows.map(r => {
              const color = r.off >= 15 ? C.danger : r.off >= 10 ? C.navy900 : C.muted;
              const pad = { padding: '5px 10px' };
              return (
                <tr key={r.id} data-testid="rr-row" style={rowLine}>
                  <td style={{ ...pad, fontWeight: 700, color: C.navy900 }}>{r.name}</td>
                  <td style={{ ...pad, color: C.muted }}>{r.sport}</td>
                  <td style={{ ...pad, textAlign: 'right' }}>{r.latest}</td>
                  <td style={{ ...pad, textAlign: 'right', color: C.muted }}>{r.best}</td>
                  <td style={pad}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 60, height: 6, background: C.neutral100, flex: 'none' }}><div style={{ height: 6, width: `${Math.min(100, (r.off / 25) * 100)}%`, background: color }} /></div><span style={{ fontWeight: 700, color }}>{'−'}{Math.round(r.off)}%</span></div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )),
    },
    {
      key: 'prs', title: 'New PRs · Last 14 Days', count: data.prs.length,
      clear: 'No new personal records in the last 14 days.',
      pills: [<span key="p" style={pill(C.successBg, C.successDark)}>{data.prs.length} new</span>],
      note: 'Lifts (estimated 1RM) and jump/sprint tests that beat the athlete’s previous best.',
      body: (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 24, marginTop: 8 }}>
            {data.prs.slice(0, PR_SHOW).map(p => (
              <div key={p.id} data-testid="rr-pr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13, breakInside: 'avoid' }}>
                <span style={{ fontWeight: 700, color: C.navy900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                <span style={{ flex: 'none', color: C.muted }}>{p.what} <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: C.navy900 }}>{p.val}</span></span>
              </div>
            ))}
          </div>
          {data.prs.length > PR_SHOW && <p style={{ margin: '8px 0 0', fontSize: 12, color: C.muted }}>+{data.prs.length - PR_SHOW} more in HPD › Strength.</p>}
        </>
      ),
    },
    showWeighIn && {
      key: 'weighin', title: 'Baseline Weigh-In Needed', count: data.weighInTotal,
      clear: 'Every athlete has weighed in within the last 14 days.',
      pills: [<span key="p" style={pill(C.neutral100, C.muted)}>{data.weighInTotal} athletes</span>],
      note: 'No weigh-in in 14+ days. Days since last weigh-in shown where one exists; all others have never logged.',
      body: data.weighIn.map(b => (
        <div key={b.sport} style={{ marginTop: 12, breakInside: 'avoid' }}>
          <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.gold700, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>{b.sport} · {b.names.length}</div>
          <div style={{ columnCount: 4, columnGap: 16, fontSize: 12, lineHeight: 1.7, paddingTop: 4, color: C.text }}>
            {b.names.map(n => <div key={n.id} data-testid="rr-weighin" style={{ breakInside: 'avoid' }}>{n.label}</div>)}
          </div>
        </div>
      )),
    },
  ].filter(Boolean);

  const shown = sections.filter(s => s.count > 0);
  const clear = sections.filter(s => s.count === 0);

  return (
    <div className="rr-doc" data-testid="readiness-report" style={{ background: C.white, color: C.text, fontFamily: BODY, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tfoot>
          <tr><td>
            <div className="rr-footer" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 8, marginTop: 16, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted }}>
              <span>Shiloh Christian Human Performance · Readiness Report · {dateShort}</span>
              <span>Confidential · coaching and medical staff only</span>
            </div>
          </td></tr>
        </tfoot>
        <tbody><tr><td>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, padding: '6px 0 18px', borderTop: `10px solid ${C.navy900}`, borderBottom: `3px solid ${C.gold500}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.gold700 }}>Human Performance · {scopeLabel}</div>
              <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 600, fontSize: 52, lineHeight: 1.02, textTransform: 'uppercase', color: C.navy900 }}>Readiness Report</h1>
              <div style={{ fontSize: 14, color: C.muted }}>{dateLong} · Generated from HPD</div>
            </div>
            <img src="/hp-logo.png" alt="Shiloh Christian Human Performance" style={{ height: 96, flexShrink: 0, margin: '6px -12px 0 0' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, background: C.border, border: `1px solid ${C.border}`, marginTop: 20, breakInside: 'avoid' }}>
            {tiles.map(tl => (
              <div key={tl.label} data-testid="rr-tile" style={{ background: C.white, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 38, lineHeight: 1, color: tl.color }}>{tl.n}</div>
                <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.navy900 }}>{tl.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{tl.sub}</div>
              </div>
            ))}
          </div>

          {clear.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, breakInside: 'avoid' }}>
              {clear.map(c => (
                <div key={c.key} data-testid="rr-clear" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ flex: 'none', padding: '2px 8px', borderRadius: 999, fontWeight: 700, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', background: C.successBg, color: C.successDark }}>Clear</span>
                  <span style={{ fontWeight: 700, color: C.navy900 }}>{c.title}</span>
                  <span style={{ color: C.muted }}>{c.clear}</span>
                </div>
              ))}
            </div>
          )}

          {shown.map((s, i) => (
            <section key={s.key} data-testid={`rr-section-${s.key}`}>
              <SectionHead n={i + 1} title={s.title} pills={s.pills} note={s.note} />
              {s.body}
            </section>
          ))}
        </td></tr></tbody>
      </table>
    </div>
  );
}
