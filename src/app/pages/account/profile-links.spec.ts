import { displayProfileLink, normalizeProfileLink, profileLinkFields } from './profile-links';

const field = (key: string) => profileLinkFields.find((candidate) => candidate.key === key)!;

describe('profile link rules', () => {
  it('clears blank links and adds https:// to a bare address', () => {
    expect(normalizeProfileLink(field('github'), '   ')).toBeNull();
    expect(normalizeProfileLink(field('github'), ' github.com/sample-learner ')).toBe(
      'https://github.com/sample-learner',
    );
    expect(normalizeProfileLink(field('x'), 'https://twitter.com/sample')).toBe(
      'https://twitter.com/sample',
    );
    expect(normalizeProfileLink(field('website'), 'sample-portfolio.dev')).toBe(
      'https://sample-portfolio.dev',
    );
  });

  it.each([
    ['github', 'http://github.com/sample'],
    ['github', 'https://gitlab.com/sample'],
    ['github', 'https://github.com/'],
    ['github', 'https://user:secret@github.com/sample'],
    ['github', 'https://github.com:8443/sample'],
    ['linkedin', 'https://evil.example/linkedin.com/in/sample'],
    ['x', 'javascript:alert(1)'],
    ['website', 'https://localhost/portfolio'],
    ['website', 'https://192.0.2.10/'],
    ['website', 'https://sample portfolio.dev'],
    ['website', 'https://' + 'a'.repeat(300) + '.dev'],
  ])('rejects %s link %s', (key, value) => {
    expect(normalizeProfileLink(field(key), value)).toBeUndefined();
  });

  it('shows a link without its scheme or trailing slash', () => {
    expect(displayProfileLink('https://www.linkedin.com/in/sample/')).toBe(
      'www.linkedin.com/in/sample',
    );
  });
});
