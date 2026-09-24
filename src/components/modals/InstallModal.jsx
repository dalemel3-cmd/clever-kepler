import { Check, Copy, Download, Share2, Smartphone, X } from 'lucide-react';

// PWA install instructions (Android/desktop prompt + iOS Safari steps). Split out of App.jsx.
export function InstallModal({
  copiedLinkToast,
  handleCopyLink,
  handleInstallApp,
  handleShareApp,
  setShowInstallModal,
  settings,
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(3, 10, 20, 0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="card-glass glow-card animate-slide-up" style={{ width: '100%', maxWidth: '520px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px', border: '1px solid var(--color-accent)', boxShadow: '0 8px 32px rgba(184, 156, 91, 0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(184, 156, 91, 0.2)', border: '1px solid var(--color-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
              <Smartphone size={26} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', margin: 0, color: 'var(--white)' }}>INSTALL APP</h2>
              <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 700 }}>1-TAP STANDALONE NATIVE APP</span>
            </div>
          </div>
          <button 
            onClick={() => setShowInstallModal(false)}
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
          Tap below to install {settings.programName} directly onto your device:
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Actionable Box 1: Android & Laptop / Desktop */}
          <div className="card-glass glow-card" style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🤖 / 💻</span> Android & Desktop (Chrome / Edge)
            </div>

            <button 
              onClick={handleInstallApp}
              className="btn-primary"
              style={{ width: '100%', height: '44px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Download size={18} /> LAUNCH NATIVE INSTALL PROMPT
            </button>

            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              Triggers browser system 1-click install dialog directly.
            </div>
          </div>

          {/* Actionable Box 2: iPhone & iPad (Safari) */}
          <div className="card-glass glow-card" style={{ padding: '18px', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid rgba(184, 156, 91, 0.3)' }}>
            <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--white)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🍎</span> iPhone & iPad (Safari)
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={handleShareApp}
                className="btn-primary"
                style={{ flex: 1, height: '44px', fontSize: '12px', background: 'var(--navy-800)', border: '1px solid var(--color-accent)', color: 'var(--white)' }}
              >
                <Share2 size={16} /> OPEN SAFARI SHARE MENU
              </button>
              <button 
                onClick={handleCopyLink}
                style={{ height: '44px', padding: '0 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--color-border)', borderRadius: '8px', color: 'var(--white)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {copiedLinkToast ? <Check size={16} style={{ color: 'var(--status-success)' }} /> : <Copy size={16} />}
                {copiedLinkToast ? 'COPIED!' : 'COPY LINK'}
              </button>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
              In Safari Share sheet, select <strong>"Add to Home Screen"</strong> to place app icon.
            </div>
          </div>

        </div>

        <button 
          onClick={() => setShowInstallModal(false)}
          className="btn-primary"
          style={{ width: '100%', height: '48px', fontSize: '14px', marginTop: '4px' }}
        >
          DONE / CLOSE
        </button>
      </div>
    </div>
  );
}
