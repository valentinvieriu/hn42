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
```

Use `npm run check` as the baseline check before shipping changes.

## Project Structure

- `app/pages/`: feed pages, story detail pages, and user activity pages.
- `app/components/story/`: story grid, visual story card UI, and the shared generated screenshot fallback.
- `app/components/comment/`: nested comment rendering.
- `server/api/`: feed, item, related-story, user, and screenshot APIs.
- `server/api/internal/screenshot-jobs/`: authenticated capture-agent API.
- `server/utils/screenshot/`: HN source policy, R2 state, result validation, and agent authentication.
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

Screenshots are generated only by the background pipeline:

1. Every ten minutes, the scheduler scans the first 100 Top, Best, New, and
   Show stories.
2. Seven-day R2 admission markers under
   `screenshot-jobs/v1/v9/<hn-id>` stop recurring feed stories from being
   enqueued repeatedly. No D1 database is used.
3. The scheduler enforces at most 1,000 admissions per UTC day and stops
   admitting work when current v9 storage plus worst-case reservations for the
   previous 24 hours would reach 10 GB.
4. Cloudflare Queues leases jobs to stateless HomeLabs pull agents.
5. Prepare performs one metadata-only R2 check. Only a missing or expired
   preview causes HN source resolution, source-policy filtering, and the bounded
   public-HTML probe.
6. The agent captures eligible pages through the narrow local Browserless API
   and uploads one validated WebP. Terminal page/output errors are acknowledged;
   temporary infrastructure errors retry through Queue.
7. The public route performs one R2 read and serves a fresh or stale image, or
   the transparent GIF that exposes the client-rendered wireframe. It never
   starts browser work.

The only image object is
`screenshots/v9/items/<hn-id>/preview-1440x11111-q55.webp`. HN ID is the sole
identity. Captures remain capped at 1440x11111, 16 megapixels, and 2 MB.
The app uses `?profile=v9` as the only cache-busting dimension.

The source policy transforms X/Twitter status URLs through XCancel, transforms
`arxiv.org/pdf/...` to the HTML abstract, and skips obvious PDFs, private
targets, non-HTML content, and known blocked hosts before Browserless is called.
Skipped and terminally failed stories rely on their existing admission marker;
there is no separate R2 failure object.

Wrangler Workers Caching remains in front of the public Worker. Screenshot
freshness and the active v9 lifecycle are 14 days. Missing screenshots use a
short cache window so a completed background capture becomes visible quickly.

### Screenshot free-tier envelope

The guardrails target the current Cloudflare free allowances:

- Queue Free includes 10,000 operations per day. A normal message costs one
  write, one read, and one delete, so 1,000 daily admissions consume at most
  3,000 base operations and leave substantial retry headroom.
- R2 Standard includes 10 GB-month, one million Class A operations, and ten
  million Class B operations per month. The scheduler refreshes a v9 byte-count
  snapshot at most hourly and reserves the 2 MB maximum for recently admitted
  jobs before adding work.
- One admission marker PUT, one preview HEAD, and at most one screenshot PUT are
  used per normal job. Successful uploads no longer perform a failure-marker
  delete.
- Public misses perform one R2 GET and return the generated fallback without a
  second metadata lookup.
- The ten-minute schedule reduces repeated LIST and upstream-feed requests
  without limiting the number of new stories discovered.

See [R2 pricing](https://developers.cloudflare.com/r2/pricing/) and
[Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

The storage bootstrap now manages only the active v9 image rule and the
admission-marker rule:

```bash
npm run cf:screenshots:bootstrap
npm run cf:screenshots:jobs:bootstrap
```

Legacy screenshot objects and lifecycle rules are not recreated. Remove the old
v1-v8 objects and rules once during the v9 cleanup.

## Data Sources

HN42 reads public Hacker News and Algolia-powered HN APIs. Article screenshots are requested from public story URLs and served through the app's screenshot route so they can be cached and reused.

There is no HN login, voting, posting, or private account integration.
