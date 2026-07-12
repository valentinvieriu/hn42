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
npm run cf:screenshots:bootstrap   # Create screenshot buckets/lifecycle rule
npm run cf:screenshots:reset-cache # Delete old screenshots/v2 objects
```

Use `npm run check` as the baseline check before shipping changes.

## Project Structure

- `app/pages/`: feed pages, story detail pages, and user activity pages.
- `app/components/story/`: story grid, visual story card UI, and the shared generated screenshot fallback.
- `app/components/comment/`: nested comment rendering.
- `server/api/`: feed, item, related-story, user, and screenshot APIs.
- `server/utils/feed.ts`: shared ordered-feed handler for the four HN feeds.
- `app/composables/`: shared client logic such as story loading and sanitization.
- `app/assets/css/main.css`: global typography and rich-text styling.
- `shared/types/index.ts`: story, comment, user, and activity types shared by the app and server.
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
npm run build
npm run cf-typegen
npx wrangler deploy --dry-run
```

### Screenshot generation strategy

Screenshots are a best-effort evaluation surface, not an archival copy of every
source page. HN42 needs a representative first viewport that helps a reader
decide whether a link is worth opening; complete page coverage is less valuable
than fast reuse, predictable cost, and a graceful fallback.

The pipeline follows this decision order:

1. Reuse the canonical response from Cloudflare's front-of-Worker cache when it
   exists.
2. Resolve the numeric HN item ID to its server-trusted source URL, then apply
   deterministic transforms and skips before spending browser time.
3. Reuse the single content-addressed preview from R2, including a stale preview
   when a fresh capture is temporarily unavailable.
4. On a genuine miss, verify that a bounded GET resolves to public HTML and
   admit the request only if capture is enabled and the shared Browser Run rate,
   queue, and daily budgets have capacity.
5. Capture one bounded first viewport, persist one JPEG in R2, and let all feed,
   detail, and social-preview consumers reuse the same canonical URL.
6. If any stage cannot justify or complete a capture, return the transparent
   response and keep the deterministic client wireframe visible.

Missing screenshots are acceptable; uncontrolled retries and duplicate assets
are not. Do not add full-page originals, a second stored variant, scheduled
backfills, or another processing provider without a measured product need and a
new Browser Run, R2 storage, and request-cost calculation.

Article screenshots are generated with the Cloudflare Browser Run `screenshot`
Quick Action and proxied through `/api/screenshot/:id`. The legacy
`?variant=original|thumbnail` values remain accepted, but the app uses the one
canonical URL so browsers and Cloudflare share a single cache entry. The public
route accepts only a numeric Hacker News item ID; callers cannot provide a
capture URL. On a cache miss the Worker resolves the item through HN Firebase,
requires a live story, extracts its public HTTP(S) URL, applies the screenshot
source policy, and checks R2 before invoking the private `BROWSER` binding.

Browser Run produces one bounded 720x1440 JPEG preview at quality 72. Full-page
capture and page scrolling are disabled, navigation waits for
`domcontentloaded`, unnecessary streaming resource types are rejected, and a
short post-load wait allows the initial viewport to settle. Both API variants
serve that same object, so a story requires one browser navigation, one R2 image,
and no image-transformation service. Successful previews are stored at
`screenshots/v3/<source-url-hash>/preview-720x1440-q72.jpg`. Direct captures use
the normalized story URL as the hash input, allowing repeat HN submissions of a
link to reuse the object. Transformed capture targets scope the hash to their
source strategy and transformed URL.

