import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

/**
 * DLV-968 (owner decision 2026-11-06): every cross-repository contract lives only in the Content repository under
 * docs/contracts/. No other repository keeps a copy. This script fetches the masters the Web tests read from Content's
 * main branch, read-only, into the git-ignored directory scripts/release/contracts/:
 * - web-content-paths.json: read by scripts/release/web-content-paths.test.mjs (npm run test:content-paths);
 * - domain-api-v1.json: read by scripts/release/check-gateway-contract.mjs (npm run test:gateway-contract).
 *
 * Credentials, in order: CONTENT_READ_TOKEN (the Actions secret, a fine-grained token with Contents: read on the
 * Content repository), GH_TOKEN, or, when neither is set, the developer's own `gh` login through `gh api`.
 * The token is sent as a bearer header and never printed. Node built-ins only, so CI runs it before `npm ci`.
 *
 * Usage: node scripts/release/fetch-contracts.mjs [--directory <dir>]      (also: npm run contracts:fetch)
 */
export const CONTENT_REPOSITORY = 'lookahead99ms/lookahead-learning-content';
export const CONTENT_BRANCH = 'main';
export const CONTENT_CONTRACTS_PATH = 'docs/contracts';
export const CONTRACTS_DIRECTORY = 'scripts/release/contracts';
export const CONTRACT_FILES = ['web-content-paths.json', 'domain-api-v1.json'];
export const RAW_ACCEPT = 'application/vnd.github.raw+json';
export const FETCH_COMMAND = 'npm run contracts:fetch';

/** The repository root: this file lives at scripts/release/. */
export const WEB_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** The GitHub contents API route of one master file, without the host (what `gh api` takes). */
export function contractRoute(name) {
  return `repos/${CONTENT_REPOSITORY}/contents/${CONTENT_CONTRACTS_PATH}/${name}?ref=${CONTENT_BRANCH}`;
}

/** The full URL of one master file. */
export function contractUrl(name) {
  return `https://api.github.com/${contractRoute(name)}`;
}

/** Where one fetched file lives under a Web root. */
export function contractFile(name, webRoot = WEB_ROOT) {
  return join(resolve(webRoot), ...CONTRACTS_DIRECTORY.split('/'), name);
}

/** The one sentence a test prints when its fetched file is absent. */
export function missingContractMessage(name) {
  return `${CONTRACTS_DIRECTORY}/${name} is missing; run \`${FETCH_COMMAND}\` to fetch the contracts from the Content repository.`;
}

/** The credential to use: the Actions secret first, then GH_TOKEN, else null (use the developer's gh login). */
export function readToken(env = process.env) {
  for (const key of ['CONTENT_READ_TOKEN', 'GH_TOKEN']) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() !== '') return { key, token: value.trim() };
  }
  return null;
}

/** The error a failed fetch raises: names the file, what happened and the fix; never carries the token. */
export class ContractFetchError extends Error {
  constructor(name, reason, fix) {
    super(`Could not fetch ${CONTENT_CONTRACTS_PATH}/${name} from ${CONTENT_REPOSITORY} ${CONTENT_BRANCH} (${reason}). Fix: ${fix}`);
    this.name = 'ContractFetchError';
    this.contract = name;
  }
}

const TOKEN_FIX = (key) => `check that the file exists on Content ${CONTENT_BRANCH} and that ${key} is a fine-grained token with Contents: read on ${CONTENT_REPOSITORY}.`;
const GH_FIX = `sign in with \`gh auth login\` using an account that can read ${CONTENT_REPOSITORY}, or set CONTENT_READ_TOKEN to a fine-grained token with Contents: read on it.`;

/** One line of an error text, cut short, with the credential replaced should anything echo it. */
function shortReason(text, token = null) {
  let line = String(text ?? '').split('\n').map((part) => part.trim()).find((part) => part !== '') ?? '';
  if (token) line = line.split(token).join('[redacted]');
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

/** Fetch one master with a bearer token; the returned text is the raw file. */
export async function fetchWithToken(name, credential, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(contractUrl(name), {
      headers: { Accept: RAW_ACCEPT, Authorization: `Bearer ${credential.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch (error) {
    throw new ContractFetchError(name, `network error: ${shortReason(error?.message, credential.token)}`, `check the network, then ${TOKEN_FIX(credential.key)}`);
  }
  if (!response.ok) {
    let detail = '';
    try { detail = shortReason(JSON.parse(await response.text())?.message, credential.token); } catch { detail = ''; }
    throw new ContractFetchError(name, `HTTP ${response.status}${detail ? `: ${detail}` : ''}`, TOKEN_FIX(credential.key));
  }
  return response.text();
}

/** Fetch one master through the developer's own `gh` login. */
export async function fetchWithGh(name, exec = promisify(execFile)) {
  try {
    const { stdout } = await exec('gh', ['api', '-H', `Accept: ${RAW_ACCEPT}`, contractRoute(name)], { maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    if (error?.code === 'ENOENT') throw new ContractFetchError(name, 'the GitHub CLI `gh` is not installed', `install gh and ${GH_FIX}`);
    throw new ContractFetchError(name, `gh api failed: ${shortReason(error?.stderr) || shortReason(error?.message) || 'no output'}`, GH_FIX);
  }
}

/** A fetched master must be a JSON object; anything else is a wrong route or an API error page. */
export function checkContractText(name, text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new ContractFetchError(name, 'the answer is not JSON', 'check that the file on Content main is well formed; the fetch asked for the raw file.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ContractFetchError(name, 'the answer is not a JSON object', 'check the file on Content main.');
  return text.endsWith('\n') ? text : `${text}\n`;
}

/**
 * Fetch every master the Web needs into the contracts directory. Returns the written files. Throws the first
 * ContractFetchError; the message names the file and the fix and never carries a credential.
 */
export async function fetchContracts({ env = process.env, directory = null, webRoot = WEB_ROOT, fetchImpl = globalThis.fetch, exec, log = console.log, files = CONTRACT_FILES } = {}) {
  const credential = readToken(env);
  const target = directory ? resolve(directory) : join(resolve(webRoot), ...CONTRACTS_DIRECTORY.split('/'));
  await mkdir(target, { recursive: true });
  log(`Fetching ${files.length} contract(s) from ${CONTENT_REPOSITORY} ${CONTENT_BRANCH} with ${credential ? credential.key : 'the gh login'} into ${target}`);
  const written = [];
  for (const name of files) {
    const text = checkContractText(name, credential ? await fetchWithToken(name, credential, fetchImpl) : await fetchWithGh(name, exec));
    const file = join(target, name);
    await writeFile(file, text);
    written.push(file);
    log(`  ${CONTENT_CONTRACTS_PATH}/${name} -> ${CONTRACTS_DIRECTORY}/${name} (${Buffer.byteLength(text)} bytes)`);
  }
  return written;
}

export function parseArguments(argv) {
  const options = { directory: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--directory') { options.directory = argv[++index]; if (!options.directory) throw new Error('--directory needs a directory'); }
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

/** Run the fetch; returns the process exit code and prints to `log` / `logError`. */
export async function main(argv, { log = console.log, logError = console.error, ...options } = {}) {
  try {
    await fetchContracts({ ...parseArguments(argv), ...options, log });
    return 0;
  } catch (error) {
    logError(error instanceof ContractFetchError ? error.message : `fetch-contracts: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
