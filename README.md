# HN42

HN42 is a visual Hacker News reader. It keeps Hacker News as the source of truth, but gives readers a more visual way to scan stories, judge links, and read discussions.

Live app: https://hn42.vv42.workers.dev/

## Why HN42 Exists

Hacker News is fast and information-dense, but it is also heavily text-based. A title, score, and comment count do not always tell you what you are about to open. Some links are thoughtful essays, papers, or useful technical writeups. Others are thin product pages, ad-heavy landing pages, paywalls, modals, or low-signal posts.

HN42 adds visual context before the click. Each story card includes a preview of the linked page so you can quickly ask:

- Does this look like a real article, paper, announcement, or discussion starter?
- Is the page readable, substantial, and worth opening?
- Does it look like a marketing page, dark pattern, modal wall, or low-value landing page?
- Do I want the article, the HN discussion, or neither?

The goal is not to replace Hacker News. It is an alternative way to consume the same public HN stories: more visual, easier to scan, and still quick.

## What It Does

- Shows Top, Best, New, and Show HN feeds.
- Presents each story with a visual page preview, title, source, freshness, author, points, and comment count.
- Opens an HN42 story page for the card, with metadata, comments, screenshot, and related stories.
- Opens the original source from the source/domain link.
- Renders HN comments with safer rich text, nested threads, quote handling, reference links, and expand controls.
- Includes user activity pages for posts and comments.
- Supports responsive layouts and dark mode.
- Avoids analytics and marketing cookies.

## Product Philosophy

HN42 treats each story as something to evaluate visually before reading. The screenshot is not decoration; it is the main browsing affordance.

The card model is intentionally simple:

- The preview helps you judge the linked page.
- The title confirms what the story is.
- The source and timestamp orient you.
- The score and comments provide HN context.
- The card opens the HN42 story page.
- The source link opens the external article.

This keeps the browsing flow direct: scan, compare, open, or move on.

## Tech Stack

- Nuxt 4 / Vue 3 / Nitro
- TailwindCSS
- TypeScript
- Lucide icons
- Cloudflare Workers with Workers Static Assets
- npm with `package-lock.json`

## Getting Started

Requirements:

- Node.js 22.12.0 or newer compatible with Nuxt 4
- npm

Install dependencies:

```bash
git clone https://github.com/valentinvieriu/hn42.git
cd hn42
npm install
```

Start the development server:

```bash
npm run dev
```

Nuxt usually serves the app at `http://localhost:3000`, but it may choose another port if that one is already in use.

## Useful Commands

```bash
npm run dev          # Start local development
npm run build        # Build for production
npm run typecheck    # Check Vue, Nuxt, and server TypeScript
npm test             # Run unit tests
npm run check        # Run type checking, tests, and production build
npm run preview      # Build and preview with Wrangler
npm run deploy       # Build and deploy to Cloudflare Workers
npm run cf-typegen   # Generate Cloudflare Worker types
npm run build:screenshot-agent       # Type-check and bundle the pull consumer
npm run cf:screenshots:bootstrap   # Create screenshot buckets/lifecycle rule
npm run cf:screenshots:jobs:bootstrap # Create Queue, DLQ, and pull consumer
npm run cf:screenshots:scheduler:deploy # Deploy scheduler and Cron trigger
npm run cf:screenshots:scheduler:dry-run # Validate scheduler Worker bundle
npm run cf:screenshots:reset-cache # Delete old screenshots/v2 objects
```

Use `npm run check` as the baseline check before shipping changes.

## Project Structure

- `app/pages/`: feed pages, story detail pages, and user activity pages.
- `app/components/story/`: story grid, visual story card UI, and the shared generated screenshot fallback.
- `app/components/comment/`: nested comment rendering.
- `server/api/`: feed, item, related-story, user, and screenshot APIs.
- `server/api/internal/screenshot-jobs/`: authenticated capture-agent API.
- `server/utils/screenshot/providers/`: provider contract, registry, orchestration, and concrete capture adapters.
- `workers/screenshot-scheduler/`: Cron Worker that admits current feed stories to Cloudflare Queues.
- `capture-agent/`: stateless Queue pull consumer and container image.
- `server/utils/feed.ts`: shared ordered-feed handler and short Nitro SWR data cache for the four HN feeds.
- `server/utils/userActivityHandler.ts`: shared wrapper for paginated user activity routes.
- `server/plugins/removeInlinedStylesheets.ts`: removes duplicate Nuxt stylesheet links after SSR has inlined the same critical CSS.
- `app/composables/`: shared client logic such as story loading and sanitization.
- `app/utils/storyScreenshotObserver.ts`: shared feed-card screenshot preload observer.
- `app/assets/css/main.css`: global typography and rich-text styling.
- `shared/types/index.ts`: story, comment, user, and activity types shared by the app and server.
- `shared/utils/`: framework-neutral HN paths, dates, screenshot paths, timing, and comment-tree analysis.
- `wrangler.toml`: Cloudflare Workers deployment config.

