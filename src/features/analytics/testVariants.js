// Speed & Power test type/variant definitions. Pure data, no React - imported by
// SpeedPowerPanel, ProfilesScreen, AthleteComparisonPanel, and plyomatImport.js alike,
// so the importer (which is deliberately kept React-free, see plyomatImport.js's header)
// can tag a variant on a CSV-imported row without pulling a component file into a
// pure-logic module.
//
// `better` says which direction counts as a personal best: 'asc' for a sprint time
// (lower is faster), 'desc' for a jump (higher is farther/taller). Getting this backwards
// would rank an athlete's worst jump as their best.
//
// A test_type can be measured under more than one protocol, and results from two
// protocols aren't the same test: some teams run vertical/board jump hands-on-hips,
// others with a full arm swing (the arm swing adds height/distance on its own), and
// Fly 10 is "10yd build + 10yd fly" today but is expected to change distances later.
// `variants` lists what's trackable for a test type; a type with only one variant
// still tags every row with it (so a future protocol change becomes a new variant
// value, not a silent redefinition of old rows) but doesn't surface a picker in the UI.
export const JUMP_VARIANTS = [
  { key: 'hands_on_hips', label: 'Hands on Hips' },
  { key: 'arm_swing', label: 'Arm Swing' },
];
export const FLY_VARIANTS = [
  { key: 'build10_fly10', label: '10yd Build + 10yd Fly' },
];
export const VARIANT_LABEL = Object.fromEntries([...JUMP_VARIANTS, ...FLY_VARIANTS].map(v => [v.key, v.label]));
export const UNTAGGED_VARIANT_LABEL = 'Untagged (pre-tracking)';

// Which technique each team runs today (2026-09-08), used to default the entry form
// (and the Plyomat importer) so a coach isn't picking the same value every single time.
// Still overridable per entry - this is a default, not an enforcement. Teams not listed
// here (a technique change, a new team) fall through to no default and the coach picks
// explicitly.
export const TEAM_VARIANT_DEFAULTS = {
  Football: 'hands_on_hips',
  Volleyball: 'hands_on_hips',
  WSOC: 'arm_swing',
  WBB: 'arm_swing',
  Baseball: 'arm_swing',
};

// Test types this app knows about today. `source: 'plyomat'` rows can carry a test_type
// not listed here - the leaderboard groups on whatever values actually show up in the
// data, not on this list, so a new type just appears rather than needing a code change.
export const TEST_TYPES = [
  { key: '10yd_fly', label: '10yd Fly', unit: 'sec', better: 'asc', placeholder: 'e.g. 1.62', variants: FLY_VARIANTS },
  { key: 'vertical_jump', label: 'Vertical Jump', unit: 'in', better: 'desc', placeholder: 'e.g. 24.5', variants: JUMP_VARIANTS },
  { key: 'board_jump', label: 'Board Jump', unit: 'in', better: 'desc', placeholder: 'e.g. 96', variants: JUMP_VARIANTS },
];
export const TEST_TYPE_BY_KEY = Object.fromEntries(TEST_TYPES.map(t => [t.key, t]));

export const formatMetric = (value, unit) => `${Number(value).toFixed(unit === 'sec' ? 2 : 1)} ${unit}`;
