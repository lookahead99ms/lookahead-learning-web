# Platform theme

All Angular learner and author routes inherit the same semantic tokens from
`src/styles.css`: Harbor Light uses teal actions and pale green-gray surfaces;
Midnight & Apricot Dark uses navy surfaces and apricot actions. Links stay blue.
The shared header's Light / Dark selection applies across navigation and is
restored by `PlatformThemeService` using the existing preference behavior.

Use `--surface-page`, `--surface`, `--surface-muted` and `--surface-accent` for
backgrounds, `--text-strong`, `--text-body` and `--text-subtle` for text,
`--accent-strong` / `--accent-on-primary` for filled actions, `--accent-link` for
links and `--accent-focus` for keyboard focus. Tonal panels can use
`--platform-surface-soft`, `--platform-edge` and `--platform-shadow`. Do not
define a competing page palette. Component layout, spacing and control geometry
remain independent of color mode.

Success, warning and error colors retain their semantic roles. Path colors are
limited to text and small markers. Named code-editor themes, syntax colors,
original logos and historical design previews are intentionally independent.
The homepage keeps its engineering grid and original five slides, inheriting
the palette instead of overriding it.

Private embedded Architecture, API reference, Operations and Local Setup
documents have separate build-time templates; their maintained sources mirror
these colors and use the existing `theme` query parameter. Regenerate and publish
them through their documented private-content workflows. Historical review
packets remain immutable. An Angular hot reload does not republish documents.

## Verification

```sh
node --test scripts/theme-contrast.test.mjs
npm test -- --watch=false '--include=src/app/core/platform-theme.spec.ts' '--include=src/app/core/platform-header/*.spec.ts'
npm run build:ci
npm run build:protected
```

The contrast check measures solid semantic foreground/background pairs at 4.5:1
for normal text and 3:1 for focus rings. It does not certify rendered overlays,
opacity, editor themes or all accessibility requirements.

On the working local frontend, check `/`, `/learn`, `/grow`, `/look-ahead`,
`/search`, `/study-plan`, `/sign-in`, and authorized account/Author pages in both
modes. Navigate between routes, reload, open menus, focus controls using the
keyboard and inspect selected, empty, disabled and error states. Compare desktop
and phone widths, native zoom and reduced motion. Preserve the existing access
checks when validating protected pages. Stable artifacts require their separate
reviewed promotion; changing source does not replace them.
