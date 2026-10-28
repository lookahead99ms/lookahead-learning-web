import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function releaseMetadata(env = process.env) {
  const version = env.LOOKAHEAD_RELEASE_VERSION;
  if (!version || version === 'dev') return null;
  const match = /^v(\d{4})\.(\d{2})\.(\d{2})\.(\d{2})\.(\d{2}|[1-9]\d{2,})$/.exec(version);
  const revision = env.LOOKAHEAD_SOURCE_REVISION;
  if (!match || !/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Invalid release metadata');
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 13) !== `${match[1]}-${match[2]}-${match[3]}T${match[4]}`) {
    throw new Error('Invalid release UTC date');
  }
  // DLV-914: releaseTag is the calendar Git tag the pipeline cut (same value as releaseVersion, named for operators).
  return { app: 'web', releaseVersion: version, releaseTag: version, buildVersion: version.slice(1), revision };
}

export async function writeReleaseMetadata(directory, env = process.env) {
  const value = releaseMetadata(env);
  if (value) await writeFile(join(directory, 'release.json'), `${JSON.stringify(value)}\n`, { flag: 'wx' });
}
