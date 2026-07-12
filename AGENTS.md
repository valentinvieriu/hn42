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
- `server/utils/screenshot/sourcePolicy.ts`: URL policy for screenshot capture targets, deterministic skips, and bounded content probing.
- `server/utils/screenshot/types.ts`: shared screenshot result, environment, runtime-config, policy, and provider metadata types.
- `server/utils/screenshot/providers/types.ts`: provider adapter contract, attempt metadata, and provider error classification.
- `server/utils/screenshot/providers/orchestrator.ts`: ordered or balanced provider selection, sequential fallback attempts, and common JPEG validation.
- `server/utils/screenshot/providers/registry.ts`: registered provider adapters, configured-provider resolution, and provider-plan identity.
- `server/utils/screenshot/providers/browserRun.ts`: Cloudflare Browser Run adapter and its quota, cooldown, queue, and capture implementation.
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
- Configured screenshot providers for article screenshot generation; Cloudflare Browser Run is currently the only registered provider.
- XCancel as a best-effort capture target for public X/Twitter status URLs.

Caching expectations:

- Feed and item routes use short public cache headers so story metadata stays fresh. Feed payloads additionally use a four-entry, per-isolate Nitro stale-while-revalidate cache (120 seconds fresh, 600 seconds stale) so Nuxt's internal SSR requests do not refetch both upstreams on every warm request; this is best-effort isolate reuse, not a replacement for the shared front-of-Worker cache.
- Keep `features.inlineStyles` paired with `removeInlinedStylesheets.ts`: initial SSR must contain its critical CSS without duplicate render-blocking `/_nuxt/*.css` links, while client navigation still uses the unmodified build manifest.
- Related stories use longer cache headers because they are derived and less time-sensitive.
- User profile/activity routes cache briefly.
- Screenshot responses use long browser/CDN cache headers and Wrangler Workers Caching, which runs before the Worker and works on the production `workers.dev` hostname. Edge TTLs must use only the remaining R2 freshness window. Do not reintroduce `caches.default`; Cache API operations have no effect on `workers.dev`.
- Successful previews are persisted under `screenshots/v7/<source-url-hash>/preview-1440x4096-q68.jpg`. Both public variants serve this one bounded object.
- Direct screenshot captures hash the normalized story URL exactly as before. Transformed captures hash `hn42:<source-strategy>:<capture-url>` so alternate provider targets do not poison direct URL cache entries.
- Feed cards, story detail pages, and story social metadata request the same profile-versioned `/api/screenshot/:id?profile=v7` URL. The profile parameter is the single intentional cache-busting dimension for capture migrations. The legacy `variant=thumbnail|original` query remains accepted, but both values serve the same bounded v7 JPEG; do not use them in first-party URLs. Responsive detail rendering mounts only the image used at the current breakpoint, and desktop detail pages can expand the preview to its 1440-pixel capture width.
- The public screenshot route accepts only a numeric HN item ID. It must fetch the item from HN Firebase, require a live story, and derive the capture URL server-side; never add a caller-provided URL parameter.
- Browser Run uses a wide desktop 1440x900 viewport and an injected script that measures the rendered page before clamping it to 4096 pixels, producing a bounded deep-preview JPEG at quality 68. Keep `fullPage: true` and `captureBeyondViewport: true` paired with that measured ceiling, keep `scrollPage: false`, use `domcontentloaded`, a short post-load wait, and keep the Quick Action response cache disabled so profile changes cannot reuse incompatible output. R2 remains the canonical shared reuse layer.
- The `BROWSER` and `SCREENSHOTS_BUCKET` bindings use `remote = true`. Quick Actions are unavailable in the local browser runtime, and the shared production R2 bucket prevents dev/prod duplicate captures. New captures are disabled by default in local development; deliberate opt-in can mutate production screenshot objects and consume real Browser Run usage.
- Screenshot fallbacks are transparent GIFs with short browser/edge TTLs. The client recognizes the 1x1 response and keeps the generated wireframe visible.
- The transparent screenshot fallback exposes a shared client-rendered wireframe underneath the image. Keep it deterministic and SSR-safe, preserve the existing seed palette, and keep its five-to-eight primitive budget so feeds with many failures remain inexpensive.
- Screenshot fallbacks are not written to R2. Stale R2 screenshots can be served briefly when the configured provider chain fails.
- Deterministic screenshot skips return transparent fallbacks and must not invoke any provider. Current policy skips generic PDFs and a small known-blocked host list, transforms X/Twitter status URLs through XCancel, and transforms `arxiv.org/pdf/...` links to `arxiv.org/abs/...`.
- After R2 misses, the screenshot route runs the source policy and short ranged GET probe once, then gives the verified final public HTML URL to the provider chain. Capture only confirmed `text/html` or `application/xhtml+xml`; skip direct images, PDFs, media, downloads, unknown types, unavailable content, private redirects, and failed verification.
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
2. Resolve and validate the numeric HN story ID, derive the source server-side, and apply deterministic source transforms or skips.
3. Reuse the single content-addressed R2 preview; prefer a stale preview over an avoidable cold capture during provider trouble.
4. On a true miss, verify the final public HTML URL once, then ask the configured provider chain to capture it. `ordered` tries providers in configuration order; deterministic `balanced` filters unavailable providers, rotates the primary from the stable source hash, and retains the remaining available providers as the fallback chain.
5. Let each adapter enforce its own quota and cooldown, validate every successful result against the common bounded JPEG contract, then persist the first success once and reuse it across feed, detail, social metadata, and legacy variant requests.
6. After the chain is exhausted, return the transparent 1x1 GIF so the client-rendered SVG wireframe remains visible. Write a short-lived R2 failure marker only for a chain-terminal provider failure, not when every attempt was merely unavailable or capacity-limited.

