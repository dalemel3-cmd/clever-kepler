// Program Builder + Weight Room Card data (design handoff "HPD Athlete Reports" #3,
// docs/HANDOFF.md §120). Pure functions: the program shape, the athlete's maxes from
// Lift Tracker, and the working-weight math from the handoff.
import { estimate1RM } from '../lifts/liftRanking';

// The %-of-max keys a block can use, in the order the card's Maxes strip shows them.
export const MAX_KEYS = [
  ['clean', 'Clean'], ['bench', 'Bench'], ['squat', 'Squat'], ['dl', 'TBDL'], ['ohp', 'OHP'],
];

// Which Lift Tracker lift feeds each key, picked from the lifts the app has.
export function defaultMaxMap(liftTypes = []) {
  const find = (...names) => names.find(n => liftTypes.includes(n)) || '';
  return {
    clean: find('Hang Clean', 'Power Clean', 'Clean'),
    bench: find('Bench', 'Bench Press'),
    squat: find('Squat', 'Back Squat', 'Front Squat'),
    dl: find('Trap Bar Deadlift', 'TBDL', 'Deadlift'),
    ohp: find('OHP', 'Overhead Press', 'Push Press'),
  };
}

// Handoff: WT = max(45, round5(max * pct)).
export const round5 = (v) => Math.round(v / 5) * 5;
export const workingWeight = (max, pct) => (max > 0 && pct > 0 ? Math.max(45, round5(max * pct)) : '');

