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
- `server/api/screenshot/[id].ts`: screenshot proxy and cache layer.
- `server/api/internal/screenshot-jobs/[id]/prepare.post.ts`: authenticated capture-agent eligibility, R2 reuse, cooldown, and content-probe endpoint.
- `server/api/internal/screenshot-jobs/[id]/result.put.ts`: authenticated bounded-WebP ingestion endpoint.
- `server/api/internal/screenshot-jobs/[id]/failure.post.ts`: authenticated terminal-failure cooldown endpoint.
- `server/utils/screenshot/sourcePolicy.ts`: URL policy for screenshot capture targets, deterministic skips, and bounded content probing.
- `server/utils/screenshot/runtimeConfig.ts`: request-local overlay that maps private `NUXT_SCREENSHOT_*` Cloudflare bindings, including `.dev.vars`, onto screenshot runtime config without mutating Nuxt's shared config object.
- `server/utils/screenshot/types.ts`: shared screenshot result, environment, runtime-config, policy, and provider metadata types.
- `server/utils/screenshot/providers/types.ts`: provider adapter contract, attempt metadata, and provider error classification.
- `server/utils/screenshot/providers/orchestrator.ts`: ordered or balanced provider selection, sequential fallback attempts, and common WebP validation.
- `server/utils/screenshot/providers/registry.ts`: registered provider adapters, configured-provider resolution, and provider-plan identity.
- `server/utils/screenshot/providers/browserlessProxy.ts`: local Browserless screenshot-proxy adapter, bounded HTTP response handling, outcome validation, and provider-specific queueing.
- `server/utils/screenshot/providers/browserRun.ts`: Cloudflare Browser Run adapter and its quota, cooldown, queue, and capture implementation.
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

HN42 reads public data only. There is no HN login, voting, posting, or private account integration.

Primary upstreams:

- HN Firebase API for feed story IDs and screenshot story URLs.
- Algolia HN Search API for story/feed data.
- Algolia Items API for story detail and comment trees.
- Algolia users/search-by-date endpoints for user profiles and activity.
- Configured screenshot providers for article screenshot generation; the registered providers are the local Browserless screenshot proxy and Cloudflare Browser Run.
- Cloudflare Queues for distributing background screenshot jobs across local capture-agent instances. There is intentionally no D1 coordinator.
- XCancel as a best-effort capture target for public X/Twitter status URLs.

Caching expectations:

