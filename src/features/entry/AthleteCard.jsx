import React from 'react';
import { CheckCircle } from 'lucide-react';

const AVATAR_COLORS = ['#2c3e6b', '#5b6e3e', '#6b4226', '#3b6e6e', '#6b3a5b', '#3e4e6b', '#6b5b2e', '#4b3e6b', '#2e5b4b', '#6b2e3e'];

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
  position,
  team,
  displayName,
  initials,
  isSelected,
  isDoneToday,
  onSelect,
}) {
  // Stable per-name colour, so an athlete keeps the same avatar between renders.
  const avatarBg = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }, [name]);

  return (
    <div
      onClick={() => onSelect(athleteId)}
      className="card-glass"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '14px 16px',
        cursor: 'pointer',
        borderRadius: '16px',
        border: isDoneToday ? '1px solid rgba(34, 197, 94, 0.45)' : (isSelected ? '2px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.08)'),
        background: isDoneToday ? 'rgba(34, 197, 94, 0.08)' : (isSelected ? 'rgba(194, 164, 80, 0.12)' : 'rgba(255,255,255,0.02)'),
        boxShadow: isDoneToday ? '0 4px 20px rgba(34, 197, 94, 0.12)' : 'none',
        transition: 'all 0.2s'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontWeight: 700, fontSize: '15px', flexShrink: 0 }}>
          {initials}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontSize: '15px', fontWeight: 700, color: isDoneToday ? 'var(--status-success)' : (isSelected ? 'var(--color-accent)' : 'var(--white)'), textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {displayName}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {sport}{position ? ` · ${position}` : (team ? ` · ${team}` : '')}
          </span>
        </div>
      </div>

      {isDoneToday ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(34, 197, 94, 0.18)', border: '1px solid rgba(34, 197, 94, 0.5)', padding: '5px 10px', borderRadius: '20px', flexShrink: 0 }}>
          <CheckCircle size={15} style={{ color: 'var(--status-success)' }} />
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-success)', letterSpacing: '0.05em' }}>DONE</span>
        </div>
      ) : (
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', padding: '6px 12px', borderRadius: '16px', flexShrink: 0 }}>
          TAP TO LOG
        </div>
      )}
    </div>
  );
}

export default React.memo(AthleteCard);
