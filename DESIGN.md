# Verd.io design system

This describes the system as it is built today. Source of truth: `src/app/index.css`
(tokens, `.v2-*` rules), `src/components/pages/PageParts.tsx`,
`src/components/workspace/StateMark.tsx` and `status.ts`, `src/components/ChartRenderer.tsx`.

The look: green-tinted paper, teal-black ink, one deep-green primary. A serif for
headlines, a sans for reading, a mono for numbers and source tags. Ruled rows and
aligned tables instead of rounded white card grids. The whole product is light-only.

## Palette tokens

Defined once on `:root` in `src/app/index.css`. Use the tokens, never the hex.

| Token | Hex | Role |
| --- | --- | --- |
| `--v-paper` | `#EDF0EA` | Page ground |
| `--v-sheet` | `#F7F9F5` | Panels, tooltips, raised surfaces |
| `--v-ink` | `#1A2B2F` | Body text, strong rules, quiet-button borders |
| `--v-muted` | `#55645F` | Secondary text, labels, source tags |
| `--v-rule` | `#C9D2CA` | Hairline rules between rows, panel borders |
| `--v-verd` | `#1F5B49` | Primary action, "ok" state, source names |
| `--v-verd-ink` | `#F2F8F4` | Text on a `--v-verd` fill |
| `--v-tide` | `#3F7C99` | Focus rings and chart series. Never small text (fails AA) |
| `--v-brass` | `#8F6A18` | "Watch" state |
| `--v-oxide` | `#A8382E` | "Risk" state, errors |

Legacy tokens `--canvas` and `--line` are still read by the old shell rules
(`.app-shell`, `.header-icon`, `.user-popover`). `--ink`, `--navy`, `--brand-blue`,
`--brand-blue-light` and `--surface` are no longer referenced anywhere and can be deleted.

Chart series colours (verd, tide, brass, oxide, deep slate, verd tint, neutral, tide tint)
are the `PAL` array in `ChartRenderer.tsx`; each is at least 3:1 against paper and sheet.

## Type

Fonts are self-hosted from `public/fonts` (latin subset, `@font-face` at the top of
`index.css`, two preloads in `index.html`). Nothing loads from a third-party host.

| Variable | Family | Files | Use |
| --- | --- | --- | --- |
| `--v-font-display` | Newsreader (variable, normal + italic) | `newsreader-latin-wght-normal/italic.woff2` | Headlines, decision sentences, panel titles |
| `--v-font-body` | IBM Plex Sans 400/500/600 | `ibm-plex-sans-latin-*.woff2` | Everything that is read. Also the global `:root` font |
| `--v-font-data` | IBM Plex Mono 400/500 | `ibm-plex-mono-latin-*.woff2` | Numerals, eyebrows, state words, source tags, code |

Licences (SIL Open Font License 1.1) sit next to the fonts: `LICENSE-Newsreader.txt`,
`LICENSE-IBM-Plex-Sans.txt`, `LICENSE-IBM-Plex-Mono.txt`. Do not add another font
without adding its licence file and a `@font-face` rule.

Figures use `font-variant-numeric: tabular-nums` (`.v2-fig-val`, `td.num`).
Eyebrows are mono, uppercase, letter-spaced (`.v2-eyebrow`).

## Layout language

- Content column: `.v2-view` is `max-width: 1120px`, 15px / 1.55 body. The landing uses `.v2-wrap` (1120px).
- A page is a heading block, then ruled sections. Lists of figures start with a 1px
  `--v-ink` rule and separate rows with 1px `--v-rule` hairlines (`.v2-figs`, `.v2-chart-list`, `.v2-ledger`).
- Panels (`.v2-panel`) are a hairline border, 2px radius, `--v-sheet` fill, 20px/22px padding.
  Radius is 2 to 6px. The v2 surfaces avoid shadows; the dialog panel and the user popover are the exceptions.
- Tables are real `<table>` with `th scope="row"` and a mono `td.num` column.
- Buttons are `.v2-btn` (verd fill), `.v2-btn.is-quiet` (ink outline), `.is-small`, `.is-block`.

## State language

A state is always a word plus a shape plus a colour, never colour alone
(`StateMark.tsx`, `TONE_GLYPH` in `status.ts`):

| State | Shape | Colour | Class |
| --- | --- | --- | --- |
| ok | check | verd | `.v2-state.is-ok` |
| watch | dot | brass | `.v2-state.is-watch` |
| risk | triangle | oxide | `.v2-state.is-risk` |
| idle (not started, not connected, pending) | hollow circle | muted | `IdleMark`, `.v2-state.is-idle` |

Use `<StateMark tone label />` or `<IdleMark label />`; the glyph is `aria-hidden`
and the word carries the meaning. Health labels come from `healthReading()` (80 / 60 thresholds).

## Evidence margin and source tags

Anything that states a fact next to a figure carries a mono source tag (`.v2-tag`)
with the source name in `<b>` (rendered verd). The Overview shows them in an
`<aside class="v2-evidence">` of `.v2-ev` rows (`PageOverview.tsx`).

Rule: only show a source the app actually knows. Tags are built from real values
(file name, `sourceColumns`, the quality check, connected datasets) and are omitted
when the data is absent (for example `topRisk.sourceColumns.length>0&&...`). Never
write a placeholder source, a made-up confidence or a figure the pipeline did not compute.

## Accessibility minimums

