import { AlertTriangle } from 'lucide-react';

// App-wide confirm dialog driven by App's confirmModal state. Split out of App.jsx.
export function ConfirmDialog({
  confirmModal,
  confirmTypedText,
  setConfirmModal,
  setConfirmTypedText,
}) {
  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(5, 11, 20, 0.95)' }}>
      <div className="card-glass glow-card" style={{ maxWidth: '440px', width: '100%', padding: '28px', borderRadius: '20px', border: confirmModal.isDanger ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid var(--color-accent)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: confirmModal.isDanger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(184, 156, 91, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: confirmModal.isDanger ? 'var(--status-error)' : 'var(--color-accent)' }}>
            <AlertTriangle size={24} />
          </div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--white)', fontFamily: 'var(--font-display)' }}>{confirmModal.title || 'Confirm Action'}</h3>
        </div>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: '1.6' }}>{confirmModal.message}</p>
        {confirmModal.requireText && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--status-error)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Type "{confirmModal.requireText}" to confirm this cannot be undone:
            </span>
            <input
              type="text"
              autoFocus
              className="input-glass"
              placeholder={confirmModal.requireText}
              value={confirmTypedText}
              onChange={e => setConfirmTypedText(e.target.value)}
              style={{ height: '46px', padding: '0 16px', fontSize: '16px', fontWeight: 800, letterSpacing: '0.1em', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.5)', textTransform: 'uppercase' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button
            onClick={() => { setConfirmTypedText(''); setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: true, actionText: 'Confirm' }); }}
            style={{ padding: '12px 24px', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--white)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            Cancel
          </button>
          <button
            disabled={!!confirmModal.requireText && confirmTypedText.trim().toUpperCase() !== confirmModal.requireText.toUpperCase()}
            onClick={() => {
              if (confirmModal.requireText && confirmTypedText.trim().toUpperCase() !== confirmModal.requireText.toUpperCase()) return;
              if (confirmModal.onConfirm) confirmModal.onConfirm();
              setConfirmTypedText('');
              setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null, isDanger: true, actionText: 'Confirm' });
            }}
            style={{ padding: '12px 24px', borderRadius: '10px', background: confirmModal.isDanger ? 'var(--status-error)' : 'var(--color-accent)', color: confirmModal.isDanger ? '#fff' : 'var(--navy-950)', border: 'none', fontSize: '14px', fontWeight: 800, cursor: 'pointer', boxShadow: confirmModal.isDanger ? '0 0 15px rgba(239, 68, 68, 0.3)' : '0 0 15px rgba(184, 156, 91, 0.3)', transition: 'all 0.2s', opacity: (!!confirmModal.requireText && confirmTypedText.trim().toUpperCase() !== confirmModal.requireText.toUpperCase()) ? 0.4 : 1 }}
          >
            {confirmModal.actionText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
