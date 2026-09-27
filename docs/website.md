# Website: the Interactive Core

Source: [`apps/web`](../apps/web). Status: **built and tested locally; not deployed.** The domain
`arlcoin.io` is configured as the canonical URL in the build only. No DNS, hosting or Vercel
setting has been changed.

## Concept

The site has one screen. The ARL Core sits at its centre in every view.

- **Overview** (`/`): the six layers are arranged around the Core.
- **Layer** (`/core/<layer>`): the layer's cards are arranged around the Core. Selecting the Core
  moves to the next layer (Team → Token → Technology → Security → Roadmap → Ecosystem →
  overview).
- **Detail** (`/core/<layer>/<card>`): the selected card grows into a detail surface on the same
  screen. Back, Close and Escape return to the layer.

Every state has a real URL. Navigation uses the History API, which Next.js integrates with
`usePathname`, so moving between states never loads a new page, while back, forward, refresh and
deep links all work. Every URL is also statically generated with its own title, description,
canonical link and Open Graph tags, and the detail content is in the server-rendered HTML.

## Architecture

```
apps/web
├── app/
│   ├── layout.tsx               fonts, global metadata
│   ├── (core)/layout.tsx        mounts <InteractiveCore/> once for every route below
│   ├── (core)/page.tsx          /                      metadata + JSON-LD
│   ├── (core)/core/[layer]/…    /core/<layer>[/<card>] metadata, static params, 404 otherwise
│   ├── sitemap.ts, robots.ts, opengraph-image.tsx, icon.svg, not-found.tsx
│   └── globals.css              design tokens, materials, orbit layout
└── src/
    ├── content/                 data only; no components
    │   ├── types.ts             Layer, Card, Metric, Status …
    │   ├── registry.ts          layer order, routing (parse/build paths), sitemap paths
    │   ├── layers/*.ts          one file per layer
    │   ├── meta.ts, site.ts     titles, descriptions, site constants
    └── core/                    rendering only; no copy
        ├── InteractiveCore.tsx  root: derives the view from the URL
        ├── useCoreRoute.ts      URL state, History API navigation, Back/Close symmetry
        ├── Orbit.tsx            the one animation engine for every layer
        ├── CoreCard.tsx         the central Core
        ├── RingCard.tsx         cards (real links) and metric rendering
        ├── DetailSurface.tsx    Radix Dialog + morph from/to the card, mobile sheet
        ├── CoreNavigation.tsx   direct layer navigation
        └── ProtocolIndex.tsx    plain index of every layer and card
```

- **Content is separate from rendering.** Adding a layer or card means adding data in
  `src/content/layers/` and listing the layer in `registry.ts`. No component changes are needed.
- **Token figures come from [`packages/tokenomics`](../packages/tokenomics)**, the repository's
  single source of truth. The site imports it directly.
- **Deployment-dependent values are never guessed.** A `Metric` is either `static` or
  `unavailable` with a named future data source (`chain.circulatingSupply`, `market.listings` …).
  Circulating supply, staked amount, liquidity, contract address and network are `unavailable`
  ("Not yet deployed", "Not listed", "Not selected") until a real provider exists. A unit test
  enforces this.

## Motion

- **Orbit positions are pure CSS.** Each card gets `--cos`/`--sin` from its index and sits on an
  ellipse sized from the viewport. JavaScript never measures layout for the orbit. The orbit is
  used from 1100 × 760 (layers with 11 or more cards: from 1360 × 820); below that, cards flow as
  a grid. An end-to-end test checks for collisions on every layer at seven common viewports.
- **Layer switching** collapses the current cards into the Core and expands the next set out of
  it. Motion animates a single CSS variable (`--t`) per card with a critically damped spring.
  Every layer uses the same engine.
- **The detail surface** is a FLIP transition: one measurement of the selected card on click, then
  transforms only. On screens narrower than 768px it is a full-height sheet that can be dragged
  down to close.
- **Pointer parallax** (6px, wide screens with a fine pointer only) uses motion values, so no
  React state updates per frame.
- **`prefers-reduced-motion`** turns all of this into short opacity fades, and parallax is
  disabled.

## Accessibility

- Cards and layer links are real `<a href>` elements. Enter follows them, Space activates cards,
  and the arrow keys and Home/End move between cards.
- The Core is a `<button>` with a label naming the current and next layer.
- The detail surface is a Radix Dialog: focus trap, Escape, `aria-modal`, and a labelled title and
  description. On close, focus returns to the card that opened it.
