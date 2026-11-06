import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CONTENT_BRANCH, CONTENT_REPOSITORY, CONTRACTS_DIRECTORY, CONTRACT_FILES, ContractFetchError, FETCH_COMMAND, RAW_ACCEPT, WEB_ROOT,
  checkContractText, contractFile, contractRoute, contractUrl, fetchContracts, fetchWithGh, fetchWithToken, main, missingContractMessage,
  parseArguments, readToken,
} from './fetch-contracts.mjs';

const SECRET = 'github_pat_synthetic_never_printed_0123456789';
const MASTERS = {
  'web-content-paths.json': JSON.stringify({ schema: 'web-content-paths/v1', paths: ['/content/a.json'] }),
  'domain-api-v1.json': JSON.stringify({ schema: 'gateway-domain-contract/v1', calls: [], webPaths: ['/'] }, null, 2) + '\n',
};

/** A synthetic GitHub contents API: answers the raw file for a known route with the right token, else an error. */
function api({ token = SECRET, answers = MASTERS, failWith = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (failWith) throw failWith;
    const name = CONTRACT_FILES.find((candidate) => url === contractUrl(candidate));
    const authorized = options.headers.Authorization === `Bearer ${token}` && options.headers.Accept === RAW_ACCEPT;
    if (!name || !(name in answers)) return { ok: false, status: 404, text: async () => JSON.stringify({ message: 'Not Found', documentation_url: 'https://docs.github.com/rest' }) };
    if (!authorized) return { ok: false, status: 401, text: async () => JSON.stringify({ message: 'Bad credentials' }) };
    return { ok: true, status: 200, text: async () => answers[name] };
  };
  return { calls, fetchImpl };
}

/** A synthetic `gh api`: records the arguments and answers like the CLI (stdout) or fails like it (stderr, code). */
function gh({ answers = MASTERS, error = null } = {}) {
  const calls = [];
  const exec = async (command, args) => {
    calls.push({ command, args });
    if (error) throw error;
    const name = CONTRACT_FILES.find((candidate) => args.at(-1) === contractRoute(candidate));
    if (!name) { const failure = new Error('gh: Not Found (HTTP 404)'); failure.stderr = 'gh: Not Found (HTTP 404)\n'; failure.code = 1; throw failure; }
    return { stdout: answers[name], stderr: '' };
  };
  return { calls, exec };
}

