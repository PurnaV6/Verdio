# Verd.io design system

This describes the system as it is built today. Source of truth: `src/app/index.css`
(tokens, `.v2-*` rules), `src/components/pages/PageParts.tsx`,
`src/components/workspace/StateMark.tsx` and `status.ts`,
`src/components/charts/` (chart kit, `useChartTheme`), `src/components/ChartRenderer.tsx`.

The look is the original Verd.io look, blue and white only: navy ink, one brand blue, a
pale blue canvas and white rounded cards with one very light shadow. IBM Plex Sans for
everything that is read, a big friendly page title ("Good morning."), pill tabs and
badges, a 232px rail with icon chips, and health shown as a ring. The product is
light-only. The user chose this look over the earlier "console" look (October 2026); see
`.claude/agents/design-rules.md` for the decisions that override the taste table.

## Palette tokens

Defined once on `:root` in `src/app/index.css`. Use the tokens, never a hex literal in a
component. The `--v-*` names are aliases of the `--vc-*` tokens, kept so older rules read
the new values.

| Token | Value | Role |
| --- | --- | --- |
| `--vc-ink` (`--v-ink`) | `#102A43` | Body text, headings |
| `--vc-muted` (`--v-muted`) | `#5B7088` | Secondary text, labels, source tags (5.1:1 on white, 4.6:1 on tint) |
| `--vc-bg` (`--v-paper`) | `#F3F7FB` | Page canvas |
| `--vc-panel` (`--v-sheet`) | `#FFFFFF` | Cards, panels, tooltips |
| `--vc-line` (`--v-rule`) | `#DCE6F0` | Card borders, row rules |
| `--vc-accent` (`--v-verd`, `--v-tide`) | `#0A66C2` | Brand blue: primary action, active nav, links, focus rings, chart line |
| `--vc-accent-2` | `#3D8FE6` | Lighter blue for chart marks. A little deeper than the brand's `#4DA3F7` so marks keep 3:1 on white |
| `--vc-accent-tint` | `#EAF3FF` | Pale blue fill: active nav item, pills, tinted boxes |
| `--vc-ok` | `#17803D` | "ok" state words and glyphs |
| `--vc-watch` | `#9A5B00` | "watch" state |
| `--vc-risk` (`--v-oxide`) | `#C0352B` | "risk" state, errors |
| `--v-verd-ink` | `#FFFFFF` | Text on a brand blue fill |

Derived tokens (mixes of the ones above, never new colours): `--vc-accent-line` (border of
tinted boxes and pills), `--vc-hover` (5% blue wash), `--vc-control-line` (border of inputs
and slider tracks, 3:1 on white), `--vc-card-shadow`, `--vc-pop-shadow` (popovers and
dialogs only), and the radius scale `--vc-r-card` 16px, `--vc-r-inner` 12px, `--vc-r-ctl`
10px, `--vc-r-pill` 999px.

Accent options: `html[data-accent="green" | "violet"]` replaces only the accent trio
(`setAccent()` in `src/lib/theme.ts`). Blue is the default; the options are never the
default. State colours never switch.

Contrast: state words are used on white or the page canvas. The one state-coloured word
that would fail on `--vc-accent-tint` (ok green, 4.48:1) is never placed on it: the story
card and the dataset cards that carry state words are white.

Chart series colours come from `useChartTheme()` / `buildChartTheme()`, which read the
`--vc-*` tokens at runtime (re-read when `data-accent` changes). Each series colour is at
least 3:1 against the panel.

## Type

Fonts are self-hosted from `public/fonts` (latin subset, `@font-face` at the top of
`index.css`, one preload in `index.html`). Nothing loads from a third-party host. No other
family is allowed (no Manrope, DM Sans or Inter).

| Variable | Family | Files | Use |
| --- | --- | --- | --- |
| `--v-font-display` | IBM Plex Sans 600 | `ibm-plex-sans-latin-600-normal.woff2` | Page titles, card headings, big figures |
| `--v-font-body` | IBM Plex Sans 400/500/600 | `ibm-plex-sans-latin-*.woff2` | Everything that is read, labels, eyebrows, state words |
| `--v-font-data` | IBM Plex Mono 400/500 | `ibm-plex-mono-latin-*.woff2` | Source names inside `.v2-tag b`, technical error detail |

Licences (SIL Open Font License 1.1) sit next to the fonts. Do not add another font
without adding its licence file and a `@font-face` rule.

