import { Download, RefreshCw, Upload } from 'lucide-react';

// Local-data recovery modal: lists weigh-ins stranded in this device's storage and
// lets a coach force-upload them, download them as JSON, or import a diagnostics file.
// Split out of App.jsx; all state still lives in App and is passed in.
export function RecoveryModal({
  downloadRecoveredJSON,
  forceUploadRecoveredData,
  getRecoveredLocalData,
  handleImportDiagnosticsFile,
  recoverySyncing,
  setShowRecoveryModal,
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="card-glass glow-card" style={{ width: '100%', maxWidth: '950px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'rgba(13, 27, 46, 0.98)', border: '2px solid #ef4444', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 0 50px rgba(239, 68, 68, 0.35)' }}>
        <div style={{ padding: '24px 28px', background: 'rgba(239, 68, 68, 0.12)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '32px' }}>🚨</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                EMERGENCY DATA RECOVERY & STORAGE AUDIT STATION
              </h2>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                Scanning iPad local databases, offline queues, and memory caches for weigh-in logs...
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRecoveryModal(false)}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
          >
            ✕ Close Window
          </button>
        </div>

        <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', padding: '16px 20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TOTAL RECOVERABLE LOGS FOUND ON IPAD</div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>{getRecoveredLocalData().length} Records Identified</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <label
                className="btn-primary glow-card"
                style={{ background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa', border: '1px solid #60a5fa', fontWeight: 800, padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <Upload size={18} /> 📂 IMPORT DIAGNOSTICS OR BACKUP FILE (.JSON / .CSV)
                <input
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={handleImportDiagnosticsFile}
                  style={{ display: 'none' }}
                />
              </label>
              <button
                type="button"
                onClick={downloadRecoveredJSON}
                className="btn-primary"
                style={{ background: 'var(--color-accent)', color: 'var(--navy-950)', fontWeight: 800, padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <Download size={18} /> 📥 DOWNLOAD RECOVERED DATA (JSON)
              </button>
              <button
                type="button"
                onClick={forceUploadRecoveredData}
                disabled={recoverySyncing}
                className="btn-primary glow-card"
                style={{ background: '#10b981', color: '#000', fontWeight: 800, padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              >
                <RefreshCw size={18} style={{ animation: recoverySyncing ? 'spin 1s linear infinite' : 'none' }} />
                {recoverySyncing ? '⚡ FORCE UPLOADING TO CLOUD...' : '⚡ FORCE UPLOAD TO CLOUD SERVER'}
              </button>
            </div>
          </div>

          <div style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Recovered Log Directory ({getRecoveredLocalData().filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length} recorded today):
          </div>

          <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Athlete Name</th>
                  <th style={{ padding: '12px 16px' }}>Weight / Sleep</th>
                  <th style={{ padding: '12px 16px' }}>Date & Time</th>
                  <th style={{ padding: '12px 16px' }}>Storage Source</th>
                </tr>
              </thead>
              <tbody>
                {getRecoveredLocalData().map((rec, idx) => {
                  const isToday = new Date(rec.created_at).toDateString() === new Date().toDateString();
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isToday ? 'rgba(16, 185, 129, 0.08)' : 'transparent' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#fff' }}>
                        {rec.athlete_name || 'ID: ' + rec.athlete_id}
                        {isToday && <span style={{ marginLeft: '8px', fontSize: '10px', background: '#10b981', color: '#000', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>🔥 TODAY</span>}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--color-accent)' }}>
                        {rec.weight_lbs ? `${rec.weight_lbs} lbs` : '—'} &middot; {rec.sleep_hrs !== undefined ? `${rec.sleep_hrs} hrs` : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.8)' }}>
                        {rec.created_at ? new Date(rec.created_at).toLocaleString() : 'N/A'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px', color: '#ccc', fontFamily: 'monospace' }}>
                          {rec.source_key}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {getRecoveredLocalData().length === 0 && (
                  <tr>
                    <td colSpan="4" style={{ padding: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                      No cached or offline weigh-in records found in the current browser domain storage.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ padding: '16px 28px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
          💡 PRO TIP: If you do not see today's logs above, verify that you did not switch between Safari Browser Tabs and a standalone Home Screen Icon App (PWAs on iPad have separate isolated storage from regular Safari tabs).
        </div>
      </div>
    </div>
  );
}
