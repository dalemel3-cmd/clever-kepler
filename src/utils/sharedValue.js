// A small value shared by every device (v5.17.2): one shared_settings row (db/019) under `key`.
// Read when a screen that uses it opens; kept on the device for offline use. Saving re-reads the
// row and applies `update` to that fresh copy, so a change another device made meanwhile is kept.
import React from 'react';
import { supabase } from '../supabaseClient';
import { allowFetch } from './fetchBrake';

// `clean` and `empty` are read once: pass fixed values (a function defined at module level).
export function useSharedValue(key, clean, empty) {
  const chain = React.useRef(Promise.resolve()); // saves run one after another, each reading the last one's result
  const cacheKey = `hpd_shared_${key}`;
  const [value, setValue] = React.useState(() => { try { return clean(JSON.parse(localStorage.getItem(cacheKey) || 'null')) ?? empty; } catch { return empty; } });
  const remember = React.useCallback((v) => { try { localStorage.setItem(cacheKey, JSON.stringify(v)); } catch { /* ignore */ } }, [cacheKey]);
  React.useEffect(() => {
    let live = true;
    (async () => {
      if ((typeof navigator !== 'undefined' && navigator.onLine === false) || !allowFetch(`shared-${key}`, { max: 4, windowMs: 60000 })) return;
      try {
        const { data, error } = await supabase.from('shared_settings').select('value').eq('key', key).maybeSingle();
        if (error || !live) return;
        const v = clean(data?.value) ?? empty;
        remember(v); setValue(v);
      } catch { /* keep the cached copy */ }
    })();
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = React.useCallback(async (update) => {
    let fresh;
    try {
      const { data, error } = await supabase.from('shared_settings').select('value').eq('key', key).maybeSingle();
      if (error) return { ok: false };
      fresh = clean(data?.value) ?? empty;
    } catch { return { ok: false }; }
    const next = update(fresh);
    try {
      const { error } = await supabase.from('shared_settings').upsert({ key, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) return { ok: false };
    } catch { return { ok: false }; }
    remember(next); setValue(next);
    return { ok: true };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = React.useCallback((update) => {
    const p = chain.current.then(() => run(update));
    chain.current = p.catch(() => {});
    return p;
  }, [run]);
  return [value, save];
}

// Game days for GPS (v5.17.2): { dates: ['2026-11-20', ...] }.
export const cleanGameDays = (v) => (v && Array.isArray(v.dates) ? { dates: [...new Set(v.dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort() } : null);
