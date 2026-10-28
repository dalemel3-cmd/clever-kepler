// Node resolve hook for tests that import app source directly (Vite allows
// extensionless imports like '../lifts/liftRanking'; Node needs '.js').
export async function resolve(specifier, context, next) {
  try { return await next(specifier, context); } catch (e) {
    if (e?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.\.?\//.test(specifier) || /\.[cm]?jsx?$/.test(specifier)) throw e;
    return next(`${specifier}.js`, context);
  }
}
