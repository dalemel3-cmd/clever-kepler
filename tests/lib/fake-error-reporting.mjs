// In-memory stand-in for src/errorReporting.js (tests/lib/fake-supabase-hook.mjs).
export const reported = [];
export const reportError = (message, extra) => { reported.push({ message, ...extra }); };
export const reportDataError = (error, context) => { reported.push({ error, context }); };
export const installGlobalErrorReporting = () => {};
export const handleIfStaleChunk = () => false;