- Feed and item routes use short public cache headers so story metadata stays fresh. Feed payloads additionally use a four-entry, per-isolate Nitro stale-while-revalidate cache (120 seconds fresh, 600 seconds stale) so Nuxt's internal SSR requests do not refetch both upstreams on every warm request; this is best-effort isolate reuse, not a replacement for the shared front-of-Worker cache.
- Keep `features.inlineStyles` paired with `removeInlinedStylesheets.ts`: initial SSR must contain its critical CSS without duplicate render-blocking `/_nuxt/*.css` links, while client navigation still uses the unmodified build manifest.
- Related stories use longer cache headers because they are derived and less time-sensitive.
- User profile/activity routes cache briefly.
- Screenshot responses use long browser/CDN cache headers and Wrangler Workers Caching, which runs before the Worker and works on the production `workers.dev` hostname. Edge TTLs must use only the remaining R2 freshness window. Do not reintroduce `caches.default`; Cache API operations have no effect on `workers.dev`.
- Successful previews are persisted under `screenshots/v8/<source-url-hash>/preview-1440x11111-q55.webp`. Both public variants serve this one bounded object.
- Direct screenshot captures hash the normalized story URL exactly as before. Transformed captures hash `hn42:<source-strategy>:<capture-url>` so alternate provider targets do not poison direct URL cache entries.
- Feed cards, story detail pages, and story social metadata request the same profile-versioned `/api/screenshot/:id?profile=v8` URL. The profile parameter is the single intentional cache-busting dimension for capture migrations. The legacy `variant=thumbnail|original` query remains accepted, but both values serve the same bounded v8 WebP; do not use them in first-party URLs. Desktop detail pages render the captured height inline beside comments and widen the preview column on large screens; compact layouts keep a scroll-safe crop, and the full-size dialog remains available.
- The public screenshot route accepts only a numeric HN item ID. It must fetch the item from HN Firebase, require a live story, and derive the capture URL server-side; never add a caller-provided URL parameter.
- Browser Run uses a wide desktop 1440x900 viewport and an injected script that measures the rendered page before clamping it to the shared 16-megapixel geometry ceiling, producing a bounded full-page WebP at quality 55 (up to 1440x11111 with the defaults). Keep `fullPage: true` and `captureBeyondViewport: true` paired with that measured ceiling, keep `scrollPage: false`, use `domcontentloaded`, a short post-load wait, and keep the Quick Action response cache disabled so profile changes cannot reuse incompatible output. R2 remains the canonical shared reuse layer.
- The `BROWSER` and `SCREENSHOTS_BUCKET` bindings use `remote = true`. Quick Actions are unavailable in the local browser runtime, and the shared production R2 bucket prevents dev/prod duplicate captures. Public request-time capture is disabled by default in every environment; deliberate local opt-in requires both `NUXT_SCREENSHOT_CAPTURE_ENABLED=true` and `NUXT_SCREENSHOT_REQUEST_CAPTURE_ENABLED=true`.
- Screenshot fallbacks are transparent GIFs. Transient fallbacks cache for 5 seconds in the browser and 15 seconds at the edge; the detail page remounts the same canonical image after 16 seconds and once more after 45 seconds so a startup or capacity race can recover without adding a query dimension. Deterministic policy skips keep their longer TTLs. The client recognizes the 1x1 response and keeps the generated wireframe visible.
- The transparent screenshot fallback exposes a shared client-rendered wireframe underneath the image. Keep it deterministic and SSR-safe, preserve the existing seed palette, and keep its five-to-eight primitive budget so feeds with many failures remain inexpensive.
- Screenshot fallbacks are not written to R2. Stale R2 screenshots can be served briefly when the configured provider chain fails.
- Deterministic screenshot skips return transparent fallbacks and must not invoke any provider. Current policy skips generic PDFs and a small known-blocked host list, transforms X/Twitter status URLs through XCancel, and transforms `arxiv.org/pdf/...` links to `arxiv.org/abs/...`.
- After scheduler admission, the authenticated prepare endpoint runs the source policy and short ranged GET probe once, then gives the verified final public HTML URL to the capture agent. Capture only confirmed `text/html` or `application/xhtml+xml`; skip direct images, PDFs, media, downloads, unknown types, unavailable content, private redirects, and failed verification.
- Screenshot responses expose `X-HN42-Screenshot-Cache`, `X-HN42-Screenshot-Provider`, `X-HN42-Screenshot-Policy`, `X-HN42-Screenshot-Source-Strategy`, `X-HN42-Screenshot-Skip-Reason`, and `X-HN42-Browser-Ms-Used` for debugging. Use `CF-Cache-Status` for the front-of-Worker cache; cached `X-HN42-*` headers describe the response that populated it.
- Preserve screenshot cache behavior unless the task is specifically about invalidation or freshness.

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

Story screenshots should render from the canonical `/api/screenshot/:id` URL on cards and detail pages.

Screenshot generation is best-effort and follows this order:

