import React from 'react';

export function AppHeader({ 
  isKioskMode, 
  setIsKioskMode,
  setScreen,
  isOnline,
  isRefreshing,
  unsyncedQueueCount,
  syncOfflineCache,
  handleManualCloudRefresh
}) {
  return (
    <header className={`fixed top-0 ${isKioskMode ? 'left-0' : 'left-64'} right-0 h-16 bg-[#030a14]/85 backdrop-blur-xl border-b border-[#2a313d]/60 z-40 flex items-center justify-between px-space-lg`}>
      {isKioskMode ? (
        <div className="flex flex-1 items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-space-md">
            <span className="font-headline-md text-headline-md text-primary tracking-wider uppercase">HPD · KIOSK MODE</span>
            <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-secondary-container border border-secondary/30 font-label-sm text-label-sm text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span>ACTIVE</span>
            </div>
          </div>
          
          <div className="flex items-center gap-space-md">
            {unsyncedQueueCount > 0 ? (
              <button onClick={() => syncOfflineCache(true)} className="flex items-center gap-2 px-space-sm py-1 rounded-full bg-error-container text-error border border-error/40 font-label-md text-label-md hover:bg-error/20 transition-colors">
                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                <span>{unsyncedQueueCount} UNSYNCED LOGS</span>
              </button>
            ) : (
              <button onClick={handleManualCloudRefresh} className={`flex items-center gap-2 px-space-sm py-1 rounded-full ${isOnline ? 'bg-secondary-container text-secondary border border-secondary/40' : 'bg-error-container text-error border border-error/40'} font-label-md text-label-md`}>
                <span className="material-symbols-outlined text-sm">{isOnline ? 'cloud_done' : 'cloud_off'}</span>
                <span>{isRefreshing ? 'REFRESHING...' : (isOnline ? 'CLOUD SYNCED' : 'OFFLINE QUEUE')}</span>
              </button>
            )}
            <button 
              onClick={() => setIsKioskMode(false)}
              className="flex items-center gap-1 px-space-sm py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest border border-[#2a313d] text-on-surface font-label-lg text-label-lg transition-colors"
            >
              <span className="material-symbols-outlined text-base">lock_open</span>
              <span>EXIT KIOSK</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-space-md">
            <div className="flex items-center gap-space-xs font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
              <span>Shiloh Athletics</span>
              <span className="material-symbols-outlined text-sm text-dim">chevron_right</span>
              <span className="text-on-surface font-bold">Operations</span>
            </div>
            <div className="flex items-center gap-1.5 px-space-sm py-0.5 rounded-full bg-secondary-container border border-secondary/30 font-label-sm text-label-sm text-secondary">
              <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
              <span>SYSTEM READY</span>
            </div>
          </div>
          
          <div className="flex items-center gap-space-md">
            <div className="hidden lg:flex items-center bg-surface-container-high border border-[#2a313d] rounded px-space-sm py-1.5 text-on-surface-variant font-label-md text-label-md gap-space-sm">
              <span className="material-symbols-outlined text-base text-dim">search</span>
              <span>Athlete search...</span>
              <kbd className="bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface font-label-sm text-label-sm border border-[#2a313d]">Ctrl+K</kbd>
            </div>
            
            <div className="flex items-center gap-space-xs">
              <button onClick={() => setScreen('entry')} className="flex items-center gap-1 px-space-sm py-1.5 rounded bg-primary text-[#030a14] hover:bg-primary-hover font-headline-md text-headline-md uppercase transition-all shadow-sm">
                <span className="material-symbols-outlined text-base">add</span>
                <span>Log Set</span>
              </button>
              <button onClick={() => { setIsKioskMode(true); setScreen('entry'); }} className="hidden md:flex items-center gap-1 px-space-sm py-1.5 rounded bg-surface-container-high hover:bg-surface-container-highest border border-[#2a313d] text-primary font-headline-md text-headline-md uppercase transition-colors">
                <span className="material-symbols-outlined text-base">sensors</span>
                <span>Kiosk Mode</span>
              </button>
            </div>
            
            <div className="w-8 h-8 rounded-full bg-primary text-[#030a14] flex items-center justify-center font-bold text-xs border border-[#2a313d]">
              CM
            </div>
          </div>
        </>
      )}
    </header>
  );
}