Preserve these strategic guardrails:

- A bounded deep preview is the product requirement; full-page archival fidelity and 100% screenshot coverage are not.
- Optimize in this order: edge reuse, deterministic source policy, R2 reuse, bounded capture. Do not retry a known skip or bypass a capacity guard to improve coverage.
- Do not remove the deep-preview height ceiling, add another stored size/format, or schedule backfills without measured evidence that the browsing experience needs it.
- Browser Run is the only registered provider today. Adding a concrete provider requires its own adapter, registry entry, binding or secret configuration, and a provider-specific request, credit, and cost review.
- Before increasing daily admissions, provider budgets, retention, dimensions, quality, or byte limits, recalculate the worst-case provider and R2 envelope. Review `CF-Cache-Status`, `X-HN42-Screenshot-Cache`, `X-HN42-Screenshot-Provider`, `X-HN42-Browser-Ms-Used`, capture success/skip ratios, and average/p95 object size.
- Routine local development is reuse-only. Enable cold captures deliberately and narrowly because local and production use the same remote bindings and R2 bucket.

- Do not use the old `hn42.net/cdn-cgi/image/...` URL; that domain is no longer owned.
- Do not add `provider="cloudflare"` to `NuxtImg` for screenshots.
- Current screenshot rendering intentionally uses plain `<img>` tags to avoid Nuxt Image generating CDN proxy URLs.
- `server/api/screenshot/[id].ts` resolves and validates a live HN story, applies `sourcePolicy.ts`, checks R2, then delegates a verified miss to the provider orchestrator. Wrangler Workers Caching handles cache hits before the route executes.
- `sourcePolicy.ts` may keep the direct URL, transform the capture target, or skip capture. Keep source links in the UI pointed at the original HN story URL.
- Successful previews are bounded JPEGs stored through `SCREENSHOTS_BUCKET` under a provider-independent v7 key and reused for both variants. Preserve the winning provider in object metadata; do not add an image transformation or second object without a measured product need and cost review.
- `screenshotProviders` / `NUXT_SCREENSHOT_PROVIDERS` selects a comma-separated provider chain and defaults to `browser-run`. `screenshotProviderStrategy` / `NUXT_SCREENSHOT_PROVIDER_STRATEGY` accepts `ordered` by default or deterministic `balanced`; configuration must resolve only IDs registered in `providers/registry.ts`.
- Common preview parameters remain controlled by `screenshotPreview*`. Each provider adapter owns its provider-specific quota and cooldown. The current Browser Run adapter consumes the existing `screenshotCapture*` and `screenshotBrowser*` settings; its defaults enforce one concurrent capture, a shared 10-second start interval, a bounded queue, and a 60-capture UTC-day admission limit.
- Source policy runtime config includes `screenshotPolicyProbeTimeoutMs`, `screenshotXCancelBaseUrl`, and `screenshotPolicyBlockedHosts`; the host list extends the default blocked hosts.
- Concurrent provider-chain captures for the same source URL are coalesced within an isolate. Only chain-terminal provider failures write short-lived R2 markers under separate `.failure` keys so a cross-isolate failure cannot overwrite a valid image; unavailable- or capacity-only exhaustion does not. Failure markers carry the resolved provider-plan ID so a changed chain ignores older suppression state. Policy/probe skips must use the edge-cached transparent response and must not write R2 markers outside the daily admission budget.
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
- R2 lifecycle should delete the active `screenshots/v7/` prefix and legacy `screenshots/v3/` through `screenshots/v6/` prefixes after 180 days.
- At the default 60 admitted captures per UTC day, 180-day retention, and 2 MB hard object limit, steady-state v7 screenshot storage is bounded to about 21.6 GB before small coordinator and failure-marker overhead. Monitor average and p95 object size.
- Use `npm run cf:screenshots:bootstrap` to create missing screenshot R2 buckets, add the v3 through v7 lifecycle rules, and verify their enabled state, prefix, and expiry. The script is idempotent and fails on a drifted same-ID rule.
- Use `npm run cf:screenshots:reset-cache` only when intentionally deleting old cached objects under `screenshots/v2/`.
- Do not switch scripts back to `wrangler pages deploy` or `wrangler pages dev`.

For deployment config changes, verify:

```bash
npm run cf:screenshots:bootstrap
npm run build
npm run cf-typegen
npx wrangler deploy --dry-run
```

## Commands

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm test
npm run check
npm run preview
npm run deploy
npm run cf-typegen
npm run cf:screenshots:bootstrap
npm run cf:screenshots:reset-cache
npx wrangler deploy --dry-run
git diff --check
```

## Known Caveats

- The screenshot route can be slow on cold misses because it performs content verification and bounded sequential provider attempts.
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