1. Let Wrangler Workers Caching satisfy the canonical request before Worker code runs.
2. Every three minutes, the screenshot scheduler scans the first 100 Top, Best, New, and Show IDs. It uses seven-day `screenshot-jobs/v1/v8/<story-id>` R2 admission markers and enqueues each newly observed story once.
3. Cloudflare Queues leases jobs independently to any number of stateless HomeLabs capture agents. Each agent calls the authenticated prepare endpoint, which resolves and validates the numeric HN story ID, applies deterministic transforms/skips, reuses R2 success/failure state, and probes the final public HTML URL.
4. The agent sends eligible URLs to the narrow local Browserless screenshot API, then uploads only `direct` `ok`/`access_gate` bounded WebP results through the authenticated result endpoint.
5. Ready results, deterministic skips, cooldowns, and terminal target/output failures are acknowledged per message. Temporary network, service, and capacity failures are retried with delay and eventually reach the configured DLQ; one failed message must not prevent other leases from being acknowledged.
6. Public `/api/screenshot/:id` requests are reuse-only by default. Serve a fresh or stale R2 image when available; otherwise return the transparent 1x1 GIF so the client SVG wireframe remains visible. Never store the GIF or SVG at a canonical screenshot key.

Preserve these strategic guardrails:

- A bounded full-page preview is the product requirement; archival fidelity beyond the geometry and byte ceilings and 100% screenshot coverage are not.
- Optimize in this order: edge reuse, deterministic source policy, R2 reuse, bounded capture. Do not retry a known skip or bypass a capacity guard to improve coverage.
- Do not raise the 16-megapixel or 2 MB ceilings, add another stored size/format, or schedule backfills without measured evidence that the browsing experience needs it.
- Browserless proxy and Browser Run are the registered providers. Adding another concrete provider requires its own adapter, registry entry, binding or secret configuration, and a provider-specific request, credit, and cost review.
- Before increasing scheduler scan depth/frequency, local concurrency, retention, dimensions, quality, or byte limits, recalculate the provider, Queue, and R2 envelope. Review Queue backlog/DLQ, `CF-Cache-Status`, capture success/skip ratios, and average/p95 object size.
- Routine local development is reuse-only. Enable cold captures deliberately and narrowly because local and production use the same remote bindings and R2 bucket.

