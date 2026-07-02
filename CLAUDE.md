# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start dev server at http://localhost:3000/lol-hub (auto-cleans .next)
npm run build         # Static export → out/ (auto-cleans .next)
npm run lint          # ESLint check
npm run export        # Preview static export locally (npx serve out)
```

## Rules

- **Never include `Co-Authored-By: Claude` or any Claude/AI attribution in git commits.**
- **Splash art paths in `cdn.ts` must be relative (no leading `/`).** Root-relative paths like `/splash/x.jpg` break on GitHub Pages because the site is served at `/lol-hub/`, not `/`. Always write `splash/x.jpg`. The `getSplashUrl()` function now strips accidental leading slashes defensively.
- **Never develop without knowing the user's proxy: `http://127.0.0.1:7897`.** Configure git with `http.proxy` and `https.proxy` pointing there.
- **All DDragon/CommunityDragon image URLs must go through `src/lib/cdn.ts`.** Never inline `https://ddragon.leagueoflegends.com/...` strings in components. Use the exported functions: `getDdragonSplashUrl`, `getDdragonLoadingUrl`, `getDdragonIconUrl`, `getCommunityDragonChromaUrl`, `getSplashUrl`.

## Architecture

**Next.js 14 App Router + static export** (`output: "export"`, `basePath: "/lol-hub"` in next.config.mjs). Single HTML file with hash-based client-side SPA. Images use `unoptimized: true`.

### Routing (hash-based SPA with code splitting)

`src/app/page.tsx` is the single entry point. All page components are **lazy-loaded via `next/dynamic`** with `ssr: false` — each navigation triggers a new JS chunk fetch on first visit. Each route view is wrapped in `<ErrorBoundary>` to isolate crashes.

| Hash | View | Component |
|------|------|-----------|
| `#/` | Hero list | `HeroList` |
| `#/hero/{id}` | Hero detail (skin gallery) | `HeroDetail` |
| `#/compare` | Skin comparison | `ComparePage` |
| `#/analytics` | OP.GG champion tier list | `AnalyticsList` |
| `#/analytics/{id}` | Champion analysis detail | `AnalyticsDetail` |

`hashToRoute()` uses regex matching and normalizes trailing slashes, double-hashes, and missing leading `#`. Deep-linking (e.g. bookmarking `#/hero/Aatrox`) skips the landing page — `entered` initializes to `true` when the hash is a non-empty deep link.

`navigate("/", { home: true })` returns to the landing page (`entered=false`). `navigate("/")` (no opts) goes to hero list. Landing → app transition only happens via the "进入预览" button.

### Data sources

- **Data Dragon** (`ddragon.leagueoflegends.com`) — champion list, skins, splash/loading art, runes, items, spells. All calls cached 1h in sessionStorage (`ddragon:*` keys).
- **CommunityDragon** (`raw.communitydragon.org`) — chroma variant images. Used as tier-1 fallback when Data Dragon lacks chroma splash art.
- **OP.GG REST API** (`lol-api-champion.op.gg`) — champion analytics: win/pick/ban rates, runes, builds, counters. CORS enabled, no auth needed. `src/lib/opgg.ts` wraps it. URL pattern: `/api/{region}/champions/{mode}/{id}/{position}?version=16.X&tier=...`. Cached 30min in sessionStorage (`opgg:*` keys).
- **Local splash art** — `public/splash/` contains 173 champion default splash JPEGs downloaded via `scripts/download-splashes.mjs`. `src/lib/cdn.ts` → `getSplashUrl()` maps to `splash/{id}.jpg` (relative path — see Rules).

### SessionStorage caching

Two-tier caching to avoid rate limiting and speed up repeat visits:

- **Data Dragon** (`src/lib/api.ts`): 1-hour TTL. Keys: `ddragon:version`, `ddragon:champions:{ver}`, `ddragon:champion:{ver}:{id}`, `ddragon:runes:{ver}`, `ddragon:items:{ver}`, `ddragon:spells:{ver}`.
- **OP.GG** (`src/lib/opgg.ts`): 30-minute TTL. Keys: `opgg:versionShort`, `opgg:champs:{region}:{mode}:{tier}`, `opgg:detail:{region}:{mode}:{tier}:{id}:{pos}`.

