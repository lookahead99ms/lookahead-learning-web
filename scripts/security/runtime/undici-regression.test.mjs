import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('excessive content encodings and a truncated response cannot crash the fetch caller', () => {
  // GHSA-xjj6-f33q-929c: catching fetch rejection must also contain stream errors.
  // Isolate the request so an affected dependency fails this test, not the runner.
  const script = `
    import assert from 'node:assert/strict';
    import net from 'node:net';
    import { fetch } from 'undici';
    const server = net.createServer(socket => socket.once('data', () => socket.end(
      'HTTP/1.1 200 OK\\r\\nContent-Length: 42\\r\\n' +
      'Content-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\\r\\n' +
      'Connection: close\\r\\n\\r\\n'
    )));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await assert.rejects(fetch('http://127.0.0.1:' + server.address().port + '/'), TypeError);
      // Let the subsequent stream/socket error surface after fetch rejects.
      await new Promise(resolve => setTimeout(resolve, 100));
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
    console.log('rejection contained');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('../../../', import.meta.url), encoding: 'utf8', timeout: 10_000,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rejection contained/);
});
