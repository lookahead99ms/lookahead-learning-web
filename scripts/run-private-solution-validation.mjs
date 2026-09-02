import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const toolPath = resolve('private-content/tools/validate-pattern-solutions.mjs');

try {
  await access(toolPath);
} catch {
  throw new Error(
    'Private solution validation is unavailable. Restore the authorized private-content/tools directory.',
  );
}

await import(pathToFileURL(toolPath).href);
