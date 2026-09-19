import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const version = '8.30.1';
const platforms = {
  'linux-x64': ['linux_x64', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
  'darwin-arm64': ['darwin_arm64', 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'],
};
try {
  const platform = platforms[`${process.platform}-${process.arch}`];
  if (!platform) throw new Error('Unsupported scanner platform');
  const destination = resolve('.codex-scratch/security/tools');
  mkdirSync(destination, { recursive: true });
  const archive = resolve(destination, 'gitleaks.tar.gz');
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${platform[0]}.tar.gz`;
  const download = spawnSync('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--max-time', '120', url, '--output', archive], { encoding: 'utf8' });
  if (download.status !== 0) throw new Error('Scanner download failed');
  if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== platform[1]) throw new Error('Scanner checksum mismatch');
  const unpack = spawnSync('tar', ['-xzf', archive, '-C', destination, 'gitleaks'], { encoding: 'utf8' });
  if (unpack.status !== 0) throw new Error('Scanner unpack failed');
  chmodSync(resolve(destination, 'gitleaks'), 0o755);
  console.log(`Verified Gitleaks ${version} archive and installed the scanner locally.`);
} catch {
  console.error('Secret scanner installation failed. No scan was performed.');
  process.exitCode = 1;
}
