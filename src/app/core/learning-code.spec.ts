import { highlightLearningCode, highlightStudioSource } from './focus-studio/code-presentation';

describe('shared learning code presentation', () => {
  for (const [language, source] of Object.entries({java:'class Book { String title = "<tag>"; }',python:'def title():\n    return "<tag>"',go:'func title() string { return "<tag>" }'})) {
    it(`uses the DSA parser without changing ${language} source`, () => {
      const html = highlightLearningCode(source, language);
      expect(html).toBe(highlightStudioSource(source, language as 'java' | 'python' | 'go').join('\n'));
      const target = document.createElement('code'); target.innerHTML = html;
      expect(target.textContent).toBe(source);
      expect(target.querySelector('tag')).toBeNull();
      expect(target.querySelector('.syntax-keyword')).not.toBeNull();
    });
  }
  it('preserves punctuation, comparisons, and source whitespace in other languages', () => {
    const source = 'SELECT * FROM books WHERE price <= 10;\n// <script>alert(1)</script>';
    const target = document.createElement('code'); target.innerHTML = highlightLearningCode(source, 'sql');
    expect(target.textContent).toBe(source);
    expect(target.querySelector('script')).toBeNull();
    expect(target.querySelector('.syntax-keyword')?.textContent).toBe('SELECT');
  });
});