Page title `.v2-view-head h1` is 30 to 40px, weight 600, tracking -0.025em. Eyebrows
(`.v2-eyebrow`) and small labels are 10.5 to 11px, weight 600, uppercase, 0.1 to 0.14em
tracking. Figures use `font-variant-numeric: tabular-nums`.

## Layout language

- Shell: fixed 232px rail (`v2-rail`, `w-[232px]` in `Sidebar.tsx`, `lg:ml-[232px]` in `App.tsx`), 64px top bar, main column `max-width: 1240px` (`.v2-view`).
- Rail: logo chip and wordmark, four groups (Workspace, Intelligence, Explore, Data, from `navigation.ts`), each item an icon chip plus label. The active item is pale blue with a blue border. A health card (score, state word, bar) and the New dataset button sit at the foot. Under 1024px the rail is a drawer with a flat ink scrim (no blur).
- Cards (`.v2-panel`, `.v2-ov-panel`, `.v2-ov-tile`, `.v2-fig`, `.v2-chart-item`, `.v2-ledger > li`, `.v2-table-wrap`, `.v2-op-verdict`, `.v2-advisor`): `--vc-panel` fill, 1px `--vc-line` border, 16px radius, `--vc-card-shadow`, 20px padding. Inner boxes (AI summary, notes, inputs) use 10 to 12px.
- Tabs and segmented choices are pills: `.v2-tabs` is a white capsule with the selected tab filled brand blue, `.v2-seg` buttons are round chips.
- Tables are real `<table>` with `th scope="row"`, inside `.v2-table-wrap`; header cells are small tracked labels.
- Buttons: `.v2-btn` (brand blue fill, 12px radius), `.v2-btn.is-quiet` (white, line border), `.is-small`, `.is-large`, `.is-block`; app controls are `.header-action`, `.v2-op-btn`.
- Story card: `StoryStrip` shows the page story as rows (what happened, why, what next, how sure) and, when the story carries a `health` fact, `HealthRing` on its right.
- No gradients, glass, blur, left colour stripes on cards, emojis, sparkle icons or decorative animation. Hover changes colour only; `prefers-reduced-motion` removes transitions.

Icons: the rail and tab chips use Lucide icons already in the code base (`Sidebar.tsx`).
No sparkle icons and no new icon library.

## State language

A state is always a word plus a shape plus a colour, never colour alone
(`StateMark.tsx`, `TONE_GLYPH` in `status.ts`):

| State | Shape | Colour | Class |
| --- | --- | --- | --- |
| ok | check | green | `.v2-state.is-ok` |
| watch | dot | amber | `.v2-state.is-watch` |
| risk | triangle | red | `.v2-state.is-risk` |
| idle (not started, not connected, pending) | hollow circle | muted | `IdleMark`, `.v2-state.is-idle` |

Use `<StateMark tone label />` or `<IdleMark label />`; the glyph is `aria-hidden`
and the word carries the meaning. Health labels come from `healthReading()` (80 / 60
thresholds). The health ring (`HealthRing.tsx`) draws the arc in brand blue for "ok" and in
the watch or risk colour otherwise, and always sits beside the state word.

## Source tags

Anything that states a fact next to a figure carries a source tag (`.v2-tag`) with the
source name in `<b>` (brand blue, Plex Mono). Rule: only show a source the app actually
knows. Tags are built from real values (file name, `sourceColumns`, the quality check,
connected datasets) and are omitted when the data is absent. Never write a placeholder
source, a made-up confidence or a figure the pipeline did not compute. The landing preview
uses figures from the built-in sample file only and says so.

## Accessibility minimums

- Text: 10.5px minimum for tracked uppercase labels, 12px for tags, 14px for body copy.
- Contrast: 4.5:1 for text, 3:1 for marks and control borders (`--vc-control-line`).
- Focus: every interactive element has a visible `:focus-visible` outline (2px brand blue), scoped per surface (`.v2-site`, `.v2-view`, `.v2-rail`, `.app-header`, `.v2-entry-shell`, `.v2-dlg-panel`, `.v2-boundary`, `.v2-tabs`, kit plots and tables).
- Controls are labelled (`aria-label`, `aria-labelledby`, real `<label>`); icons are `aria-hidden`; the current item uses `aria-current`; tabs use `role="tablist"/"tab"` with `aria-selected`; empty and loading messages use `role="status"`, errors `role="alert"`.
- Charts (`src/components/charts/kit`): keyboard stepping, a live region, and a "View this chart as a table" disclosure on every chart.
- Dialogs use `useDialogBehaviour` (focus handling, Escape).
- Usable at 375px with no horizontal scroll: `.v2-*` rules carry 860 / 640 / 480px breakpoints; wide tables scroll inside `.v2-table-wrap`.

