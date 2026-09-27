import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('public/assets', { recursive: true });
await build({ entryPoints: ['src/app/core/focus-studio/code-presentation.ts'], outfile: 'public/assets/code-presentation.js', bundle: true, format: 'iife', globalName: 'LookAheadCode', minify: true, target: 'es2022' });
console.log('Built shared DSA/lesson code presentation for embedded visuals.');
