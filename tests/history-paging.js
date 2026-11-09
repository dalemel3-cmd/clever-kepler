// Run with:  node tests/history-paging.js   (no browser; Supabase faked in memory)
// v5.15.4 health-review fixes (docs/HANDOFF.md §149):
//  A. reads past PostgREST's 1,000-row cap page until done (lift_logs/performance_tests had
//     passed it and the daily full refresh dropped the oldest history);
//  B. the rack session queue: a change made during a slow save is still sent, one rejected
//     row no longer blocks the queue, a connection error keeps everything queued;
//  C. Periodization matches sessions on program + day, and a set with a manual weight has
//     no % of max; Duplicate gives the copy new day/block ids.
import { register } from 'node:module';
register('./lib/fake-supabase-hook.mjs', import.meta.url);
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
const { fake } = await import('./lib/fake-supabase.mjs');
const { reported } = await import('./lib/fake-error-reporting.mjs');
const { fetchAllRows, loadHistoryTable } = await import('../src/utils/fetchBrake.js');
const C = await import('../src/features/programs/sessionCloud.js');
const { completedFrom, prescribedSets } = await import('../src/features/programs/periodization.js');
const { copyProgram } = await import('../src/features/programs/programData.js');
const { sessionFromRow } = await import('../src/features/programs/workoutSession.js');
const { supabase } = await import('./lib/fake-supabase.mjs');

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rows = (n, t0 = Date.UTC(2026, 10, 1)) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, created_at: new Date(t0 - i * 60000).toISOString() }));

console.log('\n[A] Paging past 1,000 rows');
{
  fake.tables.lift_logs = rows(2345);
  fake.requests.length = 0;
  const { data, error } = await fetchAllRows(() => supabase.from('lift_logs').select('*').order('created_at', { ascending: false }).order('id'));
  check('2,345 rows come back in full (3 pages of 1,000)', !error && data.length === 2345 && fake.requests.length === 3, `${data?.length} rows, ${fake.requests.length} requests`);
  fake.tables.x = rows(1000); fake.requests.length = 0;
  const exact = await fetchAllRows(() => supabase.from('x').select('*'));
  check('exactly 1,000 rows: one extra request that comes back empty', exact.data.length === 1000 && fake.requests.length === 2);
  // A row saved while paging pushes everything down one place: page 2 repeats a row.
  fake.tables.y = rows(1500);
  fake.beforePage = (t, r) => { if (t === 'y' && r && r[0] === 1000) fake.tables.y = [{ id: 'new', created_at: new Date().toISOString() }, ...fake.tables.y]; };
  const shifted = await fetchAllRows(() => supabase.from('y').select('*'));
  fake.beforePage = null;
  check('a row saved mid-paging does not duplicate anything', shifted.data.length === 1500 && new Set(shifted.data.map(r => r.id)).size === 1500, String(shifted.data.length));
  check('maxPages caps the download', (await fetchAllRows(() => supabase.from('lift_logs').select('*'), { maxPages: 2 })).data.length === 2000);
  // A server (or a test stub) that ignores the range sends everything every time.
  fake.tables.z = rows(1500); fake.maxRows = 100000; fake.requests.length = 0;
  const ignoring = await fetchAllRows(() => supabase.from('z').select('*'));
  fake.maxRows = 1000;
  check('a server that ignores the range is asked once, not 50 times', ignoring.data.length === 1500 && fake.requests.filter(r => r.table === 'z').length === 1, String(fake.requests.length));

  fake.tables.lift_logs = rows(1218);
  let full = null;
  const res = await loadHistoryTable({ table: 'lift_logs', columns: '*', cached: [], stampKey: 'k_ll', onFull: (d) => { full = d; }, onDelta: () => {} });
  check('loadHistoryTable full refresh keeps all 1,218 lift logs (was 1,000)', res.mode === 'full' && full?.length === 1218, `${res.mode} ${full?.length}`);
}

