// Single source of truth for every tunable value in the app.
//
// Nothing that a coach might reasonably want to change should be a magic number
// buried in a component. Everything here is persisted to localStorage, merged over
// the defaults on load (so new keys added in a release appear automatically for
// existing users), and read live by the screens.

export const SETTINGS_STORAGE_KEY = 'hpd_settings';
const LEGACY_THRESHOLDS_KEY = 'shiloh_threshold_settings';

export const DEFAULT_SETTINGS = {
  // --- Program identity (shown in the sidebar, mobile menu, and printed reports) ---
  organizationName: 'Shiloh Athletics',
  programName: 'Human Performance',
  coachName: 'Coach Mason',
  // IANA timezone the program's "today" is anchored to, so every device agrees on
  // which calendar day an evening weigh-in belongs to.
  programTimezone: 'America/Chicago',
  // Season start - used as the baseline reference date when an athlete has no
  // explicit baseline marker yet.
  seasonStartDate: '2026-08-03',

  // --- Hydration / mass-loss thresholds ---
  // % drop vs baseline that flags an athlete as a dehydration risk.
  dehydrationThreshold: 2.0,
  // Absolute lbs drop that counts as an acute/significant drop.
  acuteDropLbs: 3.0,
  // Drop at or above which the advice escalates to calories + fluids.
  calorieAdviceLbs: 4.0,
  // Post-practice sweat loss considered severe (either condition).
  severeSweatLbs: 5.0,
  severeSweatPct: 2.5,
  // Fluid replacement guidance: fl oz to drink per lb lost.
  fluidOzPerLb: 24,
  // Minimum oz suggested even for a marginal loss.
  minFluidOz: 32,

  // --- Sleep / recovery thresholds ---
  // Below this = flagged sleep deficit.
  sleepThreshold: 6.5,
  // At or above this = counts toward the recovery index score.
  sleepRecoveryHours: 7.0,
  // At or above this = "optimal"; also the target line on the sleep chart.
  sleepTargetHours: 7.5,
  sleepChartTargetHours: 8.0,
  // Quick-select buttons on the kiosk sleep input.
  sleepQuickPicks: [6.0, 7.0, 7.5, 8.0, 8.5, 9.0],

  // --- Baselines ---
  // Days of inactivity after which a baseline is considered expired and the
  // athlete is prompted to re-establish one.
  baselineExpiryDays: 14,

  // --- Data windows ---
  // How many days of weigh-ins to pull for the dashboard/reports.
  dataWindowDays: 30,
  // Max rows fetched for a single athlete's profile history.
  profileHistoryLimit: 180,
  // How recent a post-practice log must be to show on the acute sweat-loss cards
  // in Reports (unbounded there beyond this - it's the historical/pull-up-as-needed view).
  postPracticeLookbackDays: 7,
  // How recent a post-practice log must be to still show on the live Alerts screen.
  // Kept separate and much shorter than postPracticeLookbackDays so Alerts stays a
  // same-day "today" list instead of a card lingering there for a week.
  alertsAcuteWindowHours: 48,

  // --- Entry validation bounds ---
  minWeightLbs: 0,
  maxWeightLbs: 1000,
  maxSleepHours: 24,

  // --- Roster ---
  // Sports offered in pickers. Sports actually present on the roster are merged in
  // automatically, so this list is only the suggestions shown before anyone is added.
  sportsList: ['Baseball', 'Cheer & Dance', 'Football', 'Golf', 'MBB', 'SOCC', 'Softball', 'Tennis', 'Track & Field', 'VBB', 'Volleyball', 'WBB', 'WSOC', 'Wrestling'],

  // --- RPE & Training Load ---
  enableRpe: false,
  rpeTrackDuration: true,
  rpeScaleMax: 10,
  rpeHighThreshold: 8,
  rpeSessionLabels: ['Lift', 'Run', 'Combined'],
  rpeLoadSpikeRatio: 1.3,
  rpeChronicWeeks: 4,
};

// Numeric fields get coerced and range-checked so a corrupt localStorage entry
// can't poison a threshold with NaN or a negative.
const NUMERIC_BOUNDS = {
  dehydrationThreshold: [0.1, 20],
  acuteDropLbs: [0.1, 100],
  calorieAdviceLbs: [0.1, 100],
  severeSweatLbs: [0.1, 100],
  severeSweatPct: [0.1, 50],
  fluidOzPerLb: [1, 200],
  minFluidOz: [0, 500],
  sleepThreshold: [0, 24],
  sleepRecoveryHours: [0, 24],
  sleepTargetHours: [0, 24],
  sleepChartTargetHours: [0, 24],
  baselineExpiryDays: [1, 365],
  dataWindowDays: [1, 3650],
  profileHistoryLimit: [10, 10000],
  postPracticeLookbackDays: [1, 365],
  alertsAcuteWindowHours: [1, 168],
  minWeightLbs: [0, 1000],
  maxWeightLbs: [1, 5000],
  maxSleepHours: [1, 24],
  rpeScaleMax: [1, 100],
  rpeHighThreshold: [1, 100],
  rpeLoadSpikeRatio: [0.1, 10.0],
  rpeChronicWeeks: [1, 52],
};

const coerce = (key, value, fallback) => {
  const bounds = NUMERIC_BOUNDS[key];
  if (bounds) {
    const n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.min(Math.max(n, bounds[0]), bounds[1]);
  }
  if (Array.isArray(fallback)) {
    return Array.isArray(value) && value.length ? value : fallback;
  }
  if (typeof fallback === 'string') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }
  return value === undefined ? fallback : value;
};

export const normalizeSettings = (raw) => {
  const out = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    Object.keys(DEFAULT_SETTINGS).forEach(key => {
      if (raw[key] !== undefined && raw[key] !== null) {
        out[key] = coerce(key, raw[key], DEFAULT_SETTINGS[key]);
      }
    });
  }
  return out;
};

export const loadSettings = () => {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch (e) {}

  // One-time migration from the original three-threshold store so existing
  // installs keep the values their coaches already configured.
  if (!stored) {
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_THRESHOLDS_KEY));
      if (legacy && typeof legacy === 'object') stored = legacy;
    } catch (e) {}
  }

  return normalizeSettings(stored);
};

export const saveSettings = (settings) => {
  const normalized = normalizeSettings(settings);
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    // Keep the legacy key in sync for any older tab still reading it.
    localStorage.setItem(LEGACY_THRESHOLDS_KEY, JSON.stringify({
      dehydrationThreshold: normalized.dehydrationThreshold,
      sleepThreshold: normalized.sleepThreshold,
      baselineExpiryDays: normalized.baselineExpiryDays,
    }));
  } catch (e) {
    console.warn('Could not persist settings:', e);
  }
  return normalized;
};

// The install instructions should always point at wherever the app is actually
// being served from, never a hardcoded deployment URL.
export const getAppHost = () => {
  try {
    return window.location.host || 'this site';
  } catch (e) {
    return 'this site';
  }
};
