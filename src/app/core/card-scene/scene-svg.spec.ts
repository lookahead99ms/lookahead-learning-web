import { sanitizeSceneSvg } from './scene-svg';

const svg = (body: string, attributes = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 320 180" ${attributes}>${body}</svg>`;

describe('sanitizeSceneSvg', () => {
  it('keeps scene styles, shapes and local references', () => {
    const result = sanitizeSceneSvg(
      svg(
        '<style>.res-a{fill:var(--scene-accent);animation:res-k 6s infinite -3s}@keyframes res-k{to{opacity:0}}</style>' +
          '<defs><linearGradient id="g"/></defs><rect class="res-a" fill="url(#g)"/><use href="#g"/>',
      ),
    )!;

    expect(result.querySelector('style')?.textContent).toContain('var(--scene-accent)');
    expect(result.querySelector('rect')?.getAttribute('fill')).toBe('url(#g)');
    expect(result.querySelector('use')?.getAttribute('href')).toBe('#g');
  });

  it('drops scripts, foreignObject and event handler attributes', () => {
    const result = sanitizeSceneSvg(
      svg(
        '<script>alert(1)</script><foreignObject><div>hi</div></foreignObject>' +
          '<rect onclick="alert(1)" onmouseover="x()" width="5"/>',
        'onload="alert(1)"',
      ),
    )!;

    expect(result.querySelector('script')).toBeNull();
    expect(result.querySelector('foreignObject')).toBeNull();
    expect(result.getAttribute('onload')).toBeNull();
    expect(result.querySelector('rect')?.getAttribute('onclick')).toBeNull();
    expect(result.querySelector('rect')?.getAttribute('onmouseover')).toBeNull();
    expect(result.querySelector('rect')?.getAttribute('width')).toBe('5');
  });

  it('removes non-local links and external url() values', () => {
    const result = sanitizeSceneSvg(
      svg(
        '<style>@import url(https://evil.example/a.css);.a{background:url(https://evil.example/x.png)}</style>' +
          '<a href="https://evil.example"><text>t</text></a>' +
          '<image xlink:href="https://evil.example/x.png"/>' +
          '<use href="javascript:alert(1)"/>' +
          '<rect style="fill:url(http://evil.example/p)"/>' +
          '<set attributeName="href" to="javascript:alert(1)"/>',
      ),
    )!;
    const markup = result.outerHTML;

    expect(markup).not.toContain('evil.example');
    expect(markup).not.toContain('javascript:');
    expect(result.querySelector('style')?.textContent).not.toContain('@import');
    expect(result.querySelector('set')).toBeNull();
  });

  it('allows only complete local fragments and rejects escaped CSS tokens', () => {
    const result = sanitizeSceneSvg(svg(
      '<rect id="bad" fill="url( javaSCRIPT:alert )"/>' +
      '<rect id="fragment" fill="url(#gradient)"/>' +
      '<use href="#gradient extra"/>' +
      '<style>.a{fill:u\\72l(https://evil.example/p)}</style>',
    ))!;
    expect(result.querySelector('#bad')?.getAttribute('fill')).toBe('none');
    expect(result.querySelector('#fragment')?.getAttribute('fill')).toBe('url(#gradient)');
    expect(result.querySelector('use')?.hasAttribute('href')).toBe(false);
    expect(result.querySelector('style')?.textContent).toBe('');
  });

  it('hides the SVG from assistive technology because the card carries the label', () => {
    const result = sanitizeSceneSvg(
      svg('<rect/>', 'role="img" aria-label="Scene" width="320" height="180"'),
    )!;

    expect(result.getAttribute('aria-hidden')).toBe('true');
    expect(result.getAttribute('role')).toBeNull();
    expect(result.getAttribute('aria-label')).toBeNull();
    expect(result.getAttribute('width')).toBeNull();
  });

  it('prepares card drawing words for the shared card text styling', () => {
    const result = sanitizeSceneSvg(
      svg(
        '<style>.cs-t{font:700 16px system-ui,sans-serif;fill:var(--scene-ink,#102a33)}' +
          '.cs-m{font-family:ui-monospace,Menlo,monospace;fill:var(--scene-ink,#102a33)}</style>' +
          '<text id="word" class="cs-t">window slides along</text>' +
          '<text id="code" class="cs-m">ByteBuffer</text>' +
          '<text id="attr" font-family="Menlo, monospace">GET</text>' +
          '<g style="fill:var(--scene-muted,#536970)" font-family="ui-monospace"><text id="kid">Madrid</text></g>' +
          '<g fill="var(--scene-good,#1f7a4d)"><text id="good">Saved</text></g>' +
          '<text id="white" fill="#fff">7</text>',
      ),
      undefined,
      { cardText: true },
    )!;
    const text = (id: string) => result.querySelector(`#${id}`)!;

    expect(text('word').hasAttribute('data-scene-code')).toBe(false);
    expect(text('word').hasAttribute('fill')).toBe(false);
    expect(text('code').hasAttribute('data-scene-code')).toBe(true);
    expect(text('attr').hasAttribute('data-scene-code')).toBe(true);
    // A group's ink moves onto its text so the card text colour can replace it there.
    expect(text('kid').hasAttribute('data-scene-code')).toBe(true);
    expect(text('kid').getAttribute('fill')).toBe('var(--scene-muted,#536970)');
    // Status colours and light text on a filled shape are left alone.
    expect(text('good').hasAttribute('fill')).toBe(false);
    expect(text('white').getAttribute('fill')).toBe('#fff');
    expect(text('white').hasAttribute('data-scene-on-fill')).toBe(true);
    expect(text('good').hasAttribute('data-scene-on-fill')).toBe(false);
    // Node values and single marks keep their drawn colour; words do not.
    expect(text('white').hasAttribute('data-scene-mark')).toBe(true);
    expect(text('word').hasAttribute('data-scene-mark')).toBe(false);
    expect(text('attr').hasAttribute('data-scene-mark')).toBe(false);
  });

  it('leaves text in other scenes untouched', () => {
    const result = sanitizeSceneSvg(
      svg('<g fill="var(--scene-ink)"><text font-family="Menlo">a</text></g>'),
    )!;
    const text = result.querySelector('text')!;

    expect(text.hasAttribute('data-scene-code')).toBe(false);
    expect(text.hasAttribute('fill')).toBe(false);
  });

  it('rejects text that is not an SVG document', () => {
    expect(sanitizeSceneSvg('')).toBeNull();
    expect(sanitizeSceneSvg('<html><body>nope</body></html>')).toBeNull();
    expect(sanitizeSceneSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>')).toBeNull();
  });
});
