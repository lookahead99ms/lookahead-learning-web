import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Read JSON only: a selected base cannot execute proxy configuration code. */
export async function loadLocalBaseProxy(repositoryRoot, configuredPath) {
  const file = resolve(repositoryRoot, configuredPath || 'proxy.conf.json');
  const proxy = JSON.parse(await readFile(file, 'utf8'));
  if (!proxy || Array.isArray(proxy) || typeof proxy !== 'object') {
    throw new Error('Local base proxy must be a JSON route map.');
  }
  for (const [path, options] of Object.entries(proxy)) {
    if (
      !(path.startsWith('/') || path.startsWith('^/')) ||
      /^\^?\/__local(?:\/|$)/.test(path) ||
      !options ||
      Array.isArray(options) ||
      typeof options !== 'object' ||
      typeof options.target !== 'string' ||
      options.router ||
      options.bypass
    ) {
      throw new Error(
        'Local base proxy must use fixed targets and leave /__local to the delivery editor.',
      );
    }
    const target = new URL(options.target);
    if (
      target.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
      target.username ||
      target.password
    ) {
      throw new Error(
        'Local base proxy targets must be HTTP loopback services without credentials.',
      );
    }
  }
  return proxy;
}

export function assertWorkingGatewayProxy(proxy) {
  const gateway = 'http://127.0.0.1:4350';
  const browserRoutes = [
    '/bff/**',
    '/oauth2/authorization/**',
    '/login/oauth2/code/**',
    '/content/**',
    '/api/**',
    '/oauth2/**',
    '/userinfo',
    '/connect/**',
    '/.well-known/**',
  ];
  for (const route of browserRoutes) {
    if (proxy[route]?.target !== gateway) {
      throw new Error(`Protected working frontend requires ${route} to use local Gateway 4350.`);
    }
  }
  return proxy;
}