## Naming rule and prefixes

All `.v2-*` rules live in one stylesheet and are mostly unscoped, so a class name defined
twice silently overrides itself across pages. Before adding any `.v2-` class run
`grep -n "\.v2-<name>\b" src/app/index.css` and pick another name if it exists.
State modifiers are `is-*` classes chained to a `.v2-*` class (`.v2-btn.is-quiet`).

| Prefix | Surface |
| --- | --- |
| `v2-site`, `v2-hero`, `v2-nav`, `v2-wrap`, `v2-mock-*`, `v2-land-*` | Public landing page and its product preview |
| `v2-op-*` | Operational, execution, governance and team pages |
| `v2-entry-*` | Entry flow: upload, mapping, organisation review |
| `v2-dlg-*` | Dialogs (saved analyses, export) |
| `v2-auth-*` | Sign-in and sign-up |
| `v2-boundary-*` | Error boundary fallback |
| `v2-rail-*`, `v2-header-*` | Workspace rail and top bar |
| `v2-advisor-*`, `v2-rev-*`, `v2-hub-*`, `v2-chart-*` | Advisor, Revenue, hub tabs, chart lists |
| `v2-ov-*`, `v2-ring-*` | Overview cards, story card, health ring |
| `v2-kc-*` | Chart kit |

Shared pieces without a surface prefix: `v2-view`, `v2-view-head`, `v2-eyebrow`, `v2-panel`,
`v2-fig`/`v2-figs`, `v2-ledger`, `v2-tag`, `v2-state`, `v2-btn`, `v2-tabs`, `v2-empty`.

## Adding a page

1. Create `src/components/pages/PageX.tsx` that returns `<div className="v2-view">`.
2. Start with `<PageHead eyebrow title>description</PageHead>` from `PageParts.tsx`.
3. Compose with `Figures` / `Figure` (label, value, unit, optional tone + toneLabel, optional source sub-line), `StateMark`, `IdleMark`, `InlineEmpty`; use `PageEmpty` when there is no data at all.
4. Charts: use the kit in `src/components/charts/kit`, or render `ChartRenderer` (lazy export from `workspace/lazy.ts`) inside a `.v2-chart-list` / `.v2-panel`.
5. Register the page like the existing ones: an entry in `PAGES` (`workspace/navigation.ts`, pick one of the four groups), an icon in `PAGE_ICONS` in `Sidebar.tsx`, and the `page===...` render in `App.tsx`; these ids are load-bearing. Pages render inside `<ErrorBoundary key={page}>`.
6. Only new CSS goes at the end of `index.css` under a new or existing prefix, after the grep above.

## CSS pitfalls found while building

- Unscoped duplicate names. Reusing `.v2-fig`, `.v2-ledger`, `.v2-lede`, `.v2-eyebrow` and `.v2-tag` for a second page changed the landing page. The landing's own copies are `.v2-land-ledger` and `.v2-land-tag`.
- Reset specificity. The landing reset is `:where(.v2-site) :is(h1, h2, h3, p, ul, ol) { margin: 0; padding: 0 }`. Wrapped in `:where()` it has zero specificity, so any later single-class rule wins.
- Absolutely positioned `sr-only` text inside a scrolling table wrapper widens the whole page unless the wrapper is `position: relative` (`.v2-table-wrap` is).
- A flex container turns each text node and `<i>` of `Verd<i>.</i>io` into a separate item with a gap. Keep wordmarks inline (`.v2-entry-mark` uses an inline-grid `::before` chip).
- Dead-CSS pruning must treat dynamic class names (`is-${tone}`) as used.
- Tailwind arbitrary values (`lg:ml-[232px]`) are generated by Tailwind; do not write CSS for them.

## Intentionally not done

- Dark mode. Landing, entry screens, auth and workspace are consistently light.
- Recharts colours live in JavaScript (`useChartTheme`) because Recharts takes colour props, not CSS variables; it reads the same tokens at runtime.
- The exported HTML report (`src/lib/export/reportGenerator.ts`) has its own inline styles and still names Inter as a font; it is a downloadable document, outside the app UI.
- A three-card feature row on the landing page. The original had one; the design rules ban it, so the three points are one ruled panel.
- Gradients, glass and the original's blurred top bar and gradient logo mark. Flat fills only.
