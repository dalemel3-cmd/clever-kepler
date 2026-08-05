// App Version Tracking & Cloud Helpers
export const APP_VERSION = 'v4.1.0';

export const isValidUuid = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const parseAthleteMeta = (posStr) => {
  if (!posStr || typeof posStr !== 'string') return { pos: posStr || '' };
  if (posStr.startsWith('{"') && posStr.endsWith('}')) {
    try {
      const parsed = JSON.parse(posStr);
      return {
        pos: parsed.pos !== undefined ? parsed.pos : '',
        bw: parsed.bw !== undefined ? Number(parsed.bw) : undefined,
        bd: parsed.bd,
        lid: parsed.lid
      };
    } catch(e) {
      return { pos: posStr };
    }
  }
  return { pos: posStr };
};

export const encodeAthleteMeta = (existingPos, baselineWeight, baselineDate, baselineLogId) => {
  const current = parseAthleteMeta(existingPos);
  return JSON.stringify({
    pos: current.pos || '',
    bw: baselineWeight !== undefined && baselineWeight !== null ? Number(baselineWeight) : current.bw,
    bd: baselineDate || current.bd,
    lid: baselineLogId !== undefined ? baselineLogId : current.lid
  });
};

export const isPostPracticeLog = (rec) => {
  if (!rec) return false;
  if (rec.session_type === 'post_practice' || rec.is_post_practice) return true;
  try {
    const ppMap = JSON.parse(localStorage.getItem('shiloh_post_practice_logs') || '{}');
    if (rec.id && ppMap[rec.id]) return true;
    if (rec.athlete_id && rec.created_at) {
      if (ppMap[`${rec.athlete_id}_${rec.created_at}`]) return true;
      const t = new Date(rec.created_at).getTime();
      if (!isNaN(t) && ppMap[`${rec.athlete_id}_${t}`]) return true;
      const prefix = String(rec.created_at).slice(0, 16);
      if (ppMap[`${rec.athlete_id}_${prefix}`]) return true;
    }
  } catch(e) {}
  return false;
};

export const markLogAsPostPractice = (rec) => {
  if (!rec) return;
  try {
    const ppMap = JSON.parse(localStorage.getItem('shiloh_post_practice_logs') || '{}');
    if (rec.id) ppMap[rec.id] = true;
    if (rec.athlete_id && rec.created_at) {
      ppMap[`${rec.athlete_id}_${rec.created_at}`] = true;
      const t = new Date(rec.created_at).getTime();
      if (!isNaN(t)) ppMap[`${rec.athlete_id}_${t}`] = true;
      const prefix = String(rec.created_at).slice(0, 16);
      ppMap[`${rec.athlete_id}_${prefix}`] = true;
    }
    localStorage.setItem('shiloh_post_practice_logs', JSON.stringify(ppMap));
  } catch(e) {}
};

export const getAthleteBaseline = (athlete, allLogs = []) => {
  if (!athlete) return null;
  const athId = athlete.id || athlete.athlete_id;
  const athleteRecords = allLogs
    .filter(r => (r.athlete_id === athId || r.id === athId) && r.weight_lbs && !isNaN(parseFloat(r.weight_lbs)) && parseFloat(r.weight_lbs) > 0 && !isPostPracticeLog(r))
    .sort((a, b) => new Date(a.created_at || a.date || 0) - new Date(b.created_at || b.date || 0));

  let baseWeight = null;
  let baseDate = '8/3/2026';
  let baseLogId = null;

  // 1. Check custom override in localStorage map
  try {
    const customMap = JSON.parse(localStorage.getItem('shiloh_baselines_map') || '{}');
    if (customMap[athId] && customMap[athId].weight_lbs && Number(customMap[athId].weight_lbs) > 0) {
      baseWeight = parseFloat(customMap[athId].weight_lbs);
      baseLogId = customMap[athId].log_id || 'map_base';
      const dVal = customMap[athId].date_str || customMap[athId].date;
      baseDate = dVal ? (!isNaN(new Date(dVal).getTime()) ? new Date(dVal).toLocaleDateString() : dVal) : '8/3/2026';
      return { weight_lbs: baseWeight, date_str: baseDate, id: baseLogId };
    }
  } catch(e) {}

  // 2. Check for explicit is_baseline === true log (most recent first)
  const explicitBaseLog = [...athleteRecords].reverse().find(r => r.is_baseline === true || r.is_baseline === 'true' || r.is_baseline === 1);
  if (explicitBaseLog && explicitBaseLog.weight_lbs) {
    baseWeight = parseFloat(explicitBaseLog.weight_lbs);
    baseDate = explicitBaseLog.created_at ? new Date(explicitBaseLog.created_at).toLocaleDateString() : (explicitBaseLog.date || '8/3/2026');
    return { weight_lbs: baseWeight, date_str: baseDate, id: explicitBaseLog.id };
  }

  // 3. Check specifically for weigh-in on 8/3/2026 (or date string containing 2026-08-03 or matching 8/3/2026)
  const aug3Log = [...athleteRecords].reverse().find(r => {
    const dStr = r.created_at || r.date || '';
    return dStr.includes('2026-08-03') || (!isNaN(new Date(dStr).getTime()) && new Date(dStr).toLocaleDateString() === '8/3/2026');
  });
  if (aug3Log && aug3Log.weight_lbs) {
    baseWeight = parseFloat(aug3Log.weight_lbs);
    baseDate = '8/3/2026';
    return { weight_lbs: baseWeight, date_str: baseDate, id: aug3Log.id };
  }

  // 4. Check athlete table baseline_weight or position metadata
  const meta = parseAthleteMeta(athlete.position || '');
  const bw = athlete.baseline_weight || meta.bw || meta.baseline_weight;
  if (bw && Number(bw) > 0) {
    baseWeight = parseFloat(bw);
    baseDate = meta.bd || athlete.baseline_date || '8/3/2026';
    return { weight_lbs: baseWeight, date_str: baseDate, id: 'meta_base' };
  }

  // 5. Fallback: if they have logs, take their second to last log or first ever log as baseline
  if (athleteRecords.length > 1) {
    const fallbackLog = athleteRecords[athleteRecords.length - 2];
    baseWeight = parseFloat(fallbackLog.weight_lbs);
    baseDate = fallbackLog.created_at ? new Date(fallbackLog.created_at).toLocaleDateString() : (fallbackLog.date || 'Established');
    return { weight_lbs: baseWeight, date_str: baseDate, id: fallbackLog.id };
  } else if (athleteRecords.length === 1) {
    const fallbackLog = athleteRecords[0];
    baseWeight = parseFloat(fallbackLog.weight_lbs);
    baseDate = fallbackLog.created_at ? new Date(fallbackLog.created_at).toLocaleDateString() : (fallbackLog.date || 'Established');
    return { weight_lbs: baseWeight, date_str: baseDate, id: fallbackLog.id };
  }

  return null;
};
