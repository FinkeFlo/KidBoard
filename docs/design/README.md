# Design hand-off (Claude Design)

This folder receives the visual design for KidBoard. Until it lands, the app uses a
**placeholder theme** (neutral, WCAG-AA-compliant tokens) so that all screens work and can be
tested; swapping in the final design must not require component changes.

## What to place here

- **Design tokens** - colors (incl. child colors, night mode), type scale, spacing, radii,
  shadows, motion durations. Delivered as a JSON/Markdown table or CSS variables.
- **Screens at 1280x800** (primary tablet) and a large variant (2000x1200): day view, week
  view, night mode, empty state, offline/stale state, countdown. PNG/SVG exports.
- **Component specs** - event card, meal card, child chip/avatar, countdown badge, band
  headers, navigation; sizes, states, touch targets (>= 64 px for child interactions).
- Notes on icons/emoji rendering (see ADR-0009) and `prefers-reduced-motion` behavior.

## How tokens map into the code

1. Tokens become CSS custom properties in `apps/web/src/styles/tokens.css`
   (e.g. `--color-surface`, `--color-child-1`, `--radius-card`, `--space-4`).
2. `tokens.css` variables are exposed to Tailwind 4 through the `@theme` block, so utilities
   such as `bg-surface` or `rounded-card` resolve to the tokens.
3. Components use only these tokens - no raw hex colors in components (CLAUDE.md rule).
4. Child colors come from `config.children[].color`; token names (e.g. `child-1`) or CSS
   colors are both allowed.

Changing the design later means editing `tokens.css` (and the `@theme` mapping), not the
components. Open a `docs(plan)` change if the hand-off requires new tasks.
