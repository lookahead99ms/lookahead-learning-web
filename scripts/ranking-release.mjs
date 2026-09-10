import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const rankingCandidatePath = 'learn/hands-on-dsa-ranking.json';
export const rankingPointerPath = 'learn/hands-on-dsa-ranking-current.json';
export const rankingReleaseDirectory = 'learn/dsa-ranking-releases';
export const rankingDigest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const validRankingVersion = (version) =>
  typeof version === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(version);

export async function readRankingPlan(contentRoot) {
  let pointerBytes;
  try {
    pointerBytes = await readFile(join(contentRoot, rankingPointerPath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      const candidate = JSON.parse(await readFile(join(contentRoot, rankingCandidatePath), 'utf8'));
      if (candidate.status !== 'candidate') {
        throw new Error('A released DSA ranking requires a verified current pointer');
      }
      return candidate;
    } catch (candidateError) {
      if (candidateError.code === 'ENOENT') return null;
      throw candidateError;
    }
  }
  const pointer = JSON.parse(pointerBytes);
  if (pointer.schemaVersion !== 'dsa-ranking-current/v1' ||
      !validRankingVersion(pointer.rankingVersion) ||
      !/^[a-f0-9]{64}$/.test(pointer.sha256)) {
    throw new Error('Invalid DSA ranking release pointer');
  }
  const bytes = await readFile(join(contentRoot, rankingReleaseDirectory, `${pointer.rankingVersion}.json`));
  if (rankingDigest(bytes) !== pointer.sha256) throw new Error('DSA ranking release digest mismatch');
  const release = JSON.parse(bytes);
  if (release.status !== 'released' || release.rankingVersion !== pointer.rankingVersion) {
    throw new Error('DSA ranking release identity mismatch');
  }
  return release;
}

export async function removePrivateRankingAssets(contentRoot) {
  await rm(join(contentRoot, rankingCandidatePath), { force: true });
  await rm(join(contentRoot, rankingPointerPath), { force: true });
  await rm(join(contentRoot, rankingReleaseDirectory), { recursive: true, force: true });
}
