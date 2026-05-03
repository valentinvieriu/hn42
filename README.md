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
npm run preview      # Build and preview with Wrangler
npm run deploy       # Build and deploy to Cloudflare Workers
npm run cf-typegen   # Generate Cloudflare Worker types
npm run cf:screenshots:bootstrap   # Create screenshot buckets/lifecycle rule
npm run cf:screenshots:reset-cache # Delete old screenshots/v1 objects
```

Use `npm run build` as the baseline check before shipping changes.

## Project Structure

- `app/pages/`: feed pages, story detail pages, and user activity pages.
- `app/components/story/`: story grid and visual story card UI.
- `app/components/comment/`: nested comment rendering.
- `server/api/`: feed, item, related-story, user, and screenshot APIs.
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
- Screenshot R2 binding: `SCREENSHOTS_BUCKET`

Before deployment, use:

```bash
npm run cf:screenshots:bootstrap
npm run build
npm run cf-typegen
npx wrangler deploy --dry-run
```

Article screenshots are generated through `backup15.terasp.net` and proxied
through `/api/screenshot/:id?variant=original|thumbnail`. The route checks
Cloudflare `caches.default`, resolves the story URL, applies a screenshot source
policy, checks R2, then generates a fresh original JPEG through backup15 on a
miss. Successful originals and generated thumbnails are stored temporarily in R2
under `screenshots/v2/<source-url-hash>/`. Direct captures keep using the
normalized story URL as the hash input so repeated HN submissions of the same
link reuse the same objects; transformed captures scope the hash to the source
strategy and transformed capture URL.
The bootstrap script creates `hn42-screenshots` and `hn42-screenshots-dev` if
missing, then adds a 30-day lifecycle rule for the `screenshots/v2/` prefix.

The source policy keeps source links unchanged for readers but can choose a
different capture target or skip capture before spending a browser API call.
Current rules transform X/Twitter status URLs through XCancel, transform
`arxiv.org/pdf/...` links to their `arxiv.org/abs/...` page, skip generic PDFs
and obvious PDF query shapes, and skip a small default list of known paywall or
bot-check domains (`nytimes.com`, `wsj.com`, `bloomberg.com`, `ft.com`,
`economist.com`, and `washingtonpost.com`, including subdomains). After R2
misses, the route also runs a bounded HEAD probe before capture and skips URLs
that declare `application/pdf`, a PDF filename in `Content-Disposition`, or
obvious non-HTML downloads/media such as audio, video, archives, Office files,
and generic binary streams. Skipped screenshots return the transparent fallback
and include policy headers instead of calling backup15.

Feed cards request the `thumbnail` variant. The thumbnail is derived inside the
Worker from the original JPEG. R2 lookup prefers the canonical Cloudflare Images
WebP thumbnail at `thumbnail-720x1440-q78.webp`, then falls back to the legacy
WASM-generated JPEG at `thumbnail-720x1440-q78.jpg`, then falls back to serving
the original JPEG for the thumbnail response if no safe thumbnail can be created.
Story detail pages request the `original` variant. Cloudflare Images
transformations run only on thumbnail misses through the `IMAGES` binding in
built Worker runtimes; Nuxt dev explicitly skips Images and uses the WASM path
so local development does not require the Images service. If Images is absent,
exhausted, over limit, or times out, the existing WASM-backed JPEG
decode/resize/encode path is used. The route uses response `Content-Type` and
`X-HN42-Screenshot-Format`/`X-HN42-Screenshot-Processor` headers to identify
WebP, JPEG, or original fallback responses.

To stay within Worker memory limits, WASM thumbnail processing checks JPEG
dimensions before decoding and falls back to the original JPEG when the source
image is too large to safely expand to RGBA. Screenshot fetches, Cloudflare
Images transforms, and WASM thumbnail processing each use server-side queues so
one Worker isolate does not fan out many generation or image-processing tasks at
once. Tune the defaults with
`NUXT_SCREENSHOT_FETCH_CONCURRENCY`,
`NUXT_SCREENSHOT_THUMBNAIL_PROCESSING_CONCURRENCY`,
`NUXT_SCREENSHOT_THUMBNAIL_PROCESSING_QUEUE_TIMEOUT_MS`,
`NUXT_SCREENSHOT_THUMBNAIL_PROCESSING_TIMEOUT_MS`,
`NUXT_SCREENSHOT_THUMBNAIL_WIDTH`,
`NUXT_SCREENSHOT_THUMBNAIL_HEIGHT`,
`NUXT_SCREENSHOT_THUMBNAIL_MAX_INPUT_PIXELS`,
`NUXT_SCREENSHOT_THUMBNAIL_JPEG_QUALITY`, and
`NUXT_PUBLIC_SCREENSHOT_IMAGE_QUEUE_CONCURRENCY` if needed. Tune screenshot
policy behavior with `NUXT_SCREENSHOT_POLICY_HEAD_PROBE_TIMEOUT_MS`,
`NUXT_SCREENSHOT_X_CANCEL_BASE_URL`, and
`NUXT_SCREENSHOT_POLICY_BLOCKED_HOSTS`; the blocked-host setting extends the
default list with comma-separated hostnames.

The route coalesces concurrent captures for the same source URL and briefly
remembers R2 misses after failed captures to avoid repeated R2 reads during
retry cooldowns. Failed captures write short-lived R2 failure markers at the
relevant variant key. Thumbnail processing writes a marker only when Cloudflare
Images is actually attempted and the WASM fallback also fails, so quota
exhaustion does not poison future thumbnail generation. Tune that marker TTL
with `NUXT_SCREENSHOT_FAILURE_TTL_MINUTES`. Responses include
`X-HN42-Screenshot-Policy`, `X-HN42-Screenshot-Source-Strategy`, and, for
skips, `X-HN42-Screenshot-Skip-Reason`; this keeps the current public image API
stable while leaving a provider extension point for future lawful or authorized
capture providers.

Screenshot storage bootstrap can be rerun safely:

```bash
npm run cf:screenshots:bootstrap
```

The old v1 cache can be deleted after deploying the v2 screenshot route:

```bash
npm run cf:screenshots:reset-cache
```

The reset script deletes only `screenshots/v1/` objects and requires R2 S3
credentials in `CLOUDFLARE_ACCOUNT_ID` plus
`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` or the equivalent AWS environment
variables.

## Data Sources

HN42 reads public Hacker News and Algolia-powered HN APIs. Article screenshots are requested from public story URLs and served through the app's screenshot route so they can be cached and reused.

There is no HN login, voting, posting, or private account integration.
