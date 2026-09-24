import React from 'react';
import { getCentralDateString } from '../../utils/athleteData';

// Dashboard executive insights & 24h deltas. Split out of App.jsx.
export function useExecutiveInsights({ athletes, reportData, todaySessions }) {
  return React.useMemo(() => {
    void todaySessions; // Trigger re-computation when sessions are logged
    const now = new Date();
    const todayCentralStr = getCentralDateString(now);
    const yesterdayCentralStr = getCentralDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    // Merge online and offline records for calculation
    let allLogs = [...(reportData || [])];
    try {
      const offline = JSON.parse(localStorage.getItem('shiloh_offline_weigh_ins') || '[]');
      offline.forEach(item => {
        const rec = item.record || item;
        if (rec && rec.athlete_id && rec.created_at) {
          allLogs.push(rec);
        }
      });
    } catch {}

    const todayLogs = allLogs.filter(r => {
      if (!r.created_at) return false;
      return getCentralDateString(new Date(r.created_at)) === todayCentralStr;
    });

    const yesterdayLogs = allLogs.filter(r => {
      if (!r.created_at) return false;
      return getCentralDateString(new Date(r.created_at)) === yesterdayCentralStr;
    });

    // 1. Compliance & Momentum
    const totalAthletes = Math.max(athletes.length, 1);
    const todayRecordedIds = new Set(todayLogs.map(r => r.athlete_id));
    const yesterdayRecordedIds = new Set(yesterdayLogs.map(r => r.athlete_id));
    
    const todayCompliancePct = Math.round((todayRecordedIds.size / totalAthletes) * 100);
    const yesterdayCompliancePct = Math.round((yesterdayRecordedIds.size / totalAthletes) * 100);
    const complianceDelta = todayCompliancePct - yesterdayCompliancePct;

    // 2. Recovery & Sleep Quality Index
    const todaySleepLogs = todayLogs.filter(r => r.sleep_hrs && !isNaN(parseFloat(r.sleep_hrs)));
    const yesterdaySleepLogs = yesterdayLogs.filter(r => r.sleep_hrs && !isNaN(parseFloat(r.sleep_hrs)));
    
    const todayAvgSleep = todaySleepLogs.length 
      ? (todaySleepLogs.reduce((acc, r) => acc + parseFloat(r.sleep_hrs), 0) / todaySleepLogs.length).toFixed(1)
      : null;
    const yesterdayAvgSleep = yesterdaySleepLogs.length 
      ? (yesterdaySleepLogs.reduce((acc, r) => acc + parseFloat(r.sleep_hrs), 0) / yesterdaySleepLogs.length).toFixed(1)
      : null;
    
    const sleepDelta = (todayAvgSleep !== null && yesterdayAvgSleep !== null) 
      ? (parseFloat(todayAvgSleep) - parseFloat(yesterdayAvgSleep)).toFixed(1)
      : null;

    // 3. (removed) A "Hydration & Mass Stability Watch" list was computed here and never
    // rendered anywhere - dead weight that still cost an O(todayLogs x allLogs) scan on
    // every dashboard render. It also compared raw weights without excluding
    // post-practice sweat checks or RPE rows, so had anything ever displayed it, it would
    // have re-introduced the false-dehydration bug class documented in HANDOFF §5. The
    // live dehydration alerts (dailyAlerts, below) are the real, correctly-filtered path.

    // 4. Sport Group Leaderboard
    const sportStats = {};
    athletes.forEach(a => {
      const s = (a.sport || 'General').toUpperCase();
      if (!sportStats[s]) sportStats[s] = { total: 0, loggedToday: 0 };
      sportStats[s].total += 1;
      if (todayRecordedIds.has(a.id)) {
        sportStats[s].loggedToday += 1;
      }
    });

    const leaderboard = Object.keys(sportStats).map(sport => {
      const stats = sportStats[sport];
      const pct = Math.round((stats.loggedToday / Math.max(stats.total, 1)) * 100);
      return {
        sport,
        loggedToday: stats.loggedToday,
        total: stats.total,
        percentage: pct
      };
    }).sort((a, b) => b.percentage - a.percentage || b.loggedToday - a.loggedToday);

    return {
      todayCompliancePct,
      yesterdayCompliancePct,
      complianceDelta,
      todayAvgSleep,
      yesterdayAvgSleep,
      sleepDelta,
      leaderboard,
      sportLeaderboard: leaderboard,
      todayCount: todayLogs.length,
      todayRecordedCount: todayRecordedIds.size
    };
  }, [reportData, athletes, todaySessions]);
}
