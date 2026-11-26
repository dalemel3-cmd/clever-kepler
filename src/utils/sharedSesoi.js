// The coach's SESOI values, one set for every device (v5.17.1): a row in shared_settings
// (db/019) under key 'sesoi', e.g. { "distance_yd": 300, "vertical_jump": 1 }. Read when a screen
// that uses it opens; kept on the device for offline use.
import React from 'react';
import { supabase } from '../supabaseClient';
import { allowFetch } from './fetchBrake';

const KEY = 'sesoi';
const CACHE = 'hpd_shared_sesoi';
const clean = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) { const n = Number(v); if (k && Number.isFinite(n) && n > 0) out[k] = n; }
  return out;
};
const cached = () => { try { return clean(JSON.parse(localStorage.getItem(CACHE) || '{}')); } catch { return {}; } };
const remember = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* ignore */ } };

export function useSharedSesoi() {
  const [values, setValues] = React.useState(cached);
  React.useEffect(() => {
    let live = true;
    (async () => {
      if ((typeof navigator !== 'undefined' && navigator.onLine === false) || !allowFetch('shared-sesoi', { max: 4, windowMs: 60000 })) return;
      try {
        const { data, error } = await supabase.from('shared_settings').select('value').eq('key', KEY).maybeSingle();
        if (error || !live) return;
        const v = clean(data?.value);
        remember(v); setValues(v);
      } catch { /* keep the cached copy */ }
    })();
    return () => { live = false; };
  }, []);
  // Merges `patch` (only the numbers that were changed; blank removes one) into the row as it is
  // in the database now, so a value another device saved meanwhile is kept. Resolves { ok }.
  const save = React.useCallback(async (patch) => {
    let fresh;
    try {
      const { data, error } = await supabase.from('shared_settings').select('value').eq('key', KEY).maybeSingle();
      if (error) return { ok: false };
      fresh = clean(data?.value);
    } catch { return { ok: false }; }
    const next = { ...fresh };
    for (const [k, v] of Object.entries(patch)) { const n = Number(v); if (Number.isFinite(n) && n > 0) next[k] = n; else delete next[k]; }
    try {
      const { error } = await supabase.from('shared_settings').upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return { ok: false };
    } catch { return { ok: false }; }
    remember(next); setValues(next);
    return { ok: true };
  }, []);
  return [values, save];
}
