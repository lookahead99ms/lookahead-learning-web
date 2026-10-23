import { highlightLearningCode, highlightStudioSource } from './focus-studio/code-presentation';
import { wrapCodeLines } from './learning-code';

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

  describe('wrapCodeLines', () => {
    it('wraps every source line in a code-line span and keeps the text intact', () => {
      const source = 'def title():\n    return "<tag>"\n';
      const target = document.createElement('code');
      target.innerHTML = wrapCodeLines(highlightLearningCode(source, 'python'));
      expect(target.textContent).toBe(source);
      expect(target.querySelectorAll(':scope > .code-line').length).toBe(3);
      expect(target.querySelector('.code-line .syntax-keyword')?.textContent).toBe('def');
    });
    it('closes a highlight span at the end of a line and reopens it on the next, so no span crosses a line', () => {
      const html = wrapCodeLines('<span class="syntax-string">"a\nb"</span> x');
      const target = document.createElement('code');
      target.innerHTML = html;
      expect(target.textContent).toBe('"a\nb" x');
      const lines = Array.from(target.querySelectorAll(':scope > .code-line'));
      expect(lines.map((line) => line.querySelector('.syntax-string')?.textContent)).toEqual(['"a', 'b"']);
      expect(lines[1].textContent).toBe('b" x');
    });
    it('leaves plain text with no spans as one code-line per line', () => {
      expect(wrapCodeLines('a\nb')).toBe('<span class="code-line">a</span>\n<span class="code-line">b</span>');
    });
  });
});
