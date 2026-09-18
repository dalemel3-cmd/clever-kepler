import React from 'react';
import { APP_VERSION } from '../utils/athleteData';

export function AppSidebar({ screen, setScreen, getDailyAlerts, coachName, coachInitials }) {
  const handleNav = (newScreen) => (e) => {
    e.preventDefault();
    setScreen(newScreen);
  };

  const navItem = (id, icon, label, badge) => {
    const isActive = screen === id;
    if (isActive) {
      return (
        <a aria-current="page" href="#" onClick={handleNav(id)} className="flex items-center justify-between px-space-sm py-space-sm transition-colors bg-primary text-[#030a14] font-bold rounded-lg shadow-sm">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-xl text-[#030a14]">{icon}</span>
            <span className="font-label-lg text-label-lg">{label}</span>
          </div>
          {badge}
        </a>
      );
    }
    return (
      <a href="#" onClick={handleNav(id)} className="flex items-center justify-between px-space-sm py-space-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
        <div className="flex items-center gap-space-sm">
          <span className="material-symbols-outlined text-xl">{icon}</span>
          <span className="font-label-lg text-label-lg">{label}</span>
        </div>
        {badge}
      </a>
    );
  };

  const alerts = getDailyAlerts ? getDailyAlerts() : [];
  const alertsBadge = alerts.length > 0 ? (
    <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-error-container border border-error/30 text-error">{alerts.length}</span>
  ) : null;

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-surface-container-low border-r border-[#2a313d]/60 z-50 flex flex-col justify-between overflow-y-auto">
      <div className="flex flex-col">
        <div className="p-space-lg bg-[#04142f] border-b border-[#2a313d]/50">
          <div className="flex items-center justify-between">
            <span className="font-headline-lg text-headline-lg tracking-wider text-on-surface uppercase">HUMAN PERFORMANCE</span>
            <span className="material-symbols-outlined text-primary text-base">lock</span>
          </div>
          <div className="flex items-center justify-between mt-space-xs">
            <span className="font-label-md text-label-md tracking-widest text-primary uppercase">SHILOH ATHLETICS</span>
            <span className="font-label-sm text-label-sm px-space-xs py-0.5 rounded bg-secondary-container text-secondary border border-secondary/30">LIVE</span>
          </div>
        </div>
        <div className="px-space-md pt-space-md">
          <button onClick={() => setScreen('entry')} className="w-full flex items-center justify-center gap-space-xs py-space-sm px-space-md bg-primary hover:bg-primary-hover text-[#030a14] rounded-xl font-headline-md text-headline-md uppercase tracking-wider transition-colors shadow-md">
            <span className="material-symbols-outlined text-[#030a14] text-lg">bolt</span>
            ACTIVATE KIOSK MODE
          </button>
        </div>
        <div className="px-space-md pt-space-lg flex flex-col gap-space-md">
          <div className="flex flex-col">
            <span className="px-space-sm pb-space-xs font-label-sm text-label-sm text-dim uppercase tracking-widest">DAILY OPERATIONS</span>
            <nav className="flex flex-col gap-1">
              {navItem('dashboard', 'grid_view', 'Dashboard', screen === 'dashboard' ? <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-[#030a14]/25 text-[#030a14] font-bold">Live</span> : null)}
              {navItem('entry', 'touch_app', 'Quick Entry / Kiosk', null)}
              {navItem('alerts', 'notifications', 'Alerts', alertsBadge)}
            </nav>
          </div>
          <div className="flex flex-col">
            <span className="px-space-sm pb-space-xs font-label-sm text-label-sm text-dim uppercase tracking-widest">ROSTER & TEAMS</span>
            <nav className="flex flex-col gap-1">
              {navItem('groups', 'shield', 'Sport Groups', null)}
              {navItem('athletes', 'group', 'Athletes', null)}
              {navItem('lifts', 'fitness_center', 'Lift Tracker', null)}
            </nav>
          </div>
          <div className="flex flex-col">
            <span className="px-space-sm pb-space-xs font-label-sm text-label-sm text-dim uppercase tracking-widest">INSIGHTS</span>
            <nav className="flex flex-col gap-1">
              {navItem('analytics', 'monitoring', 'Analytics & RPE', null)}
              {navItem('reports', 'description', 'Reports', null)}
              {navItem('settings', 'settings', 'Settings', null)}
            </nav>
          </div>
        </div>
      </div>
      <div className="p-space-md bg-[#04142f] border-t border-[#2a313d]/50 mt-space-lg">
        <div className="flex items-center gap-space-sm">
          <div className="w-9 h-9 rounded bg-[#0e182a] border border-[#2a313d] flex items-center justify-center font-headline-md text-headline-md text-primary">{coachInitials || 'HP'}</div>
          <div className="flex flex-col overflow-hidden">
            <span className="font-label-lg text-label-lg text-on-surface truncate">{coachName || 'Coach'}</span>
            <span className="font-body-sm text-body-sm text-dim truncate">Shiloh Athletics Head Coach</span>
          </div>
        </div>
        <div className="mt-space-sm pt-space-xs flex items-center justify-between font-label-sm text-label-sm text-dim">
          <span><span className="text-secondary">●</span> Cloud Live {APP_VERSION}</span>
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </aside>
  );
}