- Text: 11px minimum for labels (11.5px for mono tags), 14px for body copy. No Tailwind `text-[7px..10px]` and no sub-11px `font-size` remain.
- Focus: every interactive element has a visible `:focus-visible` outline (2px `--v-tide`), scoped per surface (`.v2-site`, `.v2-view`, `.v2-rail`, `.app-header`, `.v2-entry-shell`, `.v2-dlg-panel`, `.v2-boundary`, `.v2-tabs`).
- Controls are labelled (`aria-label`, `aria-labelledby`, real `<label>`); icons are `aria-hidden`; the current item uses `aria-current`; tabs use `role="tablist"/"tab"` with `aria-selected`; empty and loading messages use `role="status"`, errors `role="alert"`.
- Dialogs use `useDialogBehaviour` (focus handling, Escape).
- Reduced motion: each surface has a `prefers-reduced-motion: reduce` block that removes transitions and the spinner animation.
- Contrast: AA on paper and sheet. Do not use `--v-tide` for small text.
- Usable at 375px: `.v2-*` rules carry 860 / 640 / 480px breakpoints.

## Naming rule and prefixes

All `.v2-*` rules live in one stylesheet and are mostly unscoped, so a class name defined
twice silently overrides itself across pages. Before adding any `.v2-` class run
`grep -n "\.v2-<name>\b" src/app/index.css` and pick another name if it exists.
State modifiers are `is-*` classes chained to a `.v2-*` class (`.v2-btn.is-quiet`).

| Prefix | Surface |
| --- | --- |
| `v2-land-*` (plus the original unprefixed landing rules: `v2-hero`, `v2-nav`, `v2-wrap`) | Public landing page |
| `v2-op-*` | Operational, execution, governance and team pages |
| `v2-entry-*` | Entry flow: upload, mapping, organisation review |
| `v2-dlg-*` | Dialogs (saved analyses, export) |
| `v2-auth-*` | Sign-in and sign-up |
| `v2-boundary-*` | Error boundary fallback |
| `v2-rail-*`, `v2-nav-*`, `v2-header-*` | Workspace sidebar and header |
| `v2-advisor-*`, `v2-rev-*`, `v2-hub-*`, `v2-chart-*` | Advisor, Revenue, hub tabs, chart lists |

Shared pieces without a surface prefix: `v2-view`, `v2-view-head`, `v2-eyebrow`, `v2-panel`,
`v2-fig`/`v2-figs`, `v2-ledger`, `v2-tag`, `v2-state`, `v2-btn`, `v2-tabs`, `v2-empty`.

## Adding a page

1. Create `src/components/pages/PageX.tsx` that returns `<div className="v2-view">`.
2. Start with `<PageHead eyebrow title>description</PageHead>` from `PageParts.tsx`.
3. Compose with `Figures` / `Figure` (label, value, unit, optional tone + toneLabel, optional source sub-line), `StateMark`, `IdleMark`, `InlineEmpty`; use `PageEmpty` when there is no data at all.
4. Charts: render `ChartRenderer` (lazy export from `workspace/lazy.ts`) inside a `.v2-chart-list` / `.v2-panel`. Its heading and legend are styled under `.v2-view .verdio-chart-heading`.
5. Register the page like the existing ones: an entry in `PAGES` (`workspace/navigation.ts`) and the `page===...` render in `App.tsx` plus its `titles` entry; these ids are load-bearing. Pages render inside `<ErrorBoundary key={page}>`.
6. Only new CSS goes at the end of `index.css` under a new or existing prefix, after the grep above.

## CSS pitfalls found while building

- Unscoped duplicate names. Reusing `.v2-fig`, `.v2-ledger`, `.v2-lede`, `.v2-eyebrow` and `.v2-tag` for a second page changed the landing page. The landing's own copies are now `.v2-land-fig`, `.v2-land-ledger`, `.v2-land-lede`, `.v2-land-eyebrow` and `.v2-land-tag`.
- Reset specificity. The landing reset is `:where(.v2-site) :is(h1, h2, h3, p, ul, ol) { margin: 0; padding: 0 }`. Wrapped in `:where()` it has zero specificity, so any later single-class rule wins. Without `:where` it would beat component margins.
- Overrides by cascade order. Old shell rules were overridden by later `.app-header ...` / `.v2-view ...` rules of equal or higher specificity. When retiring a rule, check the override does not rely on it (for example `overflow: hidden` on `.verdio-chart`, which is kept for that reason).
- Dead-CSS pruning must treat dynamic class names (`is-${tone}`) as used, and must not confuse props such as `eyebrow=` with the removed `.eyebrow` class.
- Tailwind arbitrary values (`ml-[272px]`) are generated by Tailwind; do not write CSS for them.

## Intentionally not done

- Dark mode. The landing's `prefers-color-scheme` override and `color-scheme: light dark` were removed so landing, entry screens, auth and workspace are consistently light. The `--v-*` tokens are structured so an app-wide dark theme can be added later in one place.
- Recharts colours live in JavaScript (`PAL`, `GRID`, `TICK`, `INK`, `SHEET`, `TOOLTIP_STYLE` in `ChartRenderer.tsx`) because Recharts takes colour props, not CSS variables. Keep them in sync with the tokens by hand.
- The exported HTML report (`src/lib/export/reportGenerator.ts`) has its own inline styles and still names Inter as a font; it is a downloadable document, outside the app UI.
- Legacy shell rules (`.app-shell`, `.app-sidebar`, `.header-icon`, `.user-popover`, ...) remain with v2 overrides layered on top rather than being rewritten.
