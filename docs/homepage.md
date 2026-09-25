# Homepage behavior and local verification

The Angular root route `/` presents the same homepage for signed-out visitors,
learners and authors. Its links use Angular routing and existing access checks.
It does not redirect to a private preview or change account, subscription or
content access policy.

The homepage includes a fixed AI engineering headline, five original carousel
slides, Learn/Grow/Look Ahead path entries, an optional engineering challenge,
and four discovery cards. Light mode uses Harbor teal; dark mode uses Midnight
and Apricot. These homepage tokens are component-scoped and do not recolor other
routes or require a private stylesheet.

The carousel rotates every six seconds with a 420ms opacity fade. Hover, focus,
touch and manual navigation pause it until explicit Play. Reduced motion disables
autoplay and animation while keeping Previous, Next and slide selection usable.
Inactive slides are hidden from keyboard navigation and assistive technology.

The challenge uses three redistributable synthetic JavaScript examples covering
zero-valued defaults, shared-array mutation and an empty average. It shows authored
explanations rather than executing submissions or grading a learner. Prediction,
step and reflection state survive closing/reopening the challenge and changing
slides or themes, but reset when leaving/reloading the page. Try another challenge
explicitly resets that state. There is no simulated login, saved progress, server
request or private curriculum fixture in this component.

## Validate

```sh
npm test -- --watch=false '--include=src/app/pages/landing/*.spec.ts'
npm run build:ci
npm run build:protected
npm run validate:source-boundary
```

The public demo remains independently runnable using the repository's normal
`npm start` instructions. For the connected local setup, use the existing
README workflow for port 4301; no new service or configuration is required.
Open `/` in both color modes. Check the three path actions at 1440×900 and
1707×960, then a narrow phone width. Verify all five slides, explicit Play/Pause,
keyboard focus, native zoom and reduced motion. Open the challenge, predict,
step through the evidence, write a reflection, close/reopen it and switch slides;
the response must remain. Check that canonical navigation still respects access.

A stable build on port 4300 changes only when its owner updates the checkout and
rebuilds/restarts that frontend through the established process. Updating the
working Angular page on 4301 does not change the stable artifact.