## Deployment

HN42 deploys to Cloudflare Workers, not Cloudflare Pages.

Production is hosted at:

```text
https://hn42.vv42.workers.dev/
```

The Worker entry and static asset output are configured in `wrangler.toml`:

- Worker entry: `.output/server/index.mjs`
- Static assets: `.output/public`
- Browser Run binding: `BROWSER`
- Screenshot R2 binding: `SCREENSHOTS_BUCKET`
- Front-of-Worker response cache: Wrangler `[cache] enabled = true`

Before deployment, use:

```bash
npm run cf:screenshots:bootstrap
npm run cf:screenshots:jobs:bootstrap
npm run build
npm run cf-typegen
npx wrangler deploy --dry-run
npm run cf:screenshots:scheduler:dry-run
```

Initial background-capture setup also requires a shared random agent secret on
the HN42 Worker, a Queue read/write API token for the HomeLabs agents, and the
queue ID reported by Cloudflare. Deploy the HN42 Worker after adding
`HN42_SCREENSHOT_AGENT_TOKEN`, then run
`npm run cf:screenshots:scheduler:deploy`. The image workflow publishes the
capture agent to `ghcr.io/valentinvieriu/hn42-screenshot-agent`.

### Screenshot generation strategy

Screenshots are a best-effort evaluation surface, not an archival copy of every
source page. HN42 captures a bounded full-page preview so a desktop reader can
scan the article alongside the comments instead of seeing only a hero crop.
Compact layouts deliberately keep a scroll-safe crop. Captures remain bounded
by a 16-megapixel geometry ceiling and a 2 MB response limit, so extremely long
pages can still end before the document does.

The production pipeline follows this decision order:

1. Reuse the canonical response from Cloudflare's front-of-Worker cache when it
   exists.
2. A Cron Worker scans the first 100 Top, Best, New, and Show stories every three
   minutes. An R2 admission marker prevents the same story being enqueued again
   for seven days; no D1 database is involved.
3. Cloudflare Queues distributes jobs across any number of identical local pull
   consumers. Each consumer asks HN42 to resolve the numeric story ID, apply the
   source policy, check R2, and probe public HTML before browser work begins.
4. Eligible jobs use the private local Browserless screenshot API. Only a result
   that passes the shared bounded-WebP and metadata checks is uploaded to the
   canonical R2 key.
5. Ready objects, deterministic skips, cooldowns, and terminal page failures are
   acknowledged independently. Network and capacity failures are delayed and
   retried, so one bad story cannot block the leased batch.
6. The public route is reuse-only by default. It serves the R2 image when ready,
   otherwise its transparent 1x1 GIF leaves the deterministic client-rendered
   SVG wireframe visible without waiting for capture.

Missing screenshots are acceptable; uncontrolled retries and duplicate assets
are not. Do not raise the 16-megapixel or 2 MB ceilings, add a second stored
variant, or schedule backfills without measured product need and a new R2
storage and request-cost calculation. The registered providers are the local
Browserless screenshot proxy and Cloudflare Browser Run. Adding another
concrete provider requires its own adapter, registry entry, binding or secret
configuration, and provider-specific credit and cost review.

Article screenshots are served through `/api/screenshot/:id`. The app appends
the single current `?profile=v8` cache version so intentional capture-profile
migrations bypass old immutable browser and edge entries. The legacy
`variant=original|thumbnail` values remain accepted, but the app does not use
them. The public route accepts only a numeric Hacker News item ID; callers
cannot provide a capture URL. On a cache miss the Worker resolves the item
through HN Firebase, requires a live story, extracts its public HTTP(S) URL,
applies deterministic source policy, and checks R2. Production request-time
capture is disabled by `screenshotRequestCaptureEnabled=false`; the background
agent's authenticated prepare endpoint owns the content probe and capture work.