console.log('\n[B] Rack session save queue');
const server = new Map();
const keyOf = (r) => `${r.athlete_id}|${r.session_date}|${r.day_id}`;
const row = (extra) => ({ athlete_id: 'a1', session_date: '2026-11-02', day_id: 'd1', program_id: null, items_done: 0, updated_at: new Date().toISOString(), ...extra });
{
  // B1. Finish tapped while the first save is still in flight.
  store.clear(); server.clear(); fake.delay = 400;
  fake.onUpsert = (t, rs) => { for (const r of rs) server.set(keyOf(r), r); return null; };
  C.queueSessionSave(row({ items_done: 5 }));
  await sleep(1650); // first save is in flight
  C.queueSessionSave(row({ items_done: 6, finished_at: '2026-11-02T15:20:00Z', updated_at: new Date(Date.now() + 1).toISOString() }));
  await sleep(3200);
  check('a change made during a slow save is still sent (Finish reaches the server)', server.get('a1|2026-11-02|d1')?.finished_at === '2026-11-02T15:20:00Z' && C.pendingSessionCount() === 0, JSON.stringify(server.get('a1|2026-11-02|d1')));
  fake.delay = 0;

  // B2. One row the database refuses (its program was deleted) must not block the queue.
  store.clear(); server.clear(); reported.length = 0;
  fake.onUpsert = (t, rs) => {
    if (rs.some(r => r.program_id === 'deleted-program')) return { error: { code: '23503', message: 'violates foreign key constraint' } };
    if (rs.some(r => r.items_done === -1)) return { error: { code: '23514', message: 'violates check constraint' } };
    for (const r of rs) server.set(keyOf(r), r);
    return null;
  };
  C.queueSessionSave(row({ athlete_id: 'a1', program_id: 'deleted-program', items_done: 3 }));
  C.queueSessionSave(row({ athlete_id: 'a2', day_id: 'd9', items_done: 4 }));
  C.queueSessionSave(row({ athlete_id: 'a3', day_id: 'd7', items_done: -1 }));
  const r2 = await C.flushSessions();
  check('the other athletes\' sessions still save', server.get('a2|2026-11-02|d9')?.items_done === 4, JSON.stringify([...server.keys()]));
  check('a session whose program was deleted is saved without the program link', server.get('a1|2026-11-02|d1')?.items_done === 3 && server.get('a1|2026-11-02|d1')?.program_id === null);
  const parked = JSON.parse(store.get('hpd_ws_failed') || '[]');
  check('a row that still fails is set aside on the tablet, not retried forever', C.pendingSessionCount() === 0 && parked.length === 1 && parked[0].athlete_id === 'a3' && r2.ok, `pending ${C.pendingSessionCount()}, parked ${parked.length}`);
  check('the refused row is reported', reported.some(x => x.context === 'workout_sessions:save-row'));

  // B3. A connection error (no Postgres code) keeps everything queued.
  store.clear(); server.clear();
  fake.onUpsert = () => ({ error: { message: 'Failed to fetch' } });
  C.queueSessionSave(row({ athlete_id: 'a4' }));
  C.queueSessionSave(row({ athlete_id: 'a5', day_id: 'd2' }));
  const r3 = await C.flushSessions();
  check('a connection error keeps every row queued (nothing set aside)', !r3.ok && C.pendingSessionCount() === 2 && !store.get('hpd_ws_failed'), `pending ${C.pendingSessionCount()}`);
  fake.onUpsert = (t, rs) => { for (const r of rs) server.set(keyOf(r), r); return null; };

  // B4. A tablet whose clock runs slow picks up a session another rack saved: its saves are
  // still stamped after that rack's, so the database's newer-wins rule keeps them.
  const restored = sessionFromRow({ day_id: 'd1', updated_at: new Date(Date.now() + 120000).toISOString(), sets: {}, done: {} });
  const stamped = C.sessionRow({ athlete: { id: 'a1' }, program: { id: 'p' }, day: { id: 'd1' }, session: restored, today: '2026-11-02' });
  check('a slow-clock tablet stamps saves after the rack it took over from', Date.parse(stamped.updated_at) > restored.serverUpdatedAt, `${stamped.updated_at} vs ${new Date(restored.serverUpdatedAt).toISOString()}`);

  // v5.15.9 (docs/HANDOFF.md §154)
  // B5. A change made during a save, stamped in the same millisecond as the save in flight,
  // used to be dropped as already sent.
  store.clear(); server.clear(); fake.delay = 400;
  fake.onUpsert = (t, rs) => { for (const r of rs) server.set(keyOf(r), r); return null; };
  const same = new Date().toISOString();
  C.queueSessionSave(row({ athlete_id: 'b5', items_done: 1, updated_at: same }));
  await sleep(1650);
  C.queueSessionSave(row({ athlete_id: 'b5', items_done: 2, updated_at: same }));
  await sleep(3200);
  check('a change stamped in the same millisecond as the save in flight still goes up', server.get('b5|2026-11-02|d1')?.items_done === 2 && C.pendingSessionCount() === 0, JSON.stringify(server.get('b5|2026-11-02|d1')));
  fake.delay = 0;

  // B6. The tablet clock is set back a minute between two saves.
  store.clear();
  const t0 = Date.now();
  C.queueSessionSave(row({ athlete_id: 'b6', items_done: 1, updated_at: new Date(t0).toISOString() }));
  C.queueSessionSave(row({ athlete_id: 'b6', items_done: 2, updated_at: new Date(t0 - 60000).toISOString() }));
  const b6 = JSON.parse(store.get('hpd_ws_pending'))['b6|2026-11-02|d1'];
  check('a save after the clock was set back is still stamped after the last one', Date.parse(b6.updated_at) > t0 && b6.items_done === 2, b6.updated_at);
  await C.flushSessions();

  // B7. A tablet whose clock runs 5 minutes ahead: the database sets its stamps back to now
  // (db/016). Another rack saves 1 minute later; this tablet must see that save as newer.
  store.clear(); server.clear();
  const serverNow = Date.now(), ahead = serverNow + 5 * 60000;
  fake.onUpsert = (t, rs) => ({ data: rs.map(r => ({ athlete_id: r.athlete_id, session_date: r.session_date, day_id: r.day_id, updated_at: new Date(Math.min(Date.parse(r.updated_at), serverNow)).toISOString() })) });
  C.queueSessionSave(row({ athlete_id: 'b7', items_done: 2, updated_at: new Date(ahead).toISOString() }));
  await C.flushSessions();
  check('the stamp the database kept is remembered', C.ackedSaveAt('b7', '2026-11-02', 'd1') === serverNow, String(C.ackedSaveAt('b7', '2026-11-02', 'd1')));
  const mine = { dayId: 'd1', savedAt: ahead };
  const other = { athlete_id: 'b7', session_date: '2026-11-02', day_id: 'd1', updated_at: new Date(serverNow + 60000).toISOString() };
  check('a clock-ahead tablet sees another rack\'s later save (was ignored for 5 minutes)', C.savedElsewhere(other, mine, 'b7', '2026-11-02') === true);
  check('...but not its own last save', C.savedElsewhere({ ...other, updated_at: new Date(serverNow).toISOString() }, mine, 'b7', '2026-11-02') === false);
  check('...nor its own save still waiting to go up', C.savedElsewhere({ ...other, pendingHere: true }, mine, 'b7', '2026-11-02') === false);
  check('a rack it took over from counts as known', C.savedElsewhere(other, { dayId: 'd1', serverUpdatedAt: serverNow + 60000 }, 'nobody', '2026-11-02') === false);
  check('a session never saved here falls back to the tablet clock', C.savedElsewhere(other, { dayId: 'd1', savedAt: serverNow }, 'nobody', '2026-11-02') === true && C.savedElsewhere(other, { dayId: 'd1', savedAt: ahead }, 'nobody', '2026-11-02') === false);
  check('a pending row restored here is not taken for the server\'s clock', sessionFromRow({ ...other, pendingHere: true }).serverUpdatedAt === null);
  // A save the database skipped (older than another rack's) is left out of the reply.
  fake.onUpsert = () => ({ data: [] });
  C.queueSessionSave(row({ athlete_id: 'b7', items_done: 3 }));
  await C.flushSessions();
  check('a skipped save leaves the remembered stamp alone', C.ackedSaveAt('b7', '2026-11-02', 'd1') === serverNow);

  // B8 (v5.16.0). A save still queued on rack A (sets 1-3) no longer hides rack B's newer one
  // (sets 1-6): A used to keep its own copy and then write over B's sets.
  store.clear();
  fake.onUpsert = (t, rs) => ({ data: rs.map(r => ({ athlete_id: r.athlete_id, session_date: r.session_date, day_id: r.day_id, updated_at: r.updated_at })) });
  C.queueSessionSave(row({ athlete_id: 'b8', items_done: 1 }));
  await C.flushSessions();
  const s1 = C.ackedSaveAt('b8', '2026-11-02', 'd1');
  C.queueSessionSave(row({ athlete_id: 'b8', items_done: 3 })); // not sent yet
  fake.tables.workout_sessions = [{ athlete_id: 'b8', session_date: '2026-11-02', day_id: 'd1', items_done: 6, updated_at: new Date(s1 + 300000).toISOString() }];
  const m8 = (await C.fetchAthleteSessions('b8', '2026-11-01')).find(x => x.day_id === 'd1');
  check('the save queued here is what the list shows', m8?.pendingHere && m8.items_done === 3, JSON.stringify(m8));
  check('another rack\'s newer save wins over one still queued here', C.savedElsewhere(m8, { dayId: 'd1', savedAt: Date.now() }, 'b8', '2026-11-02') === true && C.serverCopy(m8)?.items_done === 6);
  C.discardPendingSave('b8', '2026-11-02', 'd1');
  check('...and the queued save is dropped', C.pendingSessionCount() === 0);
  fake.tables.workout_sessions = [{ athlete_id: 'b8', session_date: '2026-11-02', day_id: 'd1', items_done: 1, updated_at: new Date(s1).toISOString() }];
  C.queueSessionSave(row({ athlete_id: 'b8', items_done: 4 }));
  const own = (await C.fetchAthleteSessions('b8', '2026-11-01')).find(x => x.day_id === 'd1');
  check('a queued save over this tablet\'s own last save is kept', C.savedElsewhere(own, { dayId: 'd1', savedAt: Date.now() }, 'b8', '2026-11-02') === false);
  C.discardPendingSave('b8', '2026-11-02', 'd1');

  // A send that failed on the connection may have landed: the server copy may be its own.
  store.clear();
  fake.onUpsert = () => ({ error: { message: 'Failed to fetch' } });
  C.queueSessionSave(row({ athlete_id: 'b9', items_done: 2 }));
  await C.flushSessions();
  fake.tables.workout_sessions = [{ athlete_id: 'b9', session_date: '2026-11-02', day_id: 'd1', items_done: 2, updated_at: new Date(Date.now() + 1000).toISOString() }];
  const m9 = (await C.fetchAthleteSessions('b9', '2026-11-01')).find(x => x.day_id === 'd1');
  check('after a failed send the queued save is kept', m9?.pendingHere && C.savedElsewhere(m9, { dayId: 'd1', savedAt: Date.now() }, 'b9', '2026-11-02') === false);
  const sent = [];
  fake.onUpsert = (t, rs) => { sent.push(...rs); return null; };
  C.queueSessionSave(row({ athlete_id: 'b9', items_done: 3 }));
  check('the failed-send mark carries over to the next save', JSON.parse(store.get('hpd_ws_pending'))['b9|2026-11-02|d1']?.sendFailed === true);
  await C.flushSessions();
  check('the mark is never sent to the database', sent.length === 1 && !('sendFailed' in sent[0]) && C.pendingSessionCount() === 0, JSON.stringify(sent));
  fake.onUpsert = (t, rs) => { for (const r of rs) server.set(keyOf(r), r); return null; };
}

