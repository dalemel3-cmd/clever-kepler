// ESM resolve hook: ESM ignores NODE_PATH, so a bare `import 'playwright'` from tests/
// fails when Playwright is only installed globally. On ERR_MODULE_NOT_FOUND for
// playwright / playwright-core, retry default resolution as if imported from the
// global node_modules parent (keeps the package's "import" export condition).
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const req = createRequire(import.meta.url);
let globalParent = null;
function parentFor() {
  if (!globalParent) {
    const pkg = req.resolve('playwright/package.json'); // honours NODE_PATH
    globalParent = pathToFileURL(path.join(path.dirname(path.dirname(path.dirname(pkg))), 'resolve-anchor.mjs')).href;
  }
  return globalParent;
}

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && /^playwright(-core)?(\/|$)/.test(specifier)) {
      return next(specifier, { ...context, parentURL: parentFor() });
    }
    throw e;
  }
}
