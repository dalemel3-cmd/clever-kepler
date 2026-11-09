// Lets a test's `import 'playwright'` find a Playwright installed only globally (the Claude
// cloud container: NODE_PATH covers it, but ES modules ignore NODE_PATH). Usage:
//   node --import ./tests/lib/pw-resolve.mjs tests/x.js
// Not needed where `npm i --no-save playwright` was run in the repo.
import { register } from 'node:module';
register('./pw-hooks.mjs', import.meta.url);
