import { Check, Smartphone, CheckCircle, Download, Sliders, Minus, Plus, Database, Upload, Wifi, Zap, Users, Activity, RefreshCw, Trash2, Shield, Lock, AlertTriangle, RotateCcw } from 'lucide-react';
import { getAppHost } from '../../settings';
import CoachAccessCard from './CoachAccessCard';

export default function SettingsScreen({
  settings,
  updateSetting,
  handleResetSettings,
  settingsSavedToast,
  isAppInstalled,
  handleInstallApp,
  handleSaveSettings,
  dehydrationThreshold,
  setDehydrationThreshold,
  sleepThreshold,
  setSleepThreshold,
  baselineExpiryDays,
  setBaselineExpiryDays,
  handleDownloadTemplate,
  handleCSVUpload,
  exportToCSV,
  broadcastDeviceSync,
  athletes,
  reportData,
  syncStatus,
  handleForceSync,
  handleExportDiagnostics,
  handleClearAppCache,
  setShowRecoveryModal,
  showMergePanel,
  setShowMergePanel,
  mergeSourceId,
  setMergeSourceId,
  mergeTargetId,
  setMergeTargetId,
  setConfirmModal,
  handleMergeAthletes,
  handleDeleteAllWeighIns,
  showToast,
  cloudStatus,
  authEmail,
  handleSignOut
}) {
  return (
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
            <Check size={16} /> SETTINGS SAVED!
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
                Installs {settings.programName} as a standalone native application (not a bookmark) with its own home screen icon, fullscreen view, and offline fail-safe cache.
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
              <Download size={18} /> INSTALL APP NOW
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
              <li>Open Safari and load <strong style={{ color: 'var(--color-accent)' }}>{getAppHost()}</strong></li>
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
              <li>Open Chrome and load <strong style={{ color: 'var(--color-accent)' }}>{getAppHost()}</strong></li>
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
              <li>Click <strong>"Install {settings.programName} App"</strong> to launch as a standalone desktop window</li>
              <li>Access it anytime from your desktop or dock!</li>
            </ol>
          </div>

        </div>
      </div>

      {/* Card 1b: Signed-in account */}
      <div className="card-glass" style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-success)' }}>
            <Lock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Signed in as</div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--white)' }}>{authEmail || 'This device'}</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Kiosk devices stay signed in. Sign out only if this device is leaving the program.
            </div>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{ padding: '10px 20px', fontSize: '13px', fontWeight: 700, background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.4)', color: 'var(--status-error)', borderRadius: '10px', cursor: 'pointer' }}
        >
          Sign Out
        </button>
      </div>

      <CoachAccessCard showToast={showToast} setConfirmModal={setConfirmModal} currentEmail={authEmail} />

      {/* Card 2: Program Identity, Thresholds & Windows - every tunable in one place.
          Nothing in the app is a magic number anymore; each field below is read live
          by the dashboards, alerts, reports, and kiosk entry screens. */}
      <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navy-500)' }}>
              <Sliders size={22} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0 }}>
                PROGRAM CONFIGURATION
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Every threshold, window, and label the app uses. Changes apply live across all screens once saved.
              </div>
            </div>
          </div>
          <button
            onClick={handleResetSettings}
            style={{ padding: '10px 18px', fontSize: '12px', fontWeight: 700, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RotateCcw size={15} /> RESTORE DEFAULTS
          </button>
        </div>

        {(() => {
          const GROUPS = [
            {
              title: 'PROGRAM IDENTITY',
              hint: 'Shown in the sidebar, mobile menu, and printed report headers.',
              fields: [
                { key: 'organizationName', label: 'Organization Name', type: 'text' },
                { key: 'programName', label: 'Program Name', type: 'text' },
                { key: 'coachName', label: 'Coach / Owner Name', type: 'text' },
                { key: 'programTimezone', label: 'Program Timezone (IANA)', type: 'text', help: 'Anchors "today" so every device agrees on the calendar day.' },
                { key: 'seasonStartDate', label: 'Season Start Date', type: 'date', help: 'Baseline reference when an athlete has no explicit marker.' },
              ]
            },
            {
              title: 'HYDRATION & MASS LOSS',
              hint: 'Drives dehydration alerts, the dashboard attention list, and sweat-loss cards.',
              fields: [
                { key: 'dehydrationThreshold', label: 'Dehydration Risk Threshold', unit: '%', step: 0.1, min: 0.1, max: 20 },
                { key: 'acuteDropLbs', label: 'Significant Acute Drop', unit: 'lbs', step: 0.5, min: 0.1, max: 100 },
                { key: 'calorieAdviceLbs', label: 'Escalate to Calories + Fluids At', unit: 'lbs', step: 0.5, min: 0.1, max: 100 },
                { key: 'severeSweatLbs', label: 'Severe Sweat Loss', unit: 'lbs', step: 0.5, min: 0.1, max: 100 },
                { key: 'severeSweatPct', label: 'Severe Sweat Loss', unit: '%', step: 0.1, min: 0.1, max: 50 },
                { key: 'fluidOzPerLb', label: 'Fluid Replacement', unit: 'oz/lb', step: 1, min: 1, max: 200 },
                { key: 'minFluidOz', label: 'Minimum Fluid Advice', unit: 'oz', step: 1, min: 0, max: 500 },
              ]
            },
            {
              title: 'SLEEP & RECOVERY',
              hint: 'Deficit flags, the recovery index, and the sleep chart target line.',
              fields: [
                { key: 'sleepThreshold', label: 'Sleep Deficit Below', unit: 'hrs', step: 0.5, min: 0, max: 24 },
                { key: 'sleepRecoveryHours', label: 'Counts as Recovered At', unit: 'hrs', step: 0.5, min: 0, max: 24 },
                { key: 'sleepTargetHours', label: 'Optimal Rest At', unit: 'hrs', step: 0.5, min: 0, max: 24 },
                { key: 'sleepChartTargetHours', label: 'Sleep Chart Target Line', unit: 'hrs', step: 0.5, min: 0, max: 24 },
              ]
            },
            {
              title: 'BASELINES & DATA WINDOWS',
              hint: 'How far back the app looks and how long a baseline stays valid.',
              fields: [
                { key: 'baselineExpiryDays', label: 'Baseline Expires After', unit: 'days', step: 1, min: 1, max: 365 },
                { key: 'dataWindowDays', label: 'Dashboard Data Window', unit: 'days', step: 1, min: 1, max: 3650 },
                { key: 'profileHistoryLimit', label: 'Profile History Limit', unit: 'logs', step: 10, min: 10, max: 10000 },
                { key: 'postPracticeLookbackDays', label: 'Sweat Card Lookback (Reports)', unit: 'days', step: 1, min: 1, max: 365 },
                { key: 'alertsAcuteWindowHours', label: 'Sweat Card Window (Alerts)', unit: 'hrs', step: 1, min: 1, max: 168 },
              ]
            },
            {
              title: 'ENTRY VALIDATION',
              hint: 'Bounds the kiosk and manual entry accept before saving a record.',
              fields: [
                { key: 'minWeightLbs', label: 'Minimum Weight', unit: 'lbs', step: 1, min: 0, max: 1000 },
                { key: 'maxWeightLbs', label: 'Maximum Weight', unit: 'lbs', step: 10, min: 1, max: 5000 },
                { key: 'maxSleepHours', label: 'Maximum Sleep', unit: 'hrs', step: 1, min: 1, max: 24 },
              ]
            },
          ];

          return GROUPS.map(group => (
            <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.08em' }}>{group.title}</span>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{group.hint}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                {group.fields.map(f => (
                  <div key={f.key} className="card-glass" style={{ padding: '14px', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '8px', borderRadius: '10px' }}>
                    <label htmlFor={`setting-${f.key}`} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {f.label}{f.unit ? ` (${f.unit})` : ''}
                    </label>
                    {f.type === 'text' || f.type === 'date' ? (
                      <input
                        id={`setting-${f.key}`}
                        type={f.type === 'date' ? 'date' : 'text'}
                        className="input-glass"
                        value={settings[f.key] ?? ''}
                        onChange={e => updateSetting(f.key, e.target.value)}
                        style={{ height: '42px', padding: '0 12px', fontSize: '14px', fontWeight: 600, borderRadius: '8px' }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          aria-label={`Decrease ${f.label}`}
                          onClick={() => updateSetting(f.key, prev => Math.max(f.min, Number((Number(prev) - f.step).toFixed(2))))}
                          style={{ width: '40px', height: '42px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          id={`setting-${f.key}`}
                          type="number"
                          step={f.step}
                          min={f.min}
                          max={f.max}
                          value={settings[f.key]}
                          onChange={e => updateSetting(f.key, e.target.value === '' ? '' : Number(e.target.value))}
                          onBlur={e => {
                            const v = Number(e.target.value);
                            updateSetting(f.key, !isFinite(v) ? f.min : Math.min(Math.max(v, f.min), f.max));
                          }}
                          style={{ flex: 1, minWidth: 0, height: '42px', background: 'var(--navy-900)', border: '1px solid var(--color-accent)', borderRadius: '8px', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--color-accent)', outline: 'none' }}
                        />
                        <button
                          type="button"
                          aria-label={`Increase ${f.label}`}
                          onClick={() => updateSetting(f.key, prev => Math.min(f.max, Number((Number(prev) + f.step).toFixed(2))))}
                          style={{ width: '40px', height: '42px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    )}
                    {f.help && <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{f.help}</span>}
                  </div>
                ))}
              </div>
            </div>
          ));
        })()}

        {/* Sports offered in pickers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-accent)', letterSpacing: '0.08em' }}>SPORTS OFFERED</span>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Suggestions shown in sport pickers, comma separated. Sports already on the roster are always included automatically.
            </div>
          </div>
          <textarea
            aria-label="Sports offered, comma separated"
            className="input-glass"
            rows={2}
            value={(settings.sportsList || []).join(', ')}
            onChange={e => updateSetting('sportsList', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 600, borderRadius: '8px', resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>

        <button
          onClick={handleSaveSettings}
          className="btn-primary"
          style={{ width: 'fit-content', padding: '12px 28px', fontSize: '14px', marginTop: '8px' }}
        >
          <CheckCircle size={18} /> SAVE ALL SETTINGS
        </button>
      </div>

      {/* Card 3: Cloud Data Management & Synchronization Hub */}
      <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(59, 130, 246, 0.35)', background: 'rgba(59, 130, 246, 0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid rgba(59, 130, 246, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', boxShadow: '0 0 15px rgba(59, 130, 246, 0.25)' }}>
            <Database size={24} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: '#fff' }}>
              CLOUD DATA MANAGEMENT &amp; SYNCHRONIZATION HUB
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Import rosters via CSV, download bulk templates, export full weigh-in reports, or verify real-time inter-device communication.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '4px' }}>

          {/* Roster Import & Template */}
          <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Upload size={16} /> Roster CSV Import &amp; Template
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Bulk upload new athletes or download the standard formatted roster template file.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: 'auto' }}>
              <button
                onClick={handleDownloadTemplate}
                className="btn-primary no-print"
                style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: 'var(--white)', border: '1px solid var(--color-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
              >
                <Download size={15} /> Template
              </button>
              <label
                className="btn-primary no-print glow-card"
                style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 800, background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa', border: '1px solid #60a5fa', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
              >
                <Upload size={15} /> Upload CSV
                <input
                  type="file"
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleCSVUpload}
                />
              </label>
            </div>
          </div>

          {/* Report Export & Live Signal Test */}
          <div className="card-glass" style={{ padding: '18px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wifi size={16} /> Data Export &amp; Network Test
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Export all recorded session logs to spreadsheet format or send a live test ping across devices.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: 'auto' }}>
              <button
                onClick={exportToCSV}
                className="btn-primary no-print"
                title="Full unfiltered dump of every weigh-in record ever logged. For a filtered/scoped export, use Export CSV on the Reports screen instead."
                style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 700, background: 'rgba(255,255,255,0.05)', color: 'var(--white)', border: '1px solid var(--color-border)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
              >
                <Download size={15} /> Export All Records (CSV)
              </button>
              <button
                onClick={() => {
                  broadcastDeviceSync({ isPing: true });
                  showToast('📡 Test ping sent to all connected devices.\nOpen devices log the signal in their console.', 'info');
                }}
                className="no-print glow-card"
                style={{ flex: 1, height: '40px', padding: '0 14px', fontSize: '12px', fontWeight: 800, background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer' }}
                title="Verify real-time communication between your devices"
              >
                📶 Ping Devices
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Card 4: Practical Troubleshooting & Health Tools */}
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
          {(() => {
            // Wired to the real connection state - this used to be a hardcoded green light.
            const statusColor = cloudStatus === 'live' ? 'var(--status-success)' : cloudStatus === 'offline' ? 'var(--status-error)' : '#fbbf24';
            const statusLabel = cloudStatus === 'live' ? 'SUPABASE ONLINE' : cloudStatus === 'offline' ? 'DEVICE OFFLINE' : 'RECONNECTING...';
            return (
              <div className="card-glass" style={{ flex: '1 1 180px', padding: '16px', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: statusColor, boxShadow: cloudStatus === 'live' ? `0 0 8px ${statusColor}` : 'none' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 700 }}>CLOUD CONNECTION</span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                </div>
              </div>
            );
          })()}

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

      {/* Card 4: Hardware Vault & Emergency Data Recovery Station */}
      <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(184, 156, 91, 0.35)', background: 'rgba(184, 156, 91, 0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(184, 156, 91, 0.2)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', boxShadow: '0 0 12px rgba(184, 156, 91, 0.3)' }}>
            <Shield size={24} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: 'var(--color-accent)' }}>
              HARDWARE VAULT &amp; EMERGENCY RECOVERY SUITE
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              Access encrypted local iPad storage, force cloud synchronization of offline logs, or restore data from diagnostic backup files.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.25)', padding: '16px 20px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--white)', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={14} style={{ color: 'var(--color-accent)' }} /> 1,000-LOG PERMANENT DEVICE HARDWARE VAULT ACTIVE
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              All kiosk sessions on this device are automatically duplicated to an immutable hardware ledger regardless of internet connection state.
            </span>
          </div>

          <button
            onClick={() => setShowRecoveryModal(true)}
            className="btn-primary glow-card"
            style={{ padding: '12px 24px', fontSize: '13px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 15px rgba(184, 156, 91, 0.3)', display: 'flex', alignItems: 'center', gap: '8px', height: '44px', whiteSpace: 'nowrap' }}
          >
            <Database size={16} /> OPEN RECOVERY STATION &amp; AUDIT VAULT
          </button>
        </div>
      </div>

      {/* Card 5: Athlete Record Merge Studio */}
      <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc', boxShadow: '0 0 15px rgba(139, 92, 246, 0.3)' }}>
              <Users size={22} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: '#c084fc' }}>
                ATHLETE RECORD MERGE STUDIO
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Resolve duplicated athlete accounts by consolidating all weigh-ins, hydration alerts, and sleep logs into a single master profile.
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowMergePanel(!showMergePanel)}
            className="btn-secondary"
            style={{ padding: '10px 20px', fontSize: '13px', border: '1px solid rgba(139, 92, 246, 0.5)', background: showMergePanel ? 'rgba(139, 92, 246, 0.2)' : 'transparent', color: '#fff', fontWeight: 700, borderRadius: '10px', cursor: 'pointer' }}
          >
            {showMergePanel ? '✕ Close Studio' : '⚡ Open Merge Studio'}
          </button>
        </div>

        {showMergePanel && (
          <div style={{ padding: '20px', background: 'rgba(0,0,0,0.3)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  1. Select Source (Duplicate To Delete):
                </label>
                <select
                  value={mergeSourceId}
                  onChange={e => setMergeSourceId(e.target.value)}
                  style={{ padding: '12px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', fontSize: '14px', fontWeight: 700 }}
                >
                  <option value="">-- Choose Duplicate Profile --</option>
                  {athletes.map(a => (
                    <option key={`src-${a.id}`} value={a.id}>{a.name} ({a.sport || 'No Sport'})</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>This profile's logs will be moved away and the profile will be deleted.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--status-success)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  2. Select Target (Master Profile To Keep):
                </label>
                <select
                  value={mergeTargetId}
                  onChange={e => setMergeTargetId(e.target.value)}
                  style={{ padding: '12px', background: 'var(--navy-900)', color: '#fff', border: '1px solid rgba(52, 211, 153, 0.4)', borderRadius: '10px', fontSize: '14px', fontWeight: 700 }}
                >
                  <option value="">-- Choose Master Profile --</option>
                  {athletes.filter(a => a.id !== mergeSourceId).map(a => (
                    <option key={`tgt-${a.id}`} value={a.id}>{a.name} ({a.sport || 'No Sport'})</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>This profile will receive all historical weigh-in sessions and remain active.</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
              <button
                onClick={() => {
                  if (!mergeSourceId || !mergeTargetId) {
                    showToast('Select both a duplicate profile and a master profile first.', 'error');
                    return;
                  }
                  const sourceObj = athletes.find(a => a.id === mergeSourceId);
                  const targetObj = athletes.find(a => a.id === mergeTargetId);
                  setConfirmModal({
                    isOpen: true,
                    title: 'Confirm Athlete Record Merge',
                    message: `Are you sure you want to merge all records from "${sourceObj?.name}" into "${targetObj?.name}"? The duplicate profile "${sourceObj?.name}" will be permanently deleted after transferring its logs.`,
                    isDanger: true,
                    actionText: 'Execute Merge',
                    onConfirm: () => handleMergeAthletes(mergeSourceId, mergeTargetId)
                  });
                }}
                disabled={!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId}
                className="btn-primary"
                style={{ padding: '12px 28px', fontSize: '14px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', border: 'none', fontWeight: 800, cursor: (!mergeSourceId || !mergeTargetId) ? 'not-allowed' : 'pointer', borderRadius: '10px' }}
              >
                🔗 MERGE RECORDS &amp; PURGE DUPLICATE
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Card 6: Danger Zone & Database Reset Vault */}
      <div className="card-glass glow-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--status-error)' }}>
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', margin: 0, color: 'var(--status-error)' }}>
                DANGER ZONE &amp; DATABASE RESET VAULT
              </h2>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Perform irreversible administrative cleanup operations across the active cloud database.
              </div>
            </div>
          </div>
          <button
            onClick={() => setConfirmModal({
              isOpen: true,
              title: 'Clear All Historical Data',
              message: 'WARNING: You are about to permanently purge ALL weigh-in logs, hydration records, and recovery sessions from the database across all devices. This action cannot be undone.',
              isDanger: true,
              actionText: 'Wipe Database',
              requireText: 'WIPE',
              onConfirm: () => handleDeleteAllWeighIns(true)
            })}
            className="no-print"
            style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-error)', border: '1px solid var(--status-error)', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 0 15px rgba(239, 68, 68, 0.2)' }}
          >
            <Trash2 size={18} /> Clear All Historical Data
          </button>
        </div>
      </div>

    </div>
  );
}