**`fetchVersions()` deduplication:** Concurrent calls share a single in-flight `versionPromise` — only one HTTP request to DDragon even when multiple components mount simultaneously. The promise resets to `null` on resolution.

### Image loading & fallback

**URL centralization:** All DDragon and CommunityDragon URLs are constructed in `src/lib/cdn.ts` — components never inline URL strings. Five exported functions cover every image source.

**Three-tier fallback** in `SkinCard` and `SkinViewer`:
1. DDragon splash/loading URL (`errorLevel=0`)
2. CommunityDragon chroma image (`errorLevel=1`)
3. Nearest chroma-base skin via `buildFallbackMap()` in `src/lib/utils.ts` (`errorLevel=2`)

`SkinCard` uses an **IntersectionObserver** (`useInView` hook) to preload chroma/fallback images only when the card is within 200px of the viewport — avoids 80+ hidden preload requests on large pages.

**Mode switching:** `SkinCard`'s outer wrapper uses `key={skin.id}` (stable across splash/loading mode changes). The inner `<Image>` uses `key={`${errorLevel}-${mode}`}` for targeted remounts — switching modes no longer unmounts the entire card.

**HeroDetail precomputation:** `useMemo` precomputes all skin URLs and the `buildFallbackMap()` once per champion, avoiding O(skins²) recomputation on every render.

**Error handling:** `ComparePage`, `HeroCard`, and both banner components (`HeroDetail`, `AnalyticsDetail`) now have `onError` handlers with fallback URLs (DDragon CDN or champion square icon).

### Analytics page

`AnalyticsList.tsx` — mode/region/tier/position selectors, champion grid with win/pick/ban/KDA rates. Filters by position client-side from single `fetchAllChampions()` call.

`AnalyticsDetail.tsx` — skill order (top 3, pipe-separated), runes (top 3 with icons), summoner spells (top 3 with icons), core items (top 6 numbered), starter items + boots (side-by-side, top 5 each), counters with champion avatars (clickable to navigate). Uses `buildGameDataMaps()` from `src/lib/api.ts` for rune/item/spell name → icon → Chinese name mapping.

### Shared utilities

`src/lib/utils.ts` — `getComparePool()`, `saveComparePool()` (localStorage key `"comparePool"`), `getFallbackSkinNum()`, `buildFallbackMap()`.

### Canvas background

`HextechBackground.tsx` — rAF loop: hex grid, crystal nodes, pulse rings, floating particles. `window.__hextechSurge()` triggers energy burst on landing entry.

### Error boundary

`ErrorBoundary.tsx` — React class component wrapping each route view in `page.tsx`. Catches unhandled render errors, displays a friendly fallback UI with a "返回首页" button. Uses `key={route.id}` to reset on navigation between different items of the same page type.

### GitHub Pages SPA fallback

- **`_redirects`** — `/* /index.html 200` catches all paths → SPA (primary mechanism).
- **`404.html`** — Copy of `index.html` with SPA bootstrap; fallback for paths where `_redirects` doesn't fire.
- **`.nojekyll`** — Forces GitHub Pages to skip Jekyll processing (auto-generated in CI via `deploy.yml`).

### Design tokens

- Void: `#040B1A`, Hex-blue: `#0AB4FF`, Hex-light: `#7DD8FF`, Arcane: `#7C3AED`, Gold: `#C8AA6E`, Mist: `#8E9CBA`
- CSS: `.glass-card`, `.glass-card-hover`, `.btn-primary`, `.btn-ghost`, `.hex-btn` (hex clip-path), `.hex-pulse`

## Deployment

GitHub Pages via CI (`.github/workflows/deploy.yml`). On push to `main`: `npm ci` → `npm run build` → `touch ./out/.nojekyll` → upload artifact → deploy. Site at `https://ivor-y.github.io/lol-hub/`.