console.log('\n[C] Periodization and Duplicate');
{
  const day = (id, date) => ({ id, date, blocks: [{ id: `${id}b`, code: '1a', name: 'DB Split Squat', sets: [{ reps: '10' }, { reps: '10' }, { reps: '10' }, { reps: '10' }, { reps: '10' }] }] });
  const wk10 = { id: 'P10', name: 'WSOC', week_label: 'Week 10', sport: 'WSOC', days: [{ ...day('D1', '2026-11-02'), blocks: [{ id: 'D1b', code: '1a', name: 'Back Squat', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] }] }] };
  const wk11 = { id: 'P11', name: 'WSOC', week_label: 'Week 11', sport: 'WSOC', days: [day('D1', '2026-11-09')] }; // duplicated before v5.15.4: same day id
  const ws = { athlete_id: 'a1', sport: 'WSOC', session_date: '2026-11-09', program_id: 'P11', day_id: 'D1', planned_date: '2026-11-09', sets: {}, done: Object.fromEntries([0, 1, 2, 3, 4].map(k => [`D1b_${k}`, true])) };
  const ab = completedFrom([ws], [wk10, wk11]), ba = completedFrom([ws], [wk11, wk10]);
  check('a session counts against its own program whatever order programs load in', ab[0]?.completedSets === 5 && ab[0]?.completedReps === 50 && ba[0]?.completedSets === 5 && ba[0]?.completedReps === 50, JSON.stringify([ab[0]?.completedSets, ba[0]?.completedSets]));
  const orphan = { ...ws, program_id: null };
  check('without a program id, the copy dated that day is used', completedFrom([orphan], [wk10, wk11])[0]?.completedReps === 50);
  const ps = prescribedSets({ name: 'Back Squat', sets: [{ reps: '5', pct: '70', lb: '135' }, { reps: '5', pct: '70' }] });
  check('a set with a manual weight has no % (it does not count toward intensity)', ps[0].pct === null && ps[1].pct === 70, JSON.stringify(ps));

  const copy = copyProgram(wk10, 'WSOC (copy)');
  const ids = (p) => [p.id, ...p.days.map(d => d.id), ...p.days.flatMap(d => d.blocks.map(b => b.id))];
  check('Duplicate: new ids for the program, its days and blocks', ids(copy).every(id => !ids(wk10).includes(id)) && copy.name === 'WSOC (copy)', JSON.stringify(ids(copy)));
  check('Duplicate: everything else is the same', copy.days[0].date === wk10.days[0].date && copy.days[0].blocks[0].sets.length === 3 && wk10.days[0].id === 'D1');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
