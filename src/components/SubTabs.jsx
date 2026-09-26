import React from 'react';
import { groupForScreen, groupScreens } from '../navigation';

// Switcher between the screens of one merged tab (see navigation.js). Styled like
// the sport filter pills on the Weigh-In screen so it reads as part of the existing
// UI rather than a new pattern. Renders nothing for single-screen groups.
export function SubTabs({ screen, setScreen, settings }) {
  const group = groupForScreen(screen);
  if (!group) return null;
  const screens = groupScreens(group, settings);
  if (screens.length < 2) return null;
  const active = screen === 'profiles' ? 'athletes' : screen;
  return (
    <div role="tablist" aria-label={group.label} className="flex items-center gap-1.5 flex-wrap pt-space-md">
      {screens.map(s => (
        <button
          key={s.screen}
          role="tab"
          aria-selected={active === s.screen}
          onClick={() => setScreen(s.screen)}
          className={`px-4 py-1.5 rounded-lg font-headline-md text-sm uppercase tracking-wide whitespace-nowrap ${active === s.screen ? 'bg-[#b89c5b] text-[#030a14] font-bold shadow-sm' : 'bg-[#061c41] hover:bg-[#030a14] border border-[#2a313d] text-[#bcc1ca]'}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