Provider adapters implement the shared contract in
`server/utils/screenshot/providers/types.ts`. The orchestrator in
`providers/orchestrator.ts` resolves configured IDs through
`providers/registry.ts`, tries them sequentially, and validates their output
against one WebP contract. `ordered` uses the configured order. Deterministic
`balanced` rotates the primary provider from the stable source hash while
retaining every other configured provider as the fallback chain. Each adapter
owns its quota and cooldown behavior. Configure the comma-separated IDs with
`screenshotProviders` / `NUXT_SCREENSHOT_PROVIDERS`. `npm run dev` defaults to
`browserless-proxy`; production builds default to `browser-run`. Configure
`browserless-proxy,browser-run` explicitly when testing an ordered local-first
fallback chain. Select the strategy with `screenshotProviderStrategy` /
`NUXT_SCREENSHOT_PROVIDER_STRATEGY` (`ordered` by default or `balanced`).
An explicitly empty provider list disables cold capture; it does not silently
fall back to Browser Run.

The first successful result is written once to the provider-independent
`screenshots/v8/<source-url-hash>/preview-1440x11111-q55.webp` key, with the
winning provider retained in R2 metadata. Direct captures use the normalized
story URL as the hash input, allowing repeat HN submissions of a link to reuse
the object. Transformed capture targets scope the hash to their source strategy
and transformed URL. Active v8 objects expire after 30 days. Existing v3 through
v7 objects are not migrated or deleted early; their 180-day legacy lifecycle
rules let them expire naturally.

#### Browserless proxy provider

