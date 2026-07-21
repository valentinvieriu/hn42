# HN42 Agent Guide

## App Overview

HN42 is a Nuxt 4 Hacker News reader focused on visual article discovery. It renders top, best, new, and show story feeds, story detail pages with comments and related-story suggestions, user activity pages, and per-story article screenshots.

The app is an older codebase that has been upgraded to Nuxt 4 and now uses the Nuxt 4 `app/` source directory. Keep changes conservative and preserve the existing project shape unless a migration explicitly requires moving files.

## Product Philosophy

HN42 is an alternative way to browse Hacker News, not a dense text-first clone of Hacker News.

The core product idea is that a story can be evaluated before opening it. HN titles often hide the shape and quality of the linked page: it might be a substantial essay, a paper, a useful announcement, an ad-heavy landing page, a modal wall, or a thin product page. HN42 exposes that context by giving each story a visual article preview.

The desired browsing loop is:

```text
scan -> compare -> open the HN42 story page, open the source, or move on
```

Preserve these product principles:

- Screenshots are central. They are the main evaluation surface, not decorative thumbnails.
- Discovery feeds contain only stories with an explicit, non-empty source URL
  from HN. URL-less Ask HN, jobs, polls, and text-only submissions may remain
  reachable through direct item or user-activity routes, but they do not belong
  in Top, Best, New, or Show cards and must not be made eligible by synthesizing
  an HN item permalink.
- Hacker News metadata should orient the user without overpowering the preview.
- The source/domain link is the explicit external escape; the card/title opens the HN42 story page.
- Visual variety matters. Story cards should not collapse into a flat text list.
- Comments are a major part of the HN value. Keep nested discussion, quotes, references, and code readable.
- Avoid heavy CTAs or duplicate buttons when they do not represent genuinely different destinations.

## Architecture

HN42 uses Nuxt pages for the main routes and Nitro server routes for Hacker News, Algolia, related-story, user, and screenshot APIs.

Frontend:

- `app/pages/index.vue`, `app/pages/top.vue`, `app/pages/best.vue`, `app/pages/new.vue`, `app/pages/show.vue`: feed pages (`/` and `/top` both render the top feed without a redirect).
- `app/pages/item/[id].vue`: story detail page with metadata, screenshot, comments, and related stories.
- `app/pages/user/[username].vue`: user profile/activity page with posts and comments.
- `app/components/story/StoryGrid.vue`: feed layout and loading states.
- `app/components/story/StoryCard.vue`: visual story card, source link, screenshot preview, title, and status row.
- `app/components/story/StoryPlaceholderVisual.vue`: shared deterministic wireframe fallback for queued and unavailable screenshots.
- `app/components/comment/CommentThread.vue`: nested comment renderer.
- `app/components/user/UserCommentCard.vue`: user activity comment card.
- `app/components/RelatedStories.vue`: related story list on detail pages.
- `app/components/layout/Header.vue` and `app/components/layout/Footer.vue`: shared shell.

Shared client logic:

- `app/composables/useStories.ts`: feed loading, session-memory cache, and stale refresh state.
- `app/composables/useFeedTheme.ts`: feed-specific labels, routes, and color theme variables.
- `app/composables/useSeedPalette.ts`: deterministic card color palettes.
- `app/composables/useStoryPlaceholder.ts`: non-semantic, story-seeded wireframe layout generation with bounded SVG geometry.
- `app/composables/useSanitizer.ts`: safe rich-text rendering and HN comment post-processing.
- `app/utils/storyScreenshotObserver.ts`: one shared client-side Intersection Observer for card screenshot preloading.

Server/API:

- `server/api/top.ts`, `best.ts`, `new.ts`, `show.ts`: configure the shared ordered feed handler.
- `server/api/item/[id].ts`: fetch story details and comment tree from Algolia Items API.
- `server/api/related/[id].ts`: build related-story candidates from title, URL, comments, and Algolia search results.
- `server/api/screenshot/[id].ts`: public R2-only screenshot cache layer.
- `server/api/internal/screenshot-jobs/[id]/prepare.post.ts`: authenticated capture-agent eligibility, R2 reuse, and content-probe endpoint.
- `server/api/internal/screenshot-jobs/[id]/result.put.ts`: authenticated bounded-WebP ingestion endpoint.
- `server/utils/screenshot/sourcePolicy.ts`: URL policy for screenshot capture targets, deterministic skips, and bounded content probing.
- `server/utils/screenshot/runtimeConfig.ts`: request-local overlay that maps source-policy and retention `NUXT_SCREENSHOT_*` Cloudflare bindings, including `.dev.vars`, onto screenshot runtime config without mutating Nuxt's shared config object. The v9 image dimensions, quality, and byte ceiling are fixed shared constants rather than environment settings.
- `server/utils/screenshot/types.ts`: screenshot storage, policy, and runtime-config types.
- `server/utils/screenshot/r2Cache.ts`: v9 HN-ID object keys, metadata-only checks, reads, and writes.
- `server/utils/screenshot/validation.ts`: common bounded-WebP ingestion validation.
- `workers/screenshot-scheduler/`: Cron Worker that scans current HN feeds, deduplicates admissions with lightweight R2 markers, and produces Cloudflare Queue jobs.
- `capture-agent/`: stateless Queue HTTP pull consumer and container image for the HomeLabs Browserless service.
- `server/api/user/[username].ts`: user profile from Algolia.
- `server/api/user/[username]/comments.ts` and `stories.ts`: paginated user activity using Algolia search-by-date.
- `server/utils/userActivityHandler.ts`: shared validation, cache, error, and timing wrapper for user activity routes.
- `server/utils/fetchStories.ts`: common Algolia story normalization.
- `server/utils/feed.ts`: fetch ordered story IDs from HN Firebase, hydrate them from Algolia, preserve source order, cache the four feed payloads briefly inside each Nitro isolate, and set feed cache headers.
- `server/plugins/removeInlinedStylesheets.ts`: strip duplicate generated stylesheet links from SSR HTML after Nuxt inlines the same critical CSS, while leaving the client manifest intact.
- `server/utils/userActivity.ts`: user activity pagination and mapping.

Types and global styling:

- `shared/types/index.ts`: shared story, comment, user, and activity types used by the Vue app and Nitro server.
- `shared/utils/comments.ts`, `date.ts`, and `hn.ts`: framework-neutral comment analysis, date formatting, and HN identifier/path helpers.
- `app/assets/css/main.css`: base typography, rich-text rendering, quote/code/reference styles.
- `tailwind.config.ts`: Tailwind app content path, fonts, dark mode, and extended color tokens.

## Data Sources And Caching

HN42 reads public data only. There is no HN login, voting, posting, or private
account integration.

Primary upstreams are HN Firebase, Algolia HN APIs, Cloudflare Queues, the
authenticated local Browserless API, and XCancel for best-effort public
X/Twitter capture targets.

Feed admission is deliberately narrower than HN's own feeds. `fetchStories`
must discard Algolia story hits whose `url` is missing or blank before mapping
them into cards. Keep the original source URL intact; do not replace a missing
source with `https://news.ycombinator.com/item?id=...`. Direct item pages can
still render HN-native discussions when addressed explicitly.

Caching expectations:

- Preserve the existing feed/item cache headers and per-isolate feed SWR cache.
- Keep `features.inlineStyles` paired with
  `removeInlinedStylesheets.ts`.
- Wrangler Workers Caching is the front-of-Worker screenshot cache. Do not
  reintroduce `caches.default` on `workers.dev`.
- The only active preview key is
  `screenshots/v9/items/<hn-id>/preview-1440x11111-q55.webp`.
- Feed cards, details, and social metadata share
  `/api/screenshot/:id?profile=v9`. Legacy variants serve the same object.
- The public route performs one R2 GET and never fetches HN or invokes capture.
- Prepare performs one metadata-only R2 HEAD. Only a missing or stale preview
  proceeds to HN resolution, source policy, and content probing.
- Transparent GIF/SVG fallbacks and failure markers are never stored.
  Terminal page/output failures are acknowledged and the seven-day admission
  marker suppresses immediate re-admission. Infrastructure failures retry via
  Queue.
- Source policy skips unsafe URLs, private redirects, and content confidently
  identified as unsupported non-HTML. It transforms X/Twitter statuses through
  XCancel and sends PDFs at their original source URL to Browserless for
  first-page capture. Redirects are followed only to validate their safety and
  content; the probe must return the requested capture URL rather than a
  redirect target, because probe-specific anti-bot redirects can differ from
  Browserless navigation. It has no publisher blacklist: blocked, timed-out,
  and otherwise inconclusive probes proceed to the trusted Browserless service,
  whose `ruleset.yaml` owns publisher support and direct-versus-Ladder routing.
- Active v9 screenshots expire after 28 days. Keep response TTLs within the
  remaining R2 freshness window.
- The scheduler runs every three minutes and prioritizes Top, Best, and Show
  before New. It checks at most 400 seven-day admission markers with bounded
  Class B HEADs rather than repeatedly listing the marker prefix. Its 8,000-job
  UTC-day ceiling is an emergency runaway guard for the Workers Paid Queue
  allowance, not a pacing target; the 2 MB reservations and 10 GB storage gate
  limit the rolling 24-hour window to at most 5,000 admissions first.
- Keep the compact `screenshot-scheduler/v1/v9/state.json` counter and storage
  snapshot. A missing or invalid state is rebuilt once from admission and image
  LISTs; after that only the exact image byte count is refreshed at most hourly.
