// Single source of truth for the app's top-level tabs (v5.3.0 cleanup). Nine
// separate sidebar items were merged into five groups; each group's screens are
// the existing screens, unchanged, reached through a small switcher at the top.
// The sidebar, the switcher and the mobile bottom nav all read from this, so the
// names can't drift apart again.
export const NAV_GROUPS = [
  { id: 'today', label: 'Today', icon: 'grid_view', screens: [
    { screen: 'dashboard', label: 'Overview' },
    { screen: 'alerts', label: 'Alerts' },
  ] },
  { id: 'log', label: 'Log', icon: 'touch_app', screens: [
    { screen: 'entry', label: 'Weigh-In & RPE' },
    { screen: 'lifts', label: 'Lifts', requires: 'enableLiftTracker' },
  ] },
  { id: 'teams', label: 'Teams', icon: 'group', screens: [
    { screen: 'groups', label: 'By Sport' },
    { screen: 'athletes', label: 'Athletes' },
  ] },
  { id: 'performance', label: 'Performance', icon: 'monitoring', screens: [
    { screen: 'analytics', label: 'Analytics' },
    { screen: 'reports', label: 'Print Report' },
  ] },
  { id: 'settings', label: 'Settings', icon: 'settings', screens: [
    { screen: 'settings', label: 'Settings' },
  ] },
];

// Screens reachable in a group, honoring feature flags (e.g. the Lift Tracker toggle).
export const groupScreens = (group, settings = {}) =>
  group.screens.filter(s => !s.requires || settings[s.requires]);

// The group a screen belongs to. Profiles is a drill-down opened from Teams.
export const groupForScreen = (screen) =>
  NAV_GROUPS.find(g => g.screens.some(s => s.screen === screen))
  || (screen === 'profiles' ? NAV_GROUPS.find(g => g.id === 'teams') : null);