The `browserless-proxy` adapter in
`server/utils/screenshot/providers/browserlessProxy.ts` calls the narrow
consumer API at `https://screenshots.dev.localhost/v1/screenshots`; it never
calls the raw Browserless function or screenshot routes. Authentication uses a
private Bearer token supplied through
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_TOKEN`, so the token is not placed in a URL,
source file, or log message.

For `npm run dev`, screenshot `NUXT_SCREENSHOT_*` values may live in either
Nuxt's `.env` file or Wrangler's ignored `.dev.vars` file. The screenshot route
overlays string values from Cloudflare bindings onto its private runtime config,
so the same names work in both places. `SCREENSHOT_API_TOKEN` remains supported
as the provider-specific Worker secret and takes precedence over the Nuxt token
name.

The adapter requests the proxy's bounded `fullPage` profile with a 1440x900
desktop viewport and WebP quality 55. HN42 and the proxy independently enforce
the same 16-megapixel geometry budget, which gives the default width a maximum
height of 11,111 pixels. The outer proxy request keeps a 45-second budget so a
cold full-page render is not abandoned while the proxy is still encoding it.
HN42 streams at most `screenshotPreviewMaxBytes`,
accepts `ok` and `access_gate` outcomes, and rejects challenge,
navigation-error, HTTP-error, oversized, or non-direct results. In particular,
an internal Ladder route is rejected before R2 persistence because it would
otherwise place transformed content under the direct source key. The provider
chain can then try Browser Run or expose the SVG fallback, depending on its
configured order.

The `.dev.localhost` service is intentionally local-only. The Node process must
resolve `screenshots.dev.localhost`, and its local CA must be trusted before
Nuxt starts. For the checked-out HomeLabs stack, a deliberate local capture can
be started with:

```bash
NODE_EXTRA_CA_CERTS=/Users/valentin/Projects/HomeLabs/macbook/services/traefik/data/certs/ca.crt.pem \
NUXT_SCREENSHOT_CAPTURE_ENABLED=true \
NUXT_SCREENSHOT_BROWSERLESS_PROXY_TOKEN='<local SCREENSHOT_API_TOKEN>' \
npm run dev
```

If the nested hostname does not resolve, add the exact
`screenshots.dev.localhost` loopback mapping to the local resolver or hosts
file. Do not disable TLS verification. Local cold captures still write to the
shared production R2 bucket. A deployed Worker cannot reach `.localhost`; keep
the production default on Browser Run unless the narrow proxy is deliberately
published through an authenticated, trusted endpoint.

#### Browser Run provider

The `browser-run` adapter in
`server/utils/screenshot/providers/browserRun.ts` uses the Cloudflare Browser
Run `screenshot` Quick Action through the private `BROWSER` binding.

Browser Run uses a wide desktop 1440x900 viewport and produces one WebP
full-page preview up to 1440x11111 at quality 55. Full-page capture and capture
beyond the viewport are enabled only after an injected script measures the
rendered page and clamps it to the shared 16-megapixel ceiling; page scrolling
remains disabled. Navigation waits for `domcontentloaded`, unnecessary
streaming resource types are rejected, and a short post-load wait allows the
initial viewport to settle. Both API variants
serve that same object, so a story requires one browser navigation, one R2 image,
and no image-transformation service when this adapter succeeds. Its Quick
Action response cache remains disabled so capture-profile changes cannot reuse
incompatible output. The adapter consumes every response body and explicitly
disposes the RPC result so remote development does not leak stubs.

Wrangler Workers Caching is enabled in front of the Worker. This is the effective
edge cache on the production `workers.dev` hostname; the manual Cache API does
not operate on `workers.dev`. Successful images are cached in browsers and at
Cloudflare only for the remaining portion of their 30-day R2 freshness window.
Transient transparent fallbacks cache for 5 seconds in the
browser and 15 seconds at the edge; the detail page retries the same canonical
URL after 16 seconds and once more after 45 seconds so a startup or capacity
race does not remain a permanent wireframe. Deterministic policy skips retain
their longer cache window, and retries do not add a query dimension. SSR HTML
routes explicitly use `no-store`, while feed and API routes retain their own
short freshness policies. Feed data also uses a four-entry, per-isolate Nitro
stale-while-revalidate cache so internal SSR requests can reuse the same
120-second result without bypassing page `no-store`; shared edge caching remains
the cross-isolate reuse layer. See [Workers Caching](https://developers.cloudflare.com/workers/cache/configuration/)
and the [Cache API hostname limitation](https://developers.cloudflare.com/r2/examples/cache-api/).

Nuxt's `features.inlineStyles` remains enabled so first paint does not wait for
route CSS. The Nitro render hook removes only duplicate generated `/_nuxt/*.css`
links from initial SSR HTML; the client manifest remains intact for navigation.

The `BROWSER` and `SCREENSHOTS_BUCKET` bindings use remote mode during local
development so existing production screenshots can be reused. New request-time
captures are disabled by default in every environment; this keeps the frontend
and public route out of the capture pipeline. To test a genuine request-time
Browser Run cold capture deliberately, select it explicitly:

```bash
NUXT_SCREENSHOT_CAPTURE_ENABLED=true \
NUXT_SCREENSHOT_REQUEST_CAPTURE_ENABLED=true \
NUXT_SCREENSHOT_PROVIDERS=browser-run \
npm run dev
```

That opt-in can write to the shared production R2 bucket and consumes real
Browser Run usage. Cloudflare authentication is required, and the Nuxt server
must be restarted after binding changes.

The source policy keeps source links unchanged for readers but can choose a
different capture target or skip capture before spending browser time. Current
rules transform X/Twitter status URLs through XCancel, transform
`arxiv.org/pdf/...` links to their HTML abstract pages, skip generic PDFs and
obvious PDF query shapes, and skip a default list of known paywall or bot-check
domains. A bounded ranged GET must confirm
`text/html` or `application/xhtml+xml` before the capture agent is allowed to call Browserless. Direct
images, media, archives, Office files, unknown content types, invalid/private
redirects, unavailable resources, and failed verification return the transparent
fallback without invoking a provider.

When a screenshot is queued or unavailable, the client renders a deterministic,
non-semantic inline SVG wireframe from the story ID and source domain. It is
rendered directly by Vue on feed and detail pages and is never stored as a
screenshot. The server's final 1x1 GIF makes that underlying wireframe visible.

Feed cards, story detail previews, and story social metadata use the same
profile-versioned screenshot URL and bounded WebP. On desktop, the detail page
renders the captured height inline next to the comments and widens the preview
column on large screens; the full-size dialog remains available for pixel-level
inspection. Compact layouts retain a scroll-safe crop. Offscreen feed tasks are
canceled before their network request starts. Responses expose
`X-HN42-Screenshot-Format`, `X-HN42-Screenshot-Processor`,
`X-HN42-Screenshot-Provider`, and `X-HN42-Browser-Ms-Used` for capture
diagnostics. Configure orchestration with `NUXT_SCREENSHOT_PROVIDERS` and
`NUXT_SCREENSHOT_PROVIDER_STRATEGY`. Configure the Browserless proxy with
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_URL`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_TOKEN`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_REQUEST_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_NAVIGATION_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_SETTLE_MS`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_VIEWPORT_HEIGHT`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_CONCURRENCY`,
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_QUEUE_DEPTH`, and
`NUXT_SCREENSHOT_BROWSERLESS_PROXY_QUEUE_TIMEOUT_MS`. Tune Browser Run with
`NUXT_SCREENSHOT_CAPTURE_ENABLED`,
`NUXT_SCREENSHOT_CAPTURE_CONCURRENCY`,
`NUXT_SCREENSHOT_CAPTURE_DAILY_LIMIT`,
`NUXT_SCREENSHOT_CAPTURE_QUEUE_DEPTH`,
`NUXT_SCREENSHOT_CAPTURE_QUEUE_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSER_GOTO_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSER_ACTION_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSER_MIN_INTERVAL_MS`,
`NUXT_SCREENSHOT_BROWSER_VIEWPORT_HEIGHT`,
`NUXT_SCREENSHOT_BROWSER_WAIT_AFTER_LOAD_MS`,
`NUXT_SCREENSHOT_BROWSER_CACHE_TTL_SECONDS`,
`NUXT_SCREENSHOT_PREVIEW_WIDTH`,
`NUXT_SCREENSHOT_PREVIEW_HEIGHT`,
`NUXT_SCREENSHOT_PREVIEW_WEBP_QUALITY`, and
`NUXT_SCREENSHOT_PREVIEW_MAX_BYTES`. Source policy settings remain
available through `NUXT_SCREENSHOT_POLICY_PROBE_TIMEOUT_MS`,
`NUXT_SCREENSHOT_X_CANCEL_BASE_URL`, and
`NUXT_SCREENSHOT_POLICY_BLOCKED_HOSTS`.

Use `CF-Cache-Status` to verify the front-of-Worker cache. On an origin execution,
`X-HN42-Screenshot-Cache` reports `MISS`, `R2`, `STALE`, or `FALLBACK`. Because a
cached response bypasses the Worker, its `X-HN42-*` headers describe the response
that originally populated the cache; `X-HN42-Browser-Ms-Used` is capture-generation
metadata, not proof that the current request consumed browser time.

Feed cards mount their screenshot image when they enter the Intersection Observer
preload margin. These requests only read the edge/R2 result or receive the
transparent fallback; they do not enter the capture queue.

The route coalesces concurrent captures for the same source URL within a Worker
isolate and uses R2 as the canonical shared reuse layer. It writes a short-lived
R2 failure marker at a key separate from the successful image only when the
entire chain ends in a provider failure. If every attempted provider was merely
unavailable or capacity-limited, it returns the transient fallback without a
marker so another request can use recovered capacity. Failure markers include
the resolved provider-plan ID, so changing the provider order or strategy does
not let an older marker suppress the new chain. Policy skips use only the
cached transparent response, so arbitrary non-HTML stories cannot amplify R2
writes. Separate keys prevent a late terminal failure in one isolate from
overwriting a successful capture from another isolate.
Tune marker lifetime with `NUXT_SCREENSHOT_FAILURE_TTL_MINUTES`. Responses also
include `X-HN42-Screenshot-Policy`, `X-HN42-Screenshot-Source-Strategy`, and,
for skips, `X-HN42-Screenshot-Skip-Reason`.

The provider adapters remain available for deliberate request-time diagnostics,
but they are not the normal production capture path. The background agent uses
the narrow Browserless proxy; Cloudflare Queue leases are the shared capacity and
retry boundary across local instances.

### Screenshot cost envelope

As of July 2026, the relevant free allowances are:

- Browser Run: 10 browser minutes per day and one Quick Action every 10 seconds.
- R2 Standard: 10 GB-month, 1 million Class A operations, and 10 million Class B
  operations per month, with free egress.
- Workers Free: 100,000 requests per day and 10 ms CPU per invocation; a Workers
  Caching hit still counts as a request but does not run Worker code.

There is no artificial 60-per-day admission limit. The scheduler admits new
stories appearing in the first 100 positions of the four feeds, while Queue
leases and the local screenshot API provide backpressure. Active v8 screenshots
expire after 30 days and remain capped at 2 MB each. Seven-day admission markers
and short failure markers are empty metadata objects, not placeholder images.
Monitor queue backlog, capture success/skip ratio, and average/p95 WebP size
before raising local concurrency. See [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

The bootstrap command below verifies the active 30-day v8 rule, seven-day job
admission rule, and 180-day legacy v3 through v7 rules.

Screenshot storage bootstrap can be rerun safely:

```bash
npm run cf:screenshots:bootstrap
npm run cf:screenshots:jobs:bootstrap
```

The old v2 cache can be deleted after deploying the v3 screenshot route:

```bash
npm run cf:screenshots:reset-cache
```

The reset script deletes only `screenshots/v2/` objects by default and requires R2 S3
credentials in `CLOUDFLARE_ACCOUNT_ID` plus
`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` or the equivalent AWS environment
variables.

## Data Sources

HN42 reads public Hacker News and Algolia-powered HN APIs. Article screenshots are requested from public story URLs and served through the app's screenshot route so they can be cached and reused.

There is no HN login, voting, posting, or private account integration.
