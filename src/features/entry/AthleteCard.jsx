import React from 'react';

// One roster tile on the Quick Entry grid.
// Memoized to prevent heavy re-renders.
function AthleteCard({
  athleteId,
  name,
  sport,
  displayName,
  initials,
  isSelected,
  isDoneToday,
  onSelect,
  position = '',
  grade = ''
}) {
  if (isDoneToday) {
    return (
      <div 
        data-testid="athlete-card"
        className="group relative bg-[#061c41] hover:bg-[#061c41]/90 transition-all duration-150 p-4 rounded-xl flex flex-col justify-between h-44 shadow-md cursor-pointer border border-[#2a313d] border-l-4 border-l-[#34d399] overflow-hidden" 
        onClick={() => onSelect(athleteId)}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#0a1120] border border-[#34d399]/40 flex items-center justify-center font-headline-lg text-lg text-[#34d399] font-bold">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-md text-base text-white tracking-wide truncate">{displayName}</span>
              <span className="font-body-sm text-xs text-[#bcc1ca] truncate">{position ? position : sport} {grade ? `· ${grade}` : ''}</span>
            </div>
          </div>
          <span data-testid="athlete-done-badge" className="material-symbols-outlined text-[#34d399] text-xl">check_circle</span>
        </div>
        <div className="flex items-end justify-between mt-4 pt-1 bg-[#0a1120]/80 border border-[#2a313d] p-2 rounded-lg">
          <div className="flex flex-col">
            <span className="font-label-sm text-[10px] uppercase text-[#34d399] font-bold">LOGGED TODAY</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      data-testid="athlete-card"
      className="group relative bg-[#0a1120] hover:bg-[#061c41] border border-[#2a313d] transition-all duration-150 p-4 rounded-xl flex flex-col justify-between h-44 shadow-md cursor-pointer hover:shadow-xl active:scale-[0.98]" 
      onClick={() => onSelect(athleteId)}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#061c41] border border-[#2a313d] flex items-center justify-center font-headline-lg text-lg text-[#b89c5b] font-bold">
            {initials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-headline-md text-base text-white tracking-wide truncate">{displayName}</span>
            <span className="font-body-sm text-xs text-[#bcc1ca] truncate">{position ? position : sport} {grade ? `· ${grade}` : ''}</span>
          </div>
        </div>
        <span className="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-[#061c41] border border-[#2a313d] text-[#bcc1ca] uppercase font-bold">Pending</span>
      </div>
      <div className="flex items-center justify-between mt-4 p-2.5 bg-[#061c41] group-hover:bg-[#b89c5b] group-hover:text-[#030a14] border border-[#2a313d] group-hover:border-[#b89c5b] text-[#b89c5b] rounded-lg transition-colors">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-xl">scale</span>
          <span className="font-headline-md text-sm uppercase tracking-wider font-bold">Tap to Log</span>
        </div>
        <span className="material-symbols-outlined text-base">arrow_forward</span>
      </div>
    </div>
  );
}

export default React.memo(AthleteCard);
