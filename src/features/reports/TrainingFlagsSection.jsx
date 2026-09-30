import { Flag } from 'lucide-react';
import { buildRpeRows, flagsFor } from '../rpe/rpeMetrics';
import { buildStrengthRows, strengthFlags } from '../lifts/liftMetrics';
import { buildPowerRows, powerFlags, variantsFor } from '../analytics/powerMetrics';
import { TEST_TYPES, VARIANT_LABEL, UNTAGGED_VARIANT_LABEL, formatMetric } from '../analytics/testVariants';

// Training Flags for the Reports handout: the warnings from the Performance deep-dive
// tabs (RPE, Strength, Jumps & Sprints), gathered into one short list a coach can act
// on. Uses the exact same math and thresholds as those tabs, so the handout and the
// screens always agree. Only problems are listed row by row; new PRs/PBs get one line.
const TONE_COLOR = { bad: '#ef4444', warn: '#f59e0b' };
const TONE_RANK = { bad: 0, warn: 1 };
const DEFAULT_LIFTS = ['Bench', 'Squat', 'Deadlift', 'Hang Clean', 'Power Clean'];

export function collectTrainingFlags({ athletes, reportData, liftLogs, performanceTests, settings }) {
  const flags = [];
  const wins = [];

  if (settings.enableRpe) {
    for (const r of buildRpeRows(athletes, reportData, settings, { windowWeeks: 6 })) {
      for (const f of flagsFor(r, settings)) {
        if (f.key === 'quiet') continue; // "no RPE lately" is a logging gap, not a training flag
        flags.push({
          athlete: r.athlete, area: 'RPE', label: f.label, tone: f.tone,
          detail: f.key === 'monotony'
            ? `Monotony ${r.monotony.toFixed(2)} (same load day after day)`
            : `A:C ${r.ratio.toFixed(2)} · 7-day ${Math.round(r.acuteLoad)} vs ${Math.round(r.chronicWeekly)}/wk`,
        });
      }
    }
  }

  if (settings.enableLiftTracker) {
    const lifts = settings.liftTypes && settings.liftTypes.length ? settings.liftTypes : DEFAULT_LIFTS;
    for (const lift of lifts) {
      for (const r of buildStrengthRows(athletes, liftLogs, { lift, windowWeeks: 8 })) {
        for (const f of strengthFlags(r)) {
          if (f.key === 'pr') wins.push(`${r.athlete.name} ${lift} ${r.pr}`);
          if (f.key !== 'down') continue;
          flags.push({
            athlete: r.athlete, area: lift, label: f.label, tone: f.tone,
            detail: `Recent best est. ${r.recentBest} vs PR ${r.pr} (${r.prSet.weight_lbs}×${r.prSet.reps})`,
          });
        }
      }
    }
  }

  if (settings.enableSpeedPower) {
    for (const tt of TEST_TYPES) {
      for (const v of variantsFor(performanceTests, tt.key)) {
        const vName = v.key === 'untagged' ? UNTAGGED_VARIANT_LABEL : VARIANT_LABEL[v.key] || v.key;
        const area = tt.variants.length > 1 || v.key === 'untagged' ? `${tt.label} (${vName})` : tt.label;
        for (const r of buildPowerRows(athletes, performanceTests, { testKey: tt.key, variant: v.key, windowWeeks: 26 })) {
          for (const f of powerFlags(r, tt.key)) {
            if (f.key === 'pb') wins.push(`${r.athlete.name} ${tt.label} ${formatMetric(r.pb, tt.unit)}`);
            if (f.key !== 'down') continue;
            flags.push({
              athlete: r.athlete, area, label: f.label, tone: f.tone,
              detail: `Latest ${formatMetric(r.latest, tt.unit)} vs PB ${formatMetric(r.pb, tt.unit)}`,
            });
          }
        }
      }
    }
  }

  flags.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.athlete.name.localeCompare(b.athlete.name));
  return { flags, wins };
}

export function TrainingFlagsSection({ athletes, reportData, liftLogs = [], performanceTests = [], settings, scopeLabel }) {
  const { flags, wins } = collectTrainingFlags({ athletes, reportData, liftLogs, performanceTests, settings });
  const th = { padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#ef4444', textAlign: 'left' };
  const td = { padding: '10px 14px', fontSize: '13px' };
  return (
    <div className="card-glass" data-testid="training-flags" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Flag size={20} style={{ color: '#ef4444' }} />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            TRAINING FLAGS &middot; {scopeLabel}
          </h3>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)' }}>
          From the RPE, Strength and Jumps &amp; Sprints tabs
        </span>
      </div>

      {flags.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontWeight: 600 }}>No training flags right now.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <th style={th}>ATHLETE</th>
                <th style={th}>AREA</th>
                <th style={th}>FLAG</th>
                <th style={th}>DETAIL</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f, i) => (
                <tr key={`${f.athlete.id}-${f.area}-${i}`} data-testid="training-flag-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ ...td, fontWeight: 700 }}>{f.athlete.name}<div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 600 }}>{f.athlete.sport || 'No sport'}</div></td>
                  <td style={td}>{f.area}</td>
                  <td style={{ ...td, fontWeight: 800, color: TONE_COLOR[f.tone] }}>{f.label}</td>
                  <td style={{ ...td, color: 'var(--color-text-muted)' }}>{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {wins.length > 0 && (
        <div style={{ fontSize: '12px', color: '#10b981', fontWeight: 700, lineHeight: 1.5 }}>
          New PRs / PBs (last 14 days): {wins.slice(0, 12).join(' · ')}{wins.length > 12 ? ` · +${wins.length - 12} more` : ''}
        </div>
      )}
    </div>
  );
}