- Escape on a layer returns to the overview. A skip link, a polite live region for layer
  changes, and visible focus rings are included.

## Visual system: ARL CORE color language

```
BLACK / GRAPHITE  →  LIQUID GLASS  →  WHITE / SOFT GREY  →  AMBER  →  ACTIVE / IMPORTANT
```

The tokens live in `app/globals.css` (`@theme`).

| Token                                                         | Value                             | Use                                                       |
| ------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------- |
| `page`                                                        | `#08090b`                         | Near-black background                                     |
| `surface-1` / `surface-2` / `surface-3`                       | `#0f1113` / `#15171a` / `#1c1f23` | Graphite and charcoal surfaces, lightest = most important |
| `fg` / `fg-muted` / `fg-subtle`                               | `#f2f2f0` / `#a3a6ab` / `#6c7076` | Type                                                      |
| `accent`                                                      | `#eea53f`                         | ARL amber: warm, between yellow and orange                |
| `accent-strong`, `accent-edge`, `accent-soft`, `accent-faint` | derived                           | Hover, edges, active backgrounds                          |

Rules:

- Amber marks only the Core (ring, label, hairline, a micro glow kept inside the Core's own
  footprint), the active layer, hovered and selected card edges, important metrics (primary cards
  only), focus rings and key interaction points.
- No card is filled with amber. No glow spreads across the screen. No neon or fluorescent yellow,
  and nothing pushed toward orange.
- Cards stay graphite with light translucency and a top hairline. Brightness follows weight
  (primary > secondary > tertiary), so cards are never all equal.
- Translucent blur is reserved for surfaces over other content: the top bar and the detail
  surface.
- Radii: 8px controls, 14px cards, 22px surfaces, a circle for the Core. Spacing uses the 4px
  scale. Type: Geist Sans, with Geist Mono for numbers and identifiers, self-hosted.

## Team registry and publishing rule

Team profiles live in `src/content/team/registry.ts`. Each profile has a `verificationStatus`
(`verified`, `unverified` or `placeholder`). The mapping in `src/content/layers/team.ts` applies
the publishing rule, so no component can bypass it:

- Every profile shows its name, role, neutral expertise and verification state.
- Education and career entries (universities, employers, projects) are shown **only for
  verified profiles**. Unverified profiles state that these details are published after
  verification.
- Portraits and links are shown only for verified profiles and only from a real source. Without
  a verified photo, cards use an abstract identity mark (initials), never a generated face.
- Nationality and ethnicity are not recorded. Birth years are recorded as provided and are never
  displayed.

All 12 current profiles are `unverified`. Unit and end-to-end tests fail if an unverified
profile shows an institution, a degree, a link or a portrait. To publish a profile's background,
verify it, set `verificationStatus: "verified"`, and add real links if they exist.

## Source component review

The `scroll-morph-hero.tsx` component supplied earlier was reviewed as a candidate. Its original
repository, author, license and release could not be verified, so **none of its code is used**.
The Interactive Core is implemented from mature open-source primitives instead: Motion (MIT) for
springs, variants and presence animations, and Radix Dialog (MIT) for dialog accessibility. Its
ideas (morphing arrangements, spring motion, pointer parallax) are reimplemented with CSS
positioning and Motion values. Its virtual scroll, wheel hijacking and continuous 3D rotation are
deliberately not reproduced.

## Checks

From `apps/web`:

```
npm ci
npm run typecheck     # next typegen + tsc
npm run lint          # ESLint with Next.js rules
npm test              # content and routing unit tests (node:test)
npm run build
npm run test:e2e      # Playwright, desktop and mobile, against the production build
```

CI runs all of these in the `web` job, plus `npm audit --audit-level=high`.

## Deployment (not performed)

Vercel preparation, for when deployment is approved:

- Project root directory: `apps/web`; framework preset: Next.js; install command: `npm ci`.
- "Include files outside the root directory" must stay enabled, because the site imports
  `packages/tokenomics`.
- No environment variables, secrets or API keys are required.
- The domain `arlcoin.io` is attached in Vercel and at the registrar by the owner. Nothing in
  this repository changes DNS.
- The free Hobby plan is sufficient for a static site. If a paid plan is ever required, stop and
  report it.

## Known gaps

- No approved ARL brand asset exists yet. `app/icon.svg` is a placeholder derived from the Core
  ring, and the wordmark is set in type.
- All 12 team profiles are unverified, so their education and career details are withheld.
- No live data provider exists yet. The `Metric` model and `DataSourceId` are the extension
  point.
