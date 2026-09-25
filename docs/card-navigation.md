# Whole-card navigation

Cards with a primary destination or action expose that action over the card's
surface. Text links and controls inside a card keep their own behavior. A card
with no destination, such as a lesson explanation, account form, unavailable
item or status panel, remains informational.

For a card with one destination and no other controls, use a native anchor around
its contents. For cards with multiple actions, use the shared styles imported
from `src/card-navigation.css`:

```html
<article class="navigation-card">
  <h3>Language foundations</h3>
  <p>Read the lesson, then practise the concepts.</p>
  <a data-card-primary href="/learn/example/lesson">Read lesson</a>
  <a href="/learn/example/practice">Practice questions</a>
</article>
```

Keep exactly one `data-card-primary` on an existing native anchor or button.
Its transparent pseudo-element covers the card; other native controls sit above
it. Use a button for an action and an anchor for navigation. Preserve accessible
names, disabled states, Angular routing and existing authorization checks.
Unavailable or disabled primary actions do not extend their hit area.

Do not add a click handler, role or tab stop to the container, nest anchors, nest
`navigation-card` containers, or position/transform/filter the primary action or
its intermediate wrappers. Those properties can change the overlay's containing
block. Keep long selectable reading content outside navigation cards.

Current consumers are Home discovery cards, Saved Study Plans, Study Desk
activities, Manage Account plan entries, learning-map subunits and Author preview
entries. Catalog, module and Search cards retain their existing native full-card
links, disclosure controls or preview actions.

## Verification

Component checks cover destinations, independent controls and unavailable states.
Browser checks must also verify the actual hit area at desktop and phone widths:

1. Click a title, description and unused card background. Each should activate
   the same primary action.
2. Follow a secondary link and activate an embedded button/disclosure. They must
   perform only their own action.
3. Tab through the card, verify visible focus, and activate links with Enter and
   buttons with Enter/Space. There must be no extra container tab stop.
4. For primary anchors, check opening the card in a new tab. For disabled or
   unavailable cards, verify background clicks do nothing.
5. Check both platform themes, narrow layouts and browser zoom. Hover and focus
   must not change the size of the hit area or cover a neighboring card.
