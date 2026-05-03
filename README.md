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
through `/api/screenshot/:id`. The route checks Cloudflare `caches.default`,
then R2, then generates a fresh screenshot through backup15 on a miss.
Successful JPEG screenshots are stored temporarily in R2 under
`screenshots/v1/`; the bootstrap script creates `hn42-screenshots` and
`hn42-screenshots-dev` if missing, then adds a 30-day lifecycle rule for that
prefix. Screenshot fetches use a server-side queue so one Worker isolate does
not fan out many generation requests at once. The default server and client
screenshot queue concurrency is `1`; tune them with
`NUXT_SCREENSHOT_FETCH_CONCURRENCY` and
`NUXT_PUBLIC_SCREENSHOT_IMAGE_QUEUE_CONCURRENCY` if needed. The route also
coalesces concurrent captures for the same story and briefly remembers R2 misses
after failed captures to avoid repeated R2 reads during retry cooldowns. Failed
captures write a short-lived R2 failure marker at the screenshot key, so the app
does not repeatedly ask backup15 to regenerate a known-failing URL. Tune that
marker TTL with `NUXT_SCREENSHOT_FAILURE_TTL_MINUTES`.

Screenshot storage bootstrap can be rerun safely:

```bash
npm run cf:screenshots:bootstrap
```

## Data Sources

HN42 reads public Hacker News and Algolia-powered HN APIs. Article screenshots are requested from public story URLs and served through the app's screenshot route so they can be cached and reused.

There is no HN login, voting, posting, or private account integration.