async function scratch(run) {
  const directory = await mkdtemp(join(tmpdir(), 'lookahead-fetch-contracts-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

test('names the Content masters the Web reads and where they land', () => {
  assert.deepEqual(CONTRACT_FILES, ['web-content-paths.json', 'domain-api-v1.json']);
  assert.equal(CONTENT_REPOSITORY, 'lookahead99ms/lookahead-learning-content');
  assert.equal(CONTENT_BRANCH, 'main');
  assert.equal(contractRoute('x.json'), 'repos/lookahead99ms/lookahead-learning-content/contents/docs/contracts/x.json?ref=main');
  assert.equal(contractUrl('x.json'), 'https://api.github.com/repos/lookahead99ms/lookahead-learning-content/contents/docs/contracts/x.json?ref=main');
  assert.equal(contractFile('x.json', '/root'), join('/root', 'scripts', 'release', 'contracts', 'x.json'));
  assert.equal(contractFile('x.json'), join(WEB_ROOT, 'scripts', 'release', 'contracts', 'x.json'));
  assert.equal(CONTRACTS_DIRECTORY, 'scripts/release/contracts');
  assert.equal(FETCH_COMMAND, 'npm run contracts:fetch');
  assert.equal(missingContractMessage('x.json'), 'scripts/release/contracts/x.json is missing; run `npm run contracts:fetch` to fetch the contracts from the Content repository.');
  assert.equal(missingContractMessage('x.json').split('. ').length, 1, 'one sentence');
});

test('the git-ignored contracts directory is never committed', async () => {
  const ignore = await readFile(join(WEB_ROOT, '.gitignore'), 'utf8');
  assert(ignore.split('\n').includes('/scripts/release/contracts/'), '.gitignore lists /scripts/release/contracts/');
  const committed = await readdir(join(WEB_ROOT, 'scripts', 'release'));
  assert(!committed.includes('web-content-paths.json') && !committed.includes('domain-api-v1.json'), 'no copy next to the scripts');
});

test('picks the credential: CONTENT_READ_TOKEN, then GH_TOKEN, else the gh login', () => {
  assert.deepEqual(readToken({ CONTENT_READ_TOKEN: 'a', GH_TOKEN: 'b' }), { key: 'CONTENT_READ_TOKEN', token: 'a' });
  assert.deepEqual(readToken({ GH_TOKEN: ' b ' }), { key: 'GH_TOKEN', token: 'b' });
  assert.deepEqual(readToken({ CONTENT_READ_TOKEN: '', GH_TOKEN: 'b' }), { key: 'GH_TOKEN', token: 'b' });
  assert.equal(readToken({ CONTENT_READ_TOKEN: '   ' }), null);
  assert.equal(readToken({}), null);
});

test('fetches a master with the bearer token and the raw media type', async () => {
  const { calls, fetchImpl } = api();
  assert.equal(await fetchWithToken('web-content-paths.json', { key: 'CONTENT_READ_TOKEN', token: SECRET }, fetchImpl), MASTERS['web-content-paths.json']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, contractUrl('web-content-paths.json'));
  assert.deepEqual(calls[0].options.headers, { Accept: RAW_ACCEPT, Authorization: `Bearer ${SECRET}`, 'X-GitHub-Api-Version': '2022-11-28' });
});

test('a failed token fetch names the file, the status and the fix, never the token', async () => {
  const credential = { key: 'CONTENT_READ_TOKEN', token: SECRET };
  await assert.rejects(fetchWithToken('web-content-paths.json', { key: 'GH_TOKEN', token: 'wrong' }, api().fetchImpl), (error) => {
    assert(error instanceof ContractFetchError);
    assert.equal(error.contract, 'web-content-paths.json');
    assert.equal(error.message, 'Could not fetch docs/contracts/web-content-paths.json from lookahead99ms/lookahead-learning-content main (HTTP 401: Bad credentials). '
      + 'Fix: check that the file exists on Content main and that GH_TOKEN is a fine-grained token with Contents: read on lookahead99ms/lookahead-learning-content.');
    return true;
  });
  await assert.rejects(fetchWithToken('web-content-paths.json', credential, api({ answers: {} }).fetchImpl), /HTTP 404: Not Found\)\. Fix: check that the file exists on Content main and that CONTENT_READ_TOKEN is/);
  const htmlError = async () => ({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' });
  await assert.rejects(fetchWithToken('domain-api-v1.json', credential, htmlError), /\(HTTP 502\)\. Fix:/);
  const longMessage = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ message: 'x'.repeat(400) }) });
  await assert.rejects(fetchWithToken('domain-api-v1.json', credential, longMessage), (error) => error.message.includes('x'.repeat(157) + '...') && !error.message.includes('x'.repeat(158)));
  await assert.rejects(fetchWithToken('domain-api-v1.json', credential, api({ failWith: new TypeError('fetch failed') }).fetchImpl), /\(network error: fetch failed\)\. Fix: check the network, then check that the file exists/);
  const echoing = async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ message: `token ${SECRET} refused` }) });
  await assert.rejects(fetchWithToken('web-content-paths.json', credential, echoing), (error) => error.message.includes('HTTP 403: token [redacted] refused') && !error.message.includes(SECRET));
  await assert.rejects(fetchWithToken('web-content-paths.json', credential, api({ failWith: new Error(`boom ${SECRET}`) }).fetchImpl), (error) => error.message.includes('network error: boom [redacted]') && !error.message.includes(SECRET));
});

test('fetches a master through gh api when no token is set', async () => {
  const { calls, exec } = gh();
  assert.equal(await fetchWithGh('domain-api-v1.json', exec), MASTERS['domain-api-v1.json']);
  assert.deepEqual(calls, [{ command: 'gh', args: ['api', '-H', `Accept: ${RAW_ACCEPT}`, contractRoute('domain-api-v1.json')] }]);
  await assert.rejects(fetchWithGh('other.json', gh().exec), /\(gh api failed: gh: Not Found \(HTTP 404\)\)\. Fix: sign in with `gh auth login` using an account that can read lookahead99ms\/lookahead-learning-content, or set CONTENT_READ_TOKEN/);
  const missing = Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
  await assert.rejects(fetchWithGh('domain-api-v1.json', gh({ error: missing }).exec), /\(the GitHub CLI `gh` is not installed\)\. Fix: install gh and sign in/);
  const silent = Object.assign(new Error(''), { code: 4, stderr: '' });
  await assert.rejects(fetchWithGh('domain-api-v1.json', gh({ error: silent }).exec), /\(gh api failed: no output\)/);
});

