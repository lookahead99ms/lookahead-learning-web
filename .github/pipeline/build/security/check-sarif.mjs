import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkSarif } from './reports.mjs';

try {
  const directory = process.argv[2];
  if (!directory) throw new Error('SARIF directory is required');
  const files = readdirSync(directory).filter((file) => file.endsWith('.sarif'));
  if (files.length !== 1 || files[0] !== 'javascript.sarif') throw new Error('Expected one JavaScript/TypeScript analysis');
  const result = checkSarif(JSON.parse(readFileSync(resolve(directory, files[0]), 'utf8')));
  console.log(`CodeQL: ${result.runs} completed runs, ${result.findings} findings, ${result.blocking} blocking findings.`);
  if (result.actionable.length) console.log(JSON.stringify({ findings: result.actionable }));
  if (!result.passed) process.exitCode = 1;
} catch {
  console.error('CodeQL security gate failed: missing, malformed or incomplete analysis. No clean result is available.');
  process.exitCode = 1;
}