- Keep seven-day `screenshot-jobs/v1/v9/` admission markers. They avoid repeated
  Queue and R2 work for recurring, skipped, and terminally failed stories.

## UI And Interaction Principles

Story cards are the core product surface.

- The screenshot/preview should remain visually dominant.
- Source and age should orient the user quickly.
- Title should confirm the preview, not replace it as the only evaluation signal.
- Author, points, and comments are status/context, not primary action buttons.
- Card/title should route to `/item/:id`.
- Source/domain should open the external URL.
- Author should route to `/user/:username`.
- Comment count can route to the story page or a comments anchor if one is added.

On mobile, avoid interactions where the screenshot preview fights page scroll. Prefer simple, robust scrolling behavior over clever nested gesture handling.

For visual work:

- Preserve the colorful seeded card/feed palette system.
- Use existing Tailwind utilities, scoped component CSS, and CSS custom properties before adding new styling systems.
- Keep UI text compact and functional.
- Avoid turning HN42 into a marketing page or a text-only HN clone.

## Comment Rendering

HN/Algolia item text arrives as a small HTML subset plus plain-text conventions. Do not flatten comments to plain text unless there is a concrete safety reason; links, paragraphs, emphasis, quotes, and code carry meaning.

Current rendering uses `useSanitizer.ts` to:

- Allowlist safe tags and attributes.
- Restrict links to safe protocols.
- Render through sanitized `v-html`.
- Convert paragraphs beginning with `>` into blockquotes.
- Style reference lines like `[1] - <link>`.
- Link inline markers such as `[1]` to matching references in the same comment.
- Autolink safe bare URLs only when HN/Algolia did not already emit an anchor.
- Style `Edit:`, `Update:`, and `TL;DR:` as note labels.

Nested comments render to a limited depth by default. `app/pages/item/[id].vue` analyzes the tree once for totals, author activity, descendant counts, and collapsed-state; `CommentThread.vue` uses that shared summary for local reply disclosure.

## Images And Screenshots

Story screenshots render from the canonical `/api/screenshot/:id` URL.
Capture is background-only:

1. Wrangler Workers Caching may satisfy public requests before Worker code.
2. Every three minutes the scheduler scans the first 100 Top, Best, Show, and
   New IDs in that priority order and HEADs the seven-day
   `screenshot-jobs/v1/v9/<story-id>` admissions with at most six concurrent R2
   operations.
3. Before enqueueing, it enforces the 8,000-job emergency UTC-day ceiling and
   projected 10 GB v9 storage ceiling.
4. Queue leases jobs to stateless HomeLabs agents.
5. Prepare performs one preview HEAD, then resolves and probes only a real miss.
6. Browserless output may use its server-owned `direct` or `ladder` route, and
   PDF targets render their first page. Every result must be `ok`/`access_gate`,
   WebP, at most 1440x11111, 16 MP, and 2 MB. The selected route is preserved in
   R2 metadata.
7. The public route serves R2 or the transparent GIF; it never starts capture.

Preserve these guardrails:

- HN ID is the sole v9 identity. Do not add URL hashes, caller-provided URLs, a
  second stored variant, or D1 coordination.
- Keep admission markers; they are the shared suppression mechanism for ready,
  skipped, and terminally failed stories.
- Keep compact scheduler state conditional writes ahead of Queue admission so
  overlapping runs cannot exceed daily or storage reservations. The one-time
  marker LIST is migration/recovery behavior, not the steady-state dedupe path.
- Do not add R2 failure markers. They duplicate admission state and add HEAD,
  PUT, and DELETE operations.
- Network/service/capacity errors retry through Queue. Terminal target/output
  errors are acknowledged immediately and must not block other leases.
- Keep publisher routing in the Browserless ruleset. Do not add an HN42 host
  blacklist or reject trusted Ladder provenance; that would bypass rules that
  the capture service owns.
- Keep the public route to one bounded R2 GET and prepare to one metadata HEAD
  before source work.
- Keep source links on the original HN URL even when capture uses XCancel; PDF
  capture also uses the original source URL. Content-probe redirects are for
  validation only and must not replace the requested capture URL.
- Preserve the deterministic client wireframe and do not store fallback GIFs or
  SVGs.
- Keep plain `<img>` rendering; do not add image transformations, the old CDN
  URL, or Nuxt Image's Cloudflare provider.
- Do not raise daily admissions, storage ceiling, retention, dimensions,
  quality, or byte limits without recalculating Queue and R2 free-tier usage.
- Feed cards share one Intersection Observer.
- Use `CF-Cache-Status`, `X-HN42-Screenshot-Cache`, and
  `X-HN42-Screenshot-Source-Route` for diagnostics. Agent stdout must retain
  structured skip reasons and terminal outcome/route/hostname details; do not
  add storage-backed failure records for observability.

