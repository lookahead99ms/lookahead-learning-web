export const authorWorkspaceLinks = [
  { id: 'previews', label: 'Author Previews', href: '/author/previews' },
  { id: 'delivery', label: 'Delivery Plan', href: '/delivery-plan' },
] as const;

export const authorDocumentationLinks = [
  { id: 'architecture', label: 'Architecture', href: '/author/architecture' },
  {
    id: 'local-development',
    label: 'Local setup & development',
    href: '/author/local-development',
  },
  { id: 'api', label: 'API reference', href: '/author/api' },
  { id: 'operations', label: 'Operations', href: '/author/operations' },
] as const;

export function isAuthorDocumentationRoute(url: string): boolean {
  const path = url.split(/[?#]/, 1)[0];
  return authorDocumentationLinks.some((page) => page.href === path);
}
