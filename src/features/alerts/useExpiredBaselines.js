import React from 'react';

// Athletes whose baseline weight is older than settings.baselineExpiryDays.
// Split out of App.jsx.
export function useExpiredBaselines({ athletes, baselineExpiryDays, reportData }) {
  return React.useMemo(() => {
    const list = [];
    const nowMs = Date.now();
    athletes.forEach(a => {
      const aRecs = reportData
        .filter(r => r.athlete_id === a.id && r.created_at)
        .sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
      if (aRecs.length === 0) {
        list.push({ id: a.id, athlete_name: a.name, sport: a.sport, last_weigh_in_date: null });
      } else {
        const lastLog = aRecs[aRecs.length - 1];
        const gapDays = Math.floor((nowMs - new Date(lastLog.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (gapDays >= baselineExpiryDays) {
          list.push({ id: a.id, athlete_name: a.name, sport: a.sport, last_weigh_in_date: new Date(lastLog.created_at).toLocaleDateString() });
        }
      }
    });
    return list;
  }, [athletes, reportData, baselineExpiryDays]);
}
