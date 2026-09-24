import { Activity, AlertTriangle, Target } from 'lucide-react';
import React from 'react';
import { computeAcuteChronicLoad, getAthleteBaseline, getCentralDateString, isPostPracticeLog, isRpeLog } from '../../utils/athleteData';

// Daily alert feed plus the consecutive-day streak lookup that
// escalates severity. Pure derivations of App's data - split out of App.jsx.
export function useAlertFeeds({ athletes, dehydrationThreshold, reportData, settings, sleepThreshold }) {
  const alertStreakLookup = React.useMemo(() => {
    const athleteById = new Map(athletes.map(a => [a.id, a]));
    const baselineByAthlete = new Map();
    const baselineFor = (athleteId, athlete) => {
      if (!baselineByAthlete.has(athleteId)) {
        baselineByAthlete.set(athleteId, getAthleteBaseline(athlete || { id: athleteId, athlete_id: athleteId }, reportData));
      }
      return baselineByAthlete.get(athleteId);
    };
    const byDay = new Map(); // 'YYYY-MM-DD' -> Set of 'athleteId|type'
    reportData.forEach(r => {
      if (!r.athlete_id) return;
      const key = getCentralDateString(new Date(r.created_at));
      if (!byDay.has(key)) byDay.set(key, new Set());
      const flags = byDay.get(key);
      if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold) flags.add(r.athlete_id + '|sleep');
      // A day counts toward an RPE streak when the athlete reported a hard session, so the
      // load-spike card can show "3rd straight day" the same way the other alert types do.
      if (isRpeLog(r) && r.rpe != null && Number(r.rpe) >= settings.rpeHighThreshold) flags.add(r.athlete_id + '|rpe');
      if (r.weight_lbs && Number(r.weight_lbs) > 0 && !isPostPracticeLog(r)) {
        const athlete = athleteById.get(r.athlete_id);
        const baseInfo = baselineFor(r.athlete_id, athlete);
        if (baseInfo && baseInfo.id !== r.id && baseInfo.weight_lbs) {
          const drop = baseInfo.weight_lbs - Number(r.weight_lbs);
          if (drop > dehydrationThreshold) flags.add(r.athlete_id + '|weight');
        }
      }
    });
    return (athleteId, type) => {
      let streak = 0;
      const d = new Date();
      for (let i = 0; i < 45; i++) {
        const flags = byDay.get(getCentralDateString(d));
        if (flags && flags.has(athleteId + '|' + type)) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    };
  }, [reportData, athletes, dehydrationThreshold, sleepThreshold, settings.rpeHighThreshold]);

  // Memoized: the sidebar badge, mobile nav, and Alerts screen each call this per
  // render (previously recomputing a full baseline scan 3-5x per frame).
  const dailyAlerts = React.useMemo(() => {
    const now = Date.now();
    const alerts = [];

    const todaysRecords = reportData.filter(r => {
      return (now - new Date(r.created_at).getTime()) <= 24 * 60 * 60 * 1000;
    });

    const athleteById = new Map(athletes.map(a => [a.id, a]));
    const baselineByAthlete = new Map();
    const baselineFor = (athleteId, athlete) => {
      if (!baselineByAthlete.has(athleteId)) {
        baselineByAthlete.set(athleteId, getAthleteBaseline(athlete || { id: athleteId, athlete_id: athleteId }, reportData));
      }
      return baselineByAthlete.get(athleteId);
    };

    todaysRecords.forEach(r => {
      const athlete = athleteById.get(r.athlete_id);
      const positionStr = athlete?.position ? ` · ${athlete.position}` : '';

      if (r.sleep_hrs != null && r.sleep_hrs > 0 && r.sleep_hrs < sleepThreshold) {
        const streak = alertStreakLookup(r.athlete_id, 'sleep');
        alerts.push({
          id: r.id + '_sleep',
          alert_key: r.id + '_sleep',
          athlete_id: r.athlete_id,
          athlete_name: r.athlete_name,
          sport: r.sport,
          type: 'LOW SLEEP DEFICIT',
          color: '#f59e0b',
          icon: <Activity size={22} />,
          message: `${r.sport}${positionStr} · ${r.sleep_hrs} hrs sleep logged today`,
          action: '🌙 MONITOR CNS LOAD',
          streak,
          magnitude: sleepThreshold - Number(r.sleep_hrs)
        });
      }

      const baseInfo = baselineFor(r.athlete_id, athlete);
      const activeBaseline = baseInfo ? { id: baseInfo.id, weight_lbs: baseInfo.weight_lbs } : null;
      const baselineDateStr = baseInfo ? baseInfo.date_str : 'Established';

      if (activeBaseline && activeBaseline.id !== r.id && activeBaseline.weight_lbs && r.weight_lbs && !isPostPracticeLog(r)) {
        const drop = activeBaseline.weight_lbs - r.weight_lbs;
        const dropPercent = drop / activeBaseline.weight_lbs;
        if (drop > dehydrationThreshold) {
          const recommendation = drop >= settings.calorieAdviceLbs ? '🥗💧 INCREASE CALORIES & HYDRATION' : '💧 INCREASE HYDRATION';
          const streak = alertStreakLookup(r.athlete_id, 'weight');
          alerts.push({
            id: r.id + '_weight',
            alert_key: r.id + '_weight',
            athlete_id: r.athlete_id,
            athlete_name: r.athlete_name,
            sport: r.sport,
            type: 'DEHYDRATION RISK',
            color: 'var(--status-error)',
            icon: <AlertTriangle size={22} />,
            message: `${r.sport}${positionStr} · -${drop.toFixed(1)} lbs drop (-${(dropPercent*100).toFixed(1)}% vs Baseline: ${activeBaseline.weight_lbs} lbs on ${baselineDateStr})`,
            action: recommendation,
            streak,
            magnitude: drop
          });
        }
      }
    });

    if (settings.enableRpe) {
      const todaysRpeLogs = todaysRecords.filter(isRpeLog);
      const athleteIdsWithRpeToday = [...new Set(todaysRpeLogs.map(r => r.athlete_id))];

      athleteIdsWithRpeToday.forEach(athleteId => {
        const athlete = athleteById.get(athleteId);
        if (!athlete) return;
        
        const athleteLogs = reportData.filter(l => l.athlete_id === athleteId && isRpeLog(l));
        // Shared with the athlete profile card - see computeAcuteChronicLoad for why the
        // two screens must not carry their own copies of this.
        const { acuteLoad, chronicAvgWeeklyLoad, ratio: acRatio } = computeAcuteChronicLoad(athleteLogs, {
          chronicWeeks: settings.rpeChronicWeeks,
          trackDuration: settings.rpeTrackDuration,
          now,
        });

        // A null ratio means there is not enough history for a chronic baseline yet.
        if (acRatio != null) {
          if (acRatio >= settings.rpeLoadSpikeRatio) {
            const streak = alertStreakLookup(athleteId, 'rpe');
            alerts.push({
              id: `${athleteId}_rpe_spike`,
              alert_key: `${athleteId}_rpe_spike`,
              athlete_id: athleteId,
              athlete_name: athlete.name,
              sport: athlete.sport,
              type: 'ACUTE LOAD SPIKE',
              color: '#ef4444',
              icon: <Target size={22} />,
              message: `${athlete.sport || 'General'} · A:C Ratio spiked to ${acRatio.toFixed(2)}x (Acute: ${acuteLoad} vs Chronic: ${chronicAvgWeeklyLoad.toFixed(0)})`,
              action: '⚠️ MONITOR TRAINING VOLUME',
              streak,
              magnitude: acRatio
            });
          }
        }
      });
    }

    return alerts.sort((a, b) => (b.streak - a.streak) || (b.magnitude - a.magnitude));
  }, [reportData, athletes, dehydrationThreshold, sleepThreshold, alertStreakLookup, settings]);

  const getDailyAlerts = () => dailyAlerts;
  return { dailyAlerts, getDailyAlerts };
}
