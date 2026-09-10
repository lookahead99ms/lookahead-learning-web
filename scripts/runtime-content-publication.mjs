import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Every process that writes one runtime destination uses the same exclusive lock.
// Do not steal an old-looking lock: a slow generator may still own it.
export async function withRuntimePublicationLock(lockPath, action, { timeoutMs = 120000 } = {}) {
  await mkdir(dirname(lockPath), { recursive: true });
  const startedAt = Date.now();
  let handle;
  while (!handle) {
    try {
      handle = await open(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt >= timeoutMs) {
        const owner = await readFile(lockPath, 'utf8').catch(() => 'owner unavailable');
        throw new Error(
          `Runtime sync is still locked at ${lockPath} (${owner.trim()}). Check that owner before removing a stale lock.`,
        );
      }
      await delay(100);
    }
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    await handle.close();
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(lockPath, { force: true });
    throw error;
  }
  const releaseOnExit = () => {
    try {
      unlinkSync(lockPath);
    } catch {
      /* Already released. */
    }
  };
  const interrupt = () => {
    releaseOnExit();
    process.exit(130);
  };
  const terminate = () => {
    releaseOnExit();
    process.exit(143);
  };
  process.once('exit', releaseOnExit);
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  try {
    return await action();
  } finally {
    process.removeListener('exit', releaseOnExit);
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    await rm(lockPath, { force: true });
  }
}

// The stage is complete before publication. Directory rename preserves a normal
// public/content tree (no public symlink to a proprietary source or scratch tree).
// Two renames are required on portable Node; readers may observe a brief gap.
export async function publishRuntimeDirectory(stageRoot, destinationRoot, backupRoot) {
  await mkdir(dirname(destinationRoot), { recursive: true });
  let backedUp = false;
  try {
    await rename(destinationRoot, backupRoot);
    backedUp = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    await rename(stageRoot, destinationRoot);
  } catch (error) {
    if (backedUp) await rename(backupRoot, destinationRoot);
    throw error;
  }
  if (backedUp) await rm(backupRoot, { recursive: true, force: true });
}
