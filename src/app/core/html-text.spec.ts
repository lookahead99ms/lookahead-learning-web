import { describe, expect, it } from 'vitest';
import { htmlText } from './html-text';

describe('htmlText', () => {
  it('reads nested markup and decodes named and numeric entities once', () => {
    expect(htmlText('<strong>A &amp; B</strong> &lt; C &#39;x&#39; &#x2192;')).toBe("A & B < C 'x' →");
    expect(htmlText('&amp;lt;img&amp;gt;')).toBe('&lt;img&gt;');
  });

  it('parses quoted tag delimiters and malformed markup without regex stripping', () => {
    expect(htmlText('<span title="a > b">sorted</span> <b>array')).toBe('sorted array');
  });

  it('excludes executable and non-rendered content and never attaches parsed nodes', () => {
    const before = document.body.innerHTML;
    expect(htmlText('<script>throw new Error("executed")</script><style>body{display:none}</style><template>hidden</template><img src="x" onerror="alert(1)">Visible')).toBe('Visible');
    expect(document.body.innerHTML).toBe(before);
  });

  it('keeps encoded markup as literal text', () => {
    expect(htmlText('&lt;img src=x onerror=alert(1)&gt;')).toBe('<img src=x onerror=alert(1)>');
  });
});
