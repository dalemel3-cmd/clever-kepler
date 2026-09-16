import React from 'react';
import { CheckCircle } from 'lucide-react';
import { getSportColor } from '../../utils/athleteData';

// One roster tile on the Quick Entry grid.
//
// Extracted from EntryScreen and memoized because this list is the heaviest thing the
// kiosk renders: with the full roster loaded it is hundreds of tiles, and every one of
// them was being rebuilt on each keystroke in the search box, each poll that touched
// reportData, and each tick of the entry modal's inputs. On an iPad that showed up as
// laggy typing and a slow modal.
//
// The props are deliberately primitives rather than the athlete object plus the
// `athletesRecordedToday` Set: a Set is a new reference whenever it is recomputed, so
// passing it would re-render every tile whenever any single athlete logged. Passing
// `isDoneToday` means a tile only re-renders when its own state actually changes.
function AthleteCard({
  athleteId,
  name,
  sport,
  displayName,
  initials,
  isSelected,
  isDoneToday,
  onSelect,
}) {
  const avatarBg = getSportColor(sport);

  return (
    <div
      data-testid="athlete-card"
      onClick={() => onSelect(athleteId)}
      className="card-glass"
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px',
        cursor: 'pointer',
        borderRadius: '12px',
        minHeight: '64px',
        opacity: isDoneToday ? 0.55 : 1,
        border: isSelected ? '2px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.08)',
        background: isSelected ? 'rgba(194, 164, 80, 0.12)' : 'rgba(255,255,255,0.02)',
        transition: 'border-color 0.12s ease-out'
      }}
    >
      <div style={{ width: '44px', height: '44px', borderRadius: '11px', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>
        {initials}
      </div>
      <span style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: isSelected ? 'var(--color-accent)' : 'var(--white)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {displayName}
      </span>

      {isDoneToday && (
        <div data-testid="athlete-done-badge" style={{ position: 'absolute', top: '-6px', right: '-6px', width: '22px', height: '22px', borderRadius: '50%', background: 'var(--status-success)', border: '2px solid var(--color-bg-sunken, #030a14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CheckCircle size={14} style={{ color: '#000' }} />
        </div>
      )}
    </div>
  );
}

export default React.memo(AthleteCard);