## Styling, Linting, And Code Style

Styling approach:

- TailwindCSS is the base styling system.
- Component-specific CSS generally lives in scoped Vue styles.
- Shared typography/rich-text styling belongs in `app/assets/css/main.css`.
- Dark mode uses `@nuxtjs/color-mode` with class-based Tailwind dark mode.
- Fonts are Inter for body text and Sora for display headings.
- Google Font faces are self-hosted and injected into Nuxt's hashed CSS with `font-display: optional`; do not restore the separate `/css/nuxt-google-fonts.css` render-blocking link.
- Prefer the existing feed theme and seed palette helpers over one-off color systems.

Linting and checks:

- There is currently no dedicated `lint` script in `package.json`.
- Use `npm run check` as the baseline verification; it runs type checking, unit tests, and the production build.
- Use `git diff --check` for whitespace issues when editing docs or code.

Code conventions:

- Follow nearby file style instead of reformatting broad areas.
- Keep dependency and lockfile changes intentional.
- Avoid broad refactors unless the requested change genuinely requires them.
- Add comments only where they clarify non-obvious behavior.

## Cloudflare Deployment

This app deploys to Cloudflare Workers, not Cloudflare Pages.

Production app URL: `https://hn42.vv42.workers.dev/`.

- Nuxt/Nitro preset: `cloudflare-module`
- Worker entry: `.output/server/index.mjs`
- Static assets: `.output/public`
- Wrangler command: `wrangler deploy`
- Keep `compatibility_flags = ["nodejs_compat"]` in `wrangler.toml`.
- Keep the R2 binding `SCREENSHOTS_BUCKET` in `wrangler.toml`.
- Keep Wrangler Workers Caching and cross-version cache reuse enabled, and keep SSR page routes explicitly `no-store`; uncategorized successful responses otherwise receive the platform's default cache TTL.
- R2 must be enabled on the Cloudflare account before bucket creation or deployment verification can succeed.
- Production and local development share the remote R2 bucket `hn42-screenshots`; do not add a separate preview bucket without reintroducing cross-environment captures.
- R2 lifecycle should delete active `screenshots/v9/` objects after 28 days and
  `screenshot-jobs/v1/v9/` admission markers after seven days. Bootstrap sets
  exactly those active v9 rules plus the multipart-abort rule, removing legacy
  lifecycle rules rather than recreating them.
- Keep the 8,000-admission emergency UTC-day ceiling, Top/Best/Show/New
  priority, and projected 10 GB storage gate. Every screenshot remains capped
  at 2 MB; admission markers are empty metadata objects.
- Use `npm run cf:screenshots:bootstrap` to create the screenshot R2 bucket and
  enforce the exact active v9 lifecycle policy. Use
  `npm run cf:screenshots:jobs:bootstrap` once to create the Queue, DLQ, and HTTP
  pull consumer.
- Do not switch scripts back to `wrangler pages deploy` or `wrangler pages dev`.

For deployment config changes, verify:

```bash
npm run cf:screenshots:bootstrap
npm run cf:screenshots:jobs:bootstrap
npm run build
npm run cf-typegen
npx wrangler deploy --dry-run
npm run cf:screenshots:scheduler:dry-run
```

## Commands

```bash
npm install
npm run dev
npm run build
npm run build:screenshot-agent
npm run typecheck
npm test
npm run check
npm run preview
npm run deploy
npm run cf-typegen
npm run cf:screenshots:bootstrap
npm run cf:screenshots:jobs:bootstrap
npm run cf:screenshots:scheduler:deploy
npm run cf:screenshots:scheduler:dry-run
npx wrangler deploy --dry-run
git diff --check
```

## Known Caveats

- The background prepare/capture path can be slow on cold misses; public screenshot requests remain bounded R2 reads and fallbacks by default.
- Browser verification should use the in-app browser against `http://localhost:3000` or the actual Nuxt dev port.
- The dev server may need a restart after dependency or Nuxt/Nitro preset changes; hot reload can leave the app shell blank.
- Screenshot latency is expected and should not be treated as a UI regression unless the task is specifically about screenshots.

## Working Conventions

- Preserve user changes in the worktree. Do not revert unrelated edits.
- Keep edits scoped to the request and the surrounding module.
- Prefer compatibility fixes over broad rewrites.
- For important architectural changes, update `README.md` and `AGENTS.md` in the same change so project documentation and agent guidance stay accurate.
- For UI changes, preserve the screenshot-first product hierarchy.
- For UI changes, verify in the in-app browser when feasible.
- For Cloudflare deployment changes, verify both build and Wrangler dry-run when possible.