// Athlete's maxes: best est. 1RM per mapped lift (blank when none logged).
export function maxesFor(athleteId, liftLogs = [], maxMap = {}) {
  const out = {};
  for (const [key] of MAX_KEYS) {
    const lift = maxMap[key];
    if (!lift) { out[key] = null; continue; }
    let best = 0;
    for (const l of liftLogs) {
      if (l.athlete_id !== athleteId || l.lift_type !== lift) continue;
      const v = estimate1RM(Number(l.weight_lbs), Number(l.reps));
      if (v > best) best = v;
    }
    out[key] = best > 0 ? Math.round(best) : null;
  }
  return out;
}

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`);
export const newSet = (reps = '5', pct = '', tempo = '') => ({ reps, pct, tempo });
export const newBlock = (code = '1a') => ({ id: uid(), code, name: '', note: '', maxKey: '', rx: '', sets: [], velocity: '' });
export const newDay = (date = '', focus = '') => ({ id: uid(), date, focus, warmTitle: 'Warm-Up (2 Rounds)', warm: [], blocks: [newBlock('1a')], finTitle: 'Core', fin: [] });
export const newProgram = (liftTypes = []) => ({ id: uid(), name: 'New program', week_label: 'Week 1', phase: 'Strength + Power', sport: '', days: [newDay('', 'Lower'), newDay('', 'Upper')], max_map: defaultMaxMap(liftTypes) });

// Next block code after the previous one: 1a -> 1b; a new group (+) -> 2a.
export const nextCode = (prev, newGroup = false) => {
  const m = String(prev || '').match(/^(\d+)([a-z]?)$/i);
  if (!m) return '1a';
  if (newGroup) return `${Number(m[1]) + 1}a`;
  return `${m[1]}${String.fromCharCode(((m[2] || 'a').toLowerCase().charCodeAt(0)) + 1)}`;
};

// The handoff's sample week (Session A + B), so a coach can start from a real layout.
export function sampleProgram(liftTypes = []) {
  const S = (reps, pct, tempo) => ({ reps: String(reps), pct: String(Math.round(pct * 100)), tempo });
  const B = (code, name, note, maxKey, sets, velocity = '') => ({ id: uid(), code, name, note, maxKey: maxKey || '', rx: typeof sets === 'string' ? sets : '', sets: typeof sets === 'string' ? [] : sets, velocity });
  return {
    id: uid(), name: 'Sample · Strength + Power', week_label: 'Week 3', phase: 'Strength + Power', sport: '', max_map: defaultMaxMap(liftTypes),
    days: [
      { id: uid(), date: '', focus: 'Lower + Power', warmTitle: 'Warm-Up (2 Rounds)', warm: ['Band Pull Apart x 12', 'MB Windmill x 5 ea', 'Pogos + Squat x 5', 'MB Slam + Rotational Slam x 5 ea'],
        blocks: [
          B('1a', 'Hang Power Clean', 'Above knee', 'clean', [S(3, .65, 'X1X'), S(3, .70, 'X1X'), S(2, .75, 'X1X'), S(2, .75, 'X1X')], '1.9–2.1'),
          B('1b', 'Seated Box Jump', '', '', '4x 2'),
          B('1c', 'Lateral Hops', '', '', '3x 20s'),
          B('2a', 'Barbell Back Squat', 'Depth to MB · add weight if above range', 'squat', [S(5, .70, '3XX'), S(4, .74, 'X2X'), S(4, .76, 'X2X'), S(3, .78, 'X2X')], '.55–.65'),
          B('2b', 'Chin Up', '4 sec eccentric', '', '3x 4'),
          B('2c', 'Copenhagen ISO', '', '', '3x 10s ea'),
          B('3a', 'Curtsy Lunge', 'Load outside glute', '', '3x 6 ea'),
          B('3b', 'Back Extension', '', '', '3x 8'),
        ],
        finTitle: 'Core', fin: ['V-Ups x 10', 'Side Plank x 20s ea', 'Flutter Kicks x 40'] },
      { id: uid(), date: '', focus: 'Upper + Total', warmTitle: 'Warm-Up (2 Rounds)', warm: ['Band Int/Ext Rotation x 8 ea', 'Band Overhead Press x 12', 'MB Bent Over Chest Pass x 5', 'Push Up Walkout x 5'],
        blocks: [
          B('1a', 'Bench Press', '', 'bench', [S(5, .70, '3XX'), S(4, .74, 'X2X'), S(4, .76, 'X2X'), S(3, .78, 'X2X')], '.55–.65'),
          B('1b', 'MB Chest Pass Slam', '', '', '3x 5'),
          B('1c', 'Band Pull Apart', '', '', '2x 15'),
          B('2a', 'Trap Bar Deadlift', 'Bigs: mid-shin block pull', 'dl', [S(4, .68, 'X2X'), S(4, .72, 'X2X'), S(3, .75, 'X2X')]),
          B('2b', 'DB Row', '3 sec eccentric', '', '4x 5 ea'),
          B('3a', '1-Arm DB Bench Press', '', '', '3x 8 ea'),
          B('3b', 'Face Pull + Rotate', '', '', '3x 10 ea'),
        ],
        finTitle: 'Finisher (4 Minutes)', fin: ['AB Rollout x 12', 'Close Grip Push Up x 12', 'Band X-Raise x 12'] },
    ],
  };
}

// One printable card for one athlete: maxes + every set's working weight.
export function buildCard(program, athlete, liftLogs, { showVelocity = true } = {}) {
  const maxes = maxesFor(athlete.id, liftLogs, program.max_map || {});
  const days = (program.days || []).map(d => ({
    ...d,
    dateLabel: d.date ? new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : '',
    blocks: (d.blocks || []).filter(b => b.name).map((b, i, arr) => {
      const max = b.maxKey ? maxes[b.maxKey] : null;
      const isRx = !b.sets?.length;
      return {
        ...b, isRx,
        hasVel: showVelocity && !!b.velocity,
        newGroup: i > 0 && String(arr[i - 1].code)[0] !== String(b.code)[0],
        rows: isRx ? [] : b.sets.map(s => {
          const pct = Number(s.pct) / 100;
          return { reps: s.reps, wt: workingWeight(max, pct), pct: Number(s.pct) > 0 ? `${Math.round(Number(s.pct))}%` : '', tempo: s.tempo || '' };
        }),
      };
    }),
  }));
  return { athlete, maxes, days };
}
