import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateReviewBundle } from './review-eligibility.mjs';

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));

export function parseReviewOptions(args) {
  const options = { input: null, output: null, check: false };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--check') {
      options.check = true;
      continue;
    }
    if (!['--input', '--output'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[flag.slice(2)] = value;
  }
  if (!options.input) throw new Error('--input is required');
  if (!options.output) throw new Error('--output is required');
  return options;
}

export function requirePrivateReviewOutput(path, publicRoot = repositoryRoot) {
  const output = resolve(path);
  const root = resolve(publicRoot);
  if (output === root || output.startsWith(`${root}${sep}`)) {
    throw new Error('Write review reports outside the public web repository.');
  }
  return output;
}

async function main() {
  const options = parseReviewOptions(process.argv.slice(2));
  const input = await realpath(resolve(options.input));
  const bundle = JSON.parse(await readFile(input, 'utf8'));
  const report = evaluateReviewBundle(bundle);
  const output = requirePrivateReviewOutput(options.output);
  await mkdir(dirname(output), { recursive: true });
  const physicalParent = await realpath(dirname(output));
  requirePrivateReviewOutput(resolve(physicalParent, relative(dirname(output), output)));
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${report.summary.publicEligible}/${report.summary.items} items are publicly eligible; report: ${output}\n`,
  );
  if (options.check && report.summary.blocked > 0) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