Wrangler Workers Caching is enabled in front of the Worker. This is the effective
edge cache on the production `workers.dev` hostname; the manual Cache API does
not operate on `workers.dev`. Successful images are cached in browsers for up to
30 days and at Cloudflare for the remaining portion of their 180-day R2
freshness window. Short-lived transparent fallbacks are
also cached so unavailable sources do not repeatedly invoke the Worker. SSR HTML
routes explicitly use `no-store`, while feed and API routes retain their own
short freshness policies. See [Workers Caching](https://developers.cloudflare.com/workers/cache/configuration/)
and the [Cache API hostname limitation](https://developers.cloudflare.com/r2/examples/cache-api/).

The `BROWSER` and `SCREENSHOTS_BUCKET` bindings use remote mode during local
development so existing production screenshots can be reused. New captures are
disabled by default in `npm run dev` and `npm run preview`; this avoids consuming
real Browser Run quota while browsing locally. To test a genuine cold capture
deliberately, start development with:

```bash
NUXT_SCREENSHOT_CAPTURE_ENABLED=true npm run dev
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
`text/html` or `application/xhtml+xml` before Browser Run is called. Direct
images, media, archives, Office files, unknown content types, invalid/private
redirects, unavailable resources, and failed verification return the transparent
fallback without invoking Browser Run.

When a screenshot is queued or unavailable, the client renders a deterministic,
non-semantic wireframe from the story ID and source domain. It is rendered
directly by Vue on feed and detail pages and is never stored as a screenshot.

Feed cards, story detail previews, and story social metadata use the same
canonical screenshot URL and bounded JPEG. Responsive detail rendering mounts
only the preview used at the current breakpoint, and offscreen feed tasks are
canceled before their network request starts. Responses expose
`X-HN42-Screenshot-Format`, `X-HN42-Screenshot-Processor`, and
`X-HN42-Browser-Ms-Used` for capture diagnostics. Tune Browser Run with
`NUXT_SCREENSHOT_CAPTURE_ENABLED`,
`NUXT_SCREENSHOT_CAPTURE_CONCURRENCY`,
`NUXT_SCREENSHOT_CAPTURE_DAILY_LIMIT`,
`NUXT_SCREENSHOT_CAPTURE_QUEUE_DEPTH`,
`NUXT_SCREENSHOT_CAPTURE_QUEUE_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSER_GOTO_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSER_ACTION_TIMEOUT_MS`,
`NUXT_SCREENSHOT_BROWSER_MIN_INTERVAL_MS`,
`NUXT_SCREENSHOT_BROWSER_WAIT_AFTER_LOAD_MS`,
`NUXT_SCREENSHOT_BROWSER_CACHE_TTL_SECONDS`,
`NUXT_SCREENSHOT_PREVIEW_WIDTH`,
`NUXT_SCREENSHOT_PREVIEW_HEIGHT`,
`NUXT_SCREENSHOT_PREVIEW_JPEG_QUALITY`, and
`NUXT_SCREENSHOT_PREVIEW_MAX_BYTES`. Source policy settings remain
available through `NUXT_SCREENSHOT_POLICY_PROBE_TIMEOUT_MS`,
`NUXT_SCREENSHOT_X_CANCEL_BASE_URL`, and
`NUXT_SCREENSHOT_POLICY_BLOCKED_HOSTS`.

Use `CF-Cache-Status` to verify the front-of-Worker cache. On an origin execution,
`X-HN42-Screenshot-Cache` reports `MISS`, `R2`, `STALE`, or `FALLBACK`. Because a
cached response bypasses the Worker, its `X-HN42-*` headers describe the response
that originally populated the cache; `X-HN42-Browser-Ms-Used` is capture-generation
metadata, not proof that the current request consumed browser time.

The route coalesces concurrent captures for the same source URL within a Worker
isolate, spaces Browser Run starts through a shared R2 coordinator, uses Browser
Run's 24-hour Quick Action cache as an additional duplicate safeguard, and writes
short-lived R2 failure markers for admitted provider failures at keys separate
from successful images. Policy skips use only the cached transparent response,
so arbitrary non-HTML stories cannot amplify R2 writes. Separate
keys prevent a late failure in one isolate from overwriting a successful capture
from another isolate.
Tune marker lifetime with `NUXT_SCREENSHOT_FAILURE_TTL_MINUTES`. Responses also
include `X-HN42-Screenshot-Policy`, `X-HN42-Screenshot-Source-Strategy`, and,
for skips, `X-HN42-Screenshot-Skip-Reason`.

### Screenshot cost envelope

As of July 2026, the relevant free allowances are:

- Browser Run: 10 browser minutes per day and one Quick Action every 10 seconds.
- R2 Standard: 10 GB-month, 1 million Class A operations, and 10 million Class B
  operations per month, with free egress.
- Workers Free: 100,000 requests per day and 10 ms CPU per invocation; a Workers
  Caching hit still counts as a request but does not run Worker code.

HN42 defaults to one concurrent capture, a shared 10-second start interval, a
five-request queue with a 30-second timeout, and at most 60 admitted cold
captures per UTC day. With 180-day retention and a 750 KB hard object limit,
that caps steady-state screenshot storage at about 8.1 GB before the small
coordinator and failure-marker overhead. Average and p95 object size should
still be monitored. Browser time can stop captures before the daily
count limit when pages are slow. Browser Run on Workers Free stops at its limit;
R2 and paid-plan usage can be billed beyond included allowances. See [Browser Run pricing](https://developers.cloudflare.com/browser-run/pricing/),
[Browser Run limits](https://developers.cloudflare.com/browser-run/limits/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/), and
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

The storage bound depends on the 180-day v3 lifecycle rule being active; the
bootstrap command below verifies the rule rather than assuming it exists.

Screenshot storage bootstrap can be rerun safely:

```bash
npm run cf:screenshots:bootstrap
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