test('refuses an answer that is not a JSON object and normalizes the final newline', () => {
  assert.equal(checkContractText('x.json', '{"a":1}'), '{"a":1}\n');
  assert.equal(checkContractText('x.json', '{"a":1}\n'), '{"a":1}\n');
  assert.throws(() => checkContractText('x.json', '<html>'), /\(the answer is not JSON\)\. Fix: check that the file on Content main is well formed/);
  assert.throws(() => checkContractText('x.json', '[]'), /\(the answer is not a JSON object\)/);
  assert.throws(() => checkContractText('x.json', 'null'), /\(the answer is not a JSON object\)/);
});

test('writes every master into the directory with the token, or with gh when there is none', () => scratch(async (directory) => {
  const lines = [];
  const { calls, fetchImpl } = api();
  const written = await fetchContracts({ env: { CONTENT_READ_TOKEN: SECRET }, directory, fetchImpl, log: (line) => lines.push(line) });
  assert.deepEqual(written, CONTRACT_FILES.map((name) => join(directory, name)));
  assert.equal(calls.length, 2);
  assert.equal(await readFile(join(directory, 'web-content-paths.json'), 'utf8'), MASTERS['web-content-paths.json'] + '\n');
  assert.equal(await readFile(join(directory, 'domain-api-v1.json'), 'utf8'), MASTERS['domain-api-v1.json']);
  assert.match(lines[0], /^Fetching 2 contract\(s\) from lookahead99ms\/lookahead-learning-content main with CONTENT_READ_TOKEN into /);
  assert.deepEqual(lines.slice(1), [
    `  docs/contracts/web-content-paths.json -> scripts/release/contracts/web-content-paths.json (${MASTERS['web-content-paths.json'].length + 1} bytes)`,
    `  docs/contracts/domain-api-v1.json -> scripts/release/contracts/domain-api-v1.json (${MASTERS['domain-api-v1.json'].length} bytes)`,
  ]);
  assert(!lines.join('\n').includes(SECRET), 'the token is never printed');
  const viaGh = gh();
  lines.length = 0;
  await fetchContracts({ env: {}, directory, exec: viaGh.exec, fetchImpl: () => { throw new Error('must not use fetch without a token'); }, log: (line) => lines.push(line) });
  assert.equal(viaGh.calls.length, 2);
  assert.match(lines[0], / with the gh login into /);
}));

test('the default directory is scripts/release/contracts under the Web root', () => scratch(async (root) => {
  const written = await fetchContracts({ env: { GH_TOKEN: SECRET }, webRoot: root, fetchImpl: api().fetchImpl, log: () => {}, files: ['domain-api-v1.json'] });
  assert.deepEqual(written, [join(root, 'scripts', 'release', 'contracts', 'domain-api-v1.json')]);
}));

test('stops at the first file that cannot be fetched', () => scratch(async (directory) => {
  const { fetchImpl } = api({ answers: { 'web-content-paths.json': MASTERS['web-content-paths.json'] } });
  await assert.rejects(fetchContracts({ env: { CONTENT_READ_TOKEN: SECRET }, directory, fetchImpl, log: () => {} }), /Could not fetch docs\/contracts\/domain-api-v1.json .*HTTP 404/);
  assert.deepEqual(await readdir(directory), ['web-content-paths.json']);
}));

test('parses the command line', () => {
  assert.deepEqual(parseArguments([]), { directory: null });
  assert.deepEqual(parseArguments(['--directory', '/x']), { directory: '/x' });
  assert.throws(() => parseArguments(['--directory']), /--directory needs a directory/);
  assert.throws(() => parseArguments(['--bogus']), /Unknown argument: --bogus/);
});

test('main prints the failure and exits 1, or exits 0 after writing', () => scratch(async (directory) => {
  const out = [];
  const errors = [];
  const logging = { log: (line) => out.push(line), logError: (line) => errors.push(line) };
  assert.equal(await main(['--directory', directory], { ...logging, env: { CONTENT_READ_TOKEN: SECRET }, fetchImpl: api().fetchImpl }), 0);
  assert.deepEqual(errors, []);
  assert.equal(out.length, 3);
  assert.equal(await main(['--directory', directory], { ...logging, env: { CONTENT_READ_TOKEN: 'wrong' }, fetchImpl: api().fetchImpl }), 1);
  assert.match(errors.at(-1), /^Could not fetch docs\/contracts\/web-content-paths.json .*HTTP 401: Bad credentials/);
  assert.equal(await main(['--bogus'], logging), 1);
  assert.equal(errors.at(-1), 'fetch-contracts: Unknown argument: --bogus');
  assert(!errors.join('\n').includes(SECRET) && !out.join('\n').includes(SECRET), 'the token is never printed');
}));