- Do not use the old `hn42.net/cdn-cgi/image/...` URL; that domain is no longer owned.
- Do not add `provider="cloudflare"` to `NuxtImg` for screenshots.
- Current screenshot rendering intentionally uses plain `<img>` tags to avoid Nuxt Image generating CDN proxy URLs.
- `server/api/screenshot/[id].ts` resolves and validates a live HN story, applies `sourcePolicy.ts`, and checks R2. With the default `screenshotRequestCaptureEnabled=false`, a miss returns the transparent fallback without invoking a provider. Wrangler Workers Caching handles cache hits before the route executes.
- `sourcePolicy.ts` may keep the direct URL, transform the capture target, or skip capture. Keep source links in the UI pointed at the original HN story URL.
- Successful previews are bounded WebPs stored through `SCREENSHOTS_BUCKET` under a provider-independent v8 key and reused for both variants. Preserve the winning provider in object metadata; do not add an image transformation or second object without a measured product need and cost review.
- `screenshotProviders` / `NUXT_SCREENSHOT_PROVIDERS` selects a comma-separated provider chain. `npm run dev` defaults to `browserless-proxy`; production builds default to `browser-run`. Use `browserless-proxy,browser-run` for an explicit local-first fallback chain. `screenshotProviderStrategy` / `NUXT_SCREENSHOT_PROVIDER_STRATEGY` accepts `ordered` by default or deterministic `balanced`; configuration must resolve only IDs registered in `providers/registry.ts`.
- An explicitly present but empty `screenshotProviders` / `NUXT_SCREENSHOT_PROVIDERS` value disables cold capture. Do not treat it as permission to fall back to the registry default, because that could consume an unintended provider.
- Common preview parameters remain controlled by `screenshotPreview*`. Provider adapters remain available for explicit request-time diagnostics, but the production background pipeline has no 60-per-day admission limit; Queue leases and the local Browserless screenshot API enforce capacity.
- `browserless-proxy` calls only the narrow `/v1/screenshots` API with a private Bearer token; never point it at raw Browserless routes or place its token in a URL. It requests the proxy's bounded `fullPage` profile with a 1440x900 desktop viewport and WebP quality 55. HN42 and the proxy independently enforce the same 16-megapixel geometry budget, which caps the default width at 11,111 pixels tall. Keep the outer proxy request budget at 45 seconds so cold full-page encoding is not aborted prematurely. It accepts only `direct` results with `ok` or `access_gate` outcomes, streams at most `screenshotPreviewMaxBytes`, and falls through on internal Ladder routes, challenges, target errors, bad dimensions, or invalid output.
- Browserless proxy runtime config uses `screenshotBrowserlessProxy*` / `NUXT_SCREENSHOT_BROWSERLESS_PROXY_*`. Keep its URL empty in production unless an authenticated, trusted non-local endpoint exists. Keep the token in private runtime config or a Worker secret, never source code or checked-in Wrangler `vars`. The local `.dev.localhost` certificate must be trusted through `NODE_EXTRA_CA_CERTS` before starting Nuxt; do not disable TLS verification.
- During `nuxt dev`, `nitro-cloudflare-dev` exposes `.dev.vars` as Cloudflare bindings rather than Nuxt process environment variables. The screenshot route deliberately overlays string-valued `NUXT_SCREENSHOT_*` bindings onto its private runtime config, so the same ignored `.dev.vars` file can control capture enablement, provider order, and provider parameters. `SCREENSHOT_API_TOKEN` remains the preferred provider-specific secret binding and takes precedence over `NUXT_SCREENSHOT_BROWSERLESS_PROXY_TOKEN`.
- Source policy runtime config includes `screenshotPolicyProbeTimeoutMs`, `screenshotXCancelBaseUrl`, and `screenshotPolicyBlockedHosts`; the host list extends the default blocked hosts.
- Terminal agent target/output failures write short-lived R2 markers under separate `.failure` keys so a failure can never overwrite a valid image. Infrastructure/capacity failures do not write failure markers. Policy/probe skips are acknowledged without R2 failure writes. The optional request-time provider chain retains its own provider-plan-aware failure markers.
- Consume each Browser Run Quick Action response body and explicitly dispose the RPC result afterward; remote development otherwise reports leaked stubs. Do not add isolate-local fallback memoization before R2 reads, because it can hide a screenshot successfully written by another isolate or development process.
- Feed cards share one Intersection Observer and mount screenshot images when they enter its preload margin; leave request scheduling and concurrency to the browser.
- Keep long shared-cache TTLs unless there is a concrete invalidation need.

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
- Keep Wrangler Workers Caching enabled, and keep SSR page routes explicitly `no-store`; uncategorized successful responses otherwise receive the platform's default cache TTL.
- R2 must be enabled on the Cloudflare account before bucket creation or deployment verification can succeed.
- Production and local development share the remote R2 bucket `hn42-screenshots`; do not add a separate preview bucket without reintroducing cross-environment captures.
- R2 lifecycle should delete active `screenshots/v8/` objects after 30 days, `screenshot-jobs/v1/` admission markers after seven days, and legacy `screenshots/v3/` through `screenshots/v7/` objects after 180 days.
- There is no fixed daily admission count. Monitor actual queue backlog, capture rate, skip/failure ratio, and average/p95 WebP size. Every screenshot remains capped at 2 MB; admission and failure markers are empty metadata objects.
- Use `npm run cf:screenshots:bootstrap` to create the screenshot R2 bucket and verify the active, admission, and legacy lifecycle rules. Use `npm run cf:screenshots:jobs:bootstrap` once to create the Queue, DLQ, and HTTP pull consumer.
- Use `npm run cf:screenshots:reset-cache` only when intentionally deleting old cached objects under `screenshots/v2/`.
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
npm run cf:screenshots:reset-cache
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
