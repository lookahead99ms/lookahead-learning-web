import { previewManifestUrl } from '../../core/author-preview-config';
export { AUTHOR_PREVIEWS_BASE_URL, previewManifestUrl } from '../../core/author-preview-config';

export interface PreviewEntry {
  id: string;
  group: string;
  title: string;
  status: string;
  selectionLabel: string;
  note: string;
  available: boolean;
  links: { label: string; href: string }[];
}

export interface PreviewCollection {
  id: string;
  title: string;
  order: number;
  summary: string;
  featuredReason: string;
  chronologyNote: string;
  featured: PreviewEntry;
  history: PreviewEntry[];
}

export function parsePreviewCollections(
  value: unknown,
  entries: PreviewEntry[],
): PreviewCollection[] {
  const raw = (value as { collections?: unknown[] })?.collections;
  if (!Array.isArray(raw)) throw new Error('Preview collections are unavailable');
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
  const claimedEntries = new Set<string>(),
    collectionIds = new Set<string>(),
    orders = new Set<number>();
  const collections = raw.map((item) => {
    const collection = item as {
      id: string;
      title: string;
      order: number;
      summary: string;
      featuredReason: string;
      featuredEntryId: string;
      historyEntryIds: string[];
      chronology: { basis: string; note: string };
    };
    if (
      !collection ||
      !(['id', 'title', 'summary', 'featuredReason'] as const).every(
        (key) => typeof collection[key] === 'string',
      ) ||
      !collection.id ||
      !collection.title ||
      collectionIds.has(collection.id) ||
      !Number.isInteger(collection.order) ||
      orders.has(collection.order) ||
      collection.chronology?.basis !== 'curated-review-order' ||
      typeof collection.chronology.note !== 'string' ||
      !Array.isArray(collection.historyEntryIds)
    )
      throw new Error('Invalid preview collection');
    const resolveEntry = (id: string) => {
      const entry = entryMap.get(id);
      if (!entry || claimedEntries.has(id))
        throw new Error('Invalid or duplicate collection membership');
      claimedEntries.add(id);
      return entry;
    };
    collectionIds.add(collection.id);
    orders.add(collection.order);
    return {
      id: collection.id,
      title: collection.title,
      order: collection.order,
      summary: collection.summary,
      featuredReason: collection.featuredReason,
      chronologyNote: collection.chronology.note,
      featured: resolveEntry(collection.featuredEntryId),
      history: collection.historyEntryIds.map(resolveEntry),
    };
  });
  if (claimedEntries.size !== entries.length)
    throw new Error('Incomplete preview collection membership');
  return collections.sort((a, b) => a.order - b.order);
}

export function parsePreviewInventory(value: unknown, base: string): PreviewEntry[] {
  const manifestPath = previewManifestUrl(base);
  const data = value as { schemaVersion?: string; urlBase?: string; entries?: unknown[] };
  if (
    !manifestPath ||
    data?.schemaVersion !== 'author-previews/v1' ||
    data.urlBase !== 'manifest-directory' ||
    !Array.isArray(data.entries)
  ) {
    throw new Error('Unsupported preview inventory');
  }
  const manifest = new URL(manifestPath, 'https://preview.invalid');
  const ids = new Set<string>();
  return data.entries.map((raw) => {
    const entry = raw as PreviewEntry & {
      selection?: { state: 'selected' | 'proposed' | 'reference'; reason: string };
    };
    if (
      !entry ||
      !(['id', 'group', 'title', 'status'] as const).every(
        (key) => typeof entry[key] === 'string' && entry[key].trim(),
      ) ||
      ids.has(entry.id) ||
      typeof entry.available !== 'boolean' ||
      !Array.isArray(entry.links)
    ) {
      throw new Error('Invalid preview entry');
    }
    ids.add(entry.id);
    const links = entry.links.map((link) => {
      if (typeof link.label !== 'string' || !link.label.trim() || typeof link.href !== 'string')
        throw new Error('Invalid preview link');
      // A single leading slash denotes the private tree root in this contract.
      // Already-prefixed URLs stay intact; protocol-relative origins are rejected below.
      const href =
        link.href.startsWith('/') && !link.href.startsWith('//') && !link.href.startsWith(base)
          ? `${base}${link.href.slice(1)}`
          : link.href;
      const url = new URL(href, manifest);
      if (
        url.origin !== manifest.origin ||
        !url.pathname.startsWith(base) ||
        /%2f|%5c|%2e|%25/i.test(url.pathname) ||
        url.username ||
        url.password
      )
        throw new Error('Preview link outside configured mount');
      return { label: link.label, href: `${url.pathname}${url.search}${url.hash}` };
    });
    return {
      id: entry.id,
      group: entry.group,
      title: entry.title,
      status: entry.status,
      selectionLabel: entry.selection?.state
        ? entry.selection.state[0].toUpperCase() + entry.selection.state.slice(1)
        : entry.status,
      note: typeof entry.note === 'string' ? entry.note : '',
      available: entry.available,
      links: entry.available ? links : [],
    };
  });
}
