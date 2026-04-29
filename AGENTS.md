# HN42 Agent Guide

## App Overview

HN42 is a Nuxt Hacker News reader. It renders top, best, new, and show story feeds, story detail pages with comments, related-story suggestions, and per-story screenshots.

The app is an older codebase that has been upgraded to Nuxt 4. Keep changes conservative and preserve the existing app structure unless a migration explicitly requires moving files.

## Product Philosophy

Hacker News is valuable, but it can be text-heavy and hard to scan quickly. HN42 offers a more visual way to explore the same stories without changing the underlying source of truth.

The core product idea is that each story gets a full-page article screenshot. The screenshot helps users scan the shape and substance of an article before committing to reading it, and makes it easier to judge whether a story is worth opening. This is especially important because HN titles alone often hide the quality, length, or character of the linked content.

The app should feel fast and lightweight. Story data comes from Algolia-powered Hacker News APIs, and the UI should keep the browsing flow quick: glance, compare, open, or move on.

Visual diversity is intentional. Story cards use varied color palettes so the feed does not feel like a boring wall of text. Preserve that sense of color and texture when changing card layouts, screenshots, or feed presentation.

Do not turn HN42 into a dense text-first clone of Hacker News. Its purpose is to keep HN's speed and information density while adding enough visual context to make exploration easier.

## Tech Stack

- Framework: Nuxt 4 / Vue 3 / Nitro
- Styling: TailwindCSS
- Deployment: Cloudflare Workers with Workers Static Assets, not Cloudflare Pages
- Node: 22.12.0 or newer compatible with Nuxt 4 (`^20.19.0 || >=22.12.0`)
- Package manager: npm with `package-lock.json`

## Key Files

- `nuxt.config.ts`: Nuxt modules, Cloudflare Nitro preset, image settings, route rules.
- `wrangler.toml`: Cloudflare Workers deploy config. It should use `main = "./.output/server/index.mjs"` and `assets.directory = "./.output/public"`.
- `pages/top.vue`, `pages/best.vue`, `pages/new.vue`, `pages/show.vue`: feed pages.
- `pages/item/[id].vue`: story detail page with comments, screenshot, and related stories.
- `components/story/StoryGrid.vue`: feed grid wrapper.
- `components/story/StoryCard.vue`: individual feed card and screenshot display.
- `components/comment/CommentThread.vue`: nested comment rendering.
- `components/RelatedStories.vue`: related story list on detail pages.
- `server/api/top.ts`, `server/api/best.ts`, `server/api/new.ts`, `server/api/show.ts`: feed APIs.
- `server/api/item/[id].ts`: story detail API.
- `server/api/related/[id].ts`: related story API.
- `server/api/screenshot/[id].ts`: screenshot proxy and caching headers.
- `server/utils/fetchStories.ts`: Algolia story fetch helper.
- `server/utils/keywordExtractor.ts`: related-story keyword extraction.

## Cloudflare Deployment

This app deploys to Cloudflare Workers, not Pages.

- Nuxt/Nitro preset: `cloudflare-module`
- Build output:
  - Worker entry: `.output/server/index.mjs`
  - Static assets: `.output/public`
- Wrangler command: `wrangler deploy`
- Do not switch scripts back to `wrangler pages deploy` or `wrangler pages dev`.
- Keep `compatibility_flags = ["nodejs_compat"]` in `wrangler.toml`; Nitro uses Node compatibility in the Worker build.

## Images And Screenshots

The old Cloudflare Image CDN URL under `hn42.net/cdn-cgi/image/...` is no longer owned and must not be used.

- Story screenshots should render directly from `/api/screenshot/:id`.
- Do not add `provider="cloudflare"` to `NuxtImg` for screenshots.
- Current screenshot rendering intentionally uses plain `<img>` tags to avoid Nuxt Image generating CDN proxy URLs.
- `server/api/screenshot/[id].ts` fetches screenshots from `backup15.terasp.net` and sets cache headers. Preserve browser/CDN caching behavior so repeat views do not hammer the screenshot service.
- If changing screenshot cache behavior, verify headers on `/api/screenshot/:id` and keep a long shared-cache TTL unless there is a concrete invalidation need.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run deploy
npm run cf-typegen
npx wrangler deploy --dry-run
```

Use `npm run build` as the baseline verification. Use `npx wrangler deploy --dry-run` to validate Worker deploy config without publishing.

## Known Caveats

- Type checking currently reports pre-existing type issues across the codebase. Do not treat a failing `nuxi typecheck` as caused by your change unless you have isolated it.
- The image screenshot route can be slow because it proxies external screenshot generation. Cache headers are important.
- The dev server may need a restart after dependency or Nuxt/Nitro preset changes; hot reload can leave the app shell blank.
- Browser verification should use the in-app browser against `http://localhost:3000` when the server is already running.

## Working Conventions

- Preserve user changes in the worktree. Do not revert unrelated edits.
- Keep dependency and lockfile changes intentional and explainable.
- Prefer small compatibility fixes over broad refactors.
- For Cloudflare deployment changes, verify both `npm run build` and `npx wrangler deploy --dry-run` when possible.
- For UI changes, verify the app in the in-app browser and ignore known transient screenshot latency unless the task is specifically about images.
