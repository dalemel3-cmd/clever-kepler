// Node resolve hook for tests that run app data code against a fake Supabase:
// supabaseClient and errorReporting are swapped for in-memory fakes (no network), and
// extensionless relative imports get '.js' (as tests/lib/src-resolve.mjs does).
export async function resolve(specifier, context, next) {
  if (/(^|\/)supabaseClient(\.js)?$/.test(specifier)) return { url: new URL('./fake-supabase.mjs', import.meta.url).href, shortCircuit: true };
  if (/(^|\/)errorReporting(\.js)?$/.test(specifier)) return { url: new URL('./fake-error-reporting.mjs', import.meta.url).href, shortCircuit: true };
  try { return await next(specifier, context); } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
    return next(`${specifier}.js`, context);
  }
}
