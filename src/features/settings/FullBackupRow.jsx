// Settings > Offline data recovery > Full backup (v5.16.1). One tap copies every athlete,
// check-in, lift, test and program into a file to keep outside the app (school Drive, a
// laptop). On an iPad or iPhone the file is saved through the share sheet with a second
// tap, and only counts as saved when the share sheet says so. Styled like the row above it.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { APP_VERSION } from '../../utils/athleteData';
import { backupFile, buildFullBackup, daysSinceBackup, needsShareSheet, saveBackupFile } from '../../utils/fullBackup';

const ageText = (d) => (d == null ? 'never' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);

export default function FullBackupRow({ showToast }) {
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(() => daysSinceBackup());
  const [ready, setReady] = useState(null); // { file, total }: prepared, waiting for the save tap (iPad)
  const due = days == null || days >= 30;

  const finish = async (file, total) => {
    const res = await saveBackupFile(file);
    if (!res.saved) {
      showToast(res.cancelled ? 'Not saved yet. Tap Save backup file and choose where to keep it.' : "Couldn't save the file. Tap Save backup file to try again.", 'info');
      return;
    }
    setReady(null);
    setDays(daysSinceBackup());
    showToast(res.via === 'share'
      ? `Backup saved: ${total.toLocaleString()} records.`
      : `Backup file created: ${total.toLocaleString()} records. It is in this device's downloads; move it somewhere safe.`);
  };

  const prepare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { backup, error } = await buildFullBackup({ appVersion: APP_VERSION });
      if (error) { showToast(error, 'error'); return; }
      const file = backupFile(backup);
      const total = Object.values(backup.counts).reduce((s, n) => s + n, 0);
      if (needsShareSheet()) setReady({ file, total }); // the share sheet needs its own tap
      else await finish(file, total);
    } catch {
      showToast("Couldn't finish the backup. Nothing was saved; try again.", 'error');
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="full-backup" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.25)', padding: '16px 20px', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 260px' }}>
        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--white)', letterSpacing: '0.04em' }}>
          FULL BACKUP OF ALL RECORDS
        </span>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          Copies every athlete, check-in, lift, test and program into one file. Keep it outside the app, such as the school Drive. Once a month is enough. It is a safety copy: the import above does not read it.
        </span>
        <span data-testid="full-backup-age" style={{ fontSize: '12px', fontWeight: 700, color: ready || due ? '#fbbf24' : 'var(--color-text-muted)' }}>
          {ready ? `Backup ready: ${ready.total.toLocaleString()} records. Tap Save backup file, then Save to Files.` : `Last saved from this device: ${ageText(days)}`}
        </span>
      </div>
      <button
        type="button"
        onClick={ready ? () => finish(ready.file, ready.total) : prepare}
        disabled={busy}
        className="btn-primary glow-card"
        style={{ padding: '12px 24px', fontSize: '13px', background: 'rgba(184, 156, 91, 0.2)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px', height: '44px', whiteSpace: 'nowrap' }}
      >
        <Download size={16} /> {busy ? 'PREPARING…' : ready ? 'SAVE BACKUP FILE' : 'DOWNLOAD FULL BACKUP'}
      </button>
    </div>
  );
}
