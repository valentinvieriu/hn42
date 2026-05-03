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

- `app/pages/top.vue`, `app/pages/best.vue`, `app/pages/new.vue`, `app/pages/show.vue`: feed pages.
- `app/pages/item/[id].vue`: story detail page with metadata, screenshot, comments, and related stories.
- `app/pages/user/[username].vue`: user profile/activity page with posts and comments.
- `app/components/story/StoryGrid.vue`: feed layout and loading states.
- `app/components/story/StoryCard.vue`: visual story card, source link, screenshot preview, title, and status row.
- `app/components/comment/CommentThread.vue`: nested comment renderer.
- `app/components/user/UserCommentCard.vue`: user activity comment card.
- `app/components/RelatedStories.vue`: related story list on detail pages.
- `app/components/layout/Header.vue` and `app/components/layout/Footer.vue`: shared shell.

Shared client logic:

- `app/composables/useStories.ts`: feed loading, session-memory cache, and stale refresh state.
- `app/composables/useImageLoadQueue.ts`: client-side image load queue.
- `app/composables/useFeedTheme.ts`: feed-specific labels, routes, and color theme variables.
- `app/composables/useSeedPalette.ts`: deterministic card color palettes.
- `app/composables/useSanitizer.ts`: safe rich-text rendering and HN comment post-processing.
- `app/composables/useScroll.ts` and `useDebounce.ts`: scroll and timing helpers.

Server/API:

- `server/api/top.ts`, `best.ts`, `new.ts`, `show.ts`: fetch ordered story IDs from HN Firebase, hydrate story data from Algolia, and preserve source order.
- `server/api/item/[id].ts`: fetch story details and comment tree from Algolia Items API.
- `server/api/related/[id].ts`: build related-story candidates from title, URL, comments, and Algolia search results.
- `server/api/screenshot/[id].ts`: screenshot proxy and cache layer.
- `server/api/user/[username].ts`: user profile from Algolia.
- `server/api/user/[username]/comments.ts` and `stories.ts`: paginated user activity using Algolia search-by-date.
- `server/utils/fetchStories.ts`: common Algolia story normalization.
- `server/utils/userActivity.ts`: user activity validation, pagination, and mapping.
- `server/utils/keywordExtractor.ts`: related-story keyword support.

Types and global styling:

- `shared/types/index.ts`: shared story, comment, user, and activity types used by the Vue app and Nitro server.
- `app/assets/css/main.css`: base typography, rich-text rendering, quote/code/reference styles.
- `tailwind.config.ts`: Tailwind content paths, fonts, dark mode, and extended color tokens.

## Data Sources And Caching

HN42 reads public data only. There is no HN login, voting, posting, or private account integration.

Primary upstreams:

- HN Firebase API for feed story IDs and screenshot story URLs.
- Algolia HN Search API for story/feed data.
- Algolia Items API for story detail and comment trees.
- Algolia users/search-by-date endpoints for user profiles and activity.
- `backup15.terasp.net` for article screenshot generation.

Caching expectations:

- Feed and item routes use short public cache headers so story metadata stays fresh.
- Related stories use longer cache headers because they are derived and less time-sensitive.
- User profile/activity routes cache briefly.
- Screenshot responses use long browser/CDN cache headers and Cloudflare `caches.default`.
- Successful screenshots are persisted temporarily in R2 under `screenshots/v1/story-<id>/<url-hash>.jpg`; R2 lifecycle should delete them after 30 days.
- Screenshot fallbacks are transparent GIFs with `no-store` headers; the in-memory fallback TTL avoids retry storms without poisoning `caches.default`.
- Screenshot fallbacks are not written to R2. Stale R2 screenshots can be served briefly when backup15 fails.
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

Nested comments render to a limited depth by default. `app/pages/item/[id].vue` exposes expand/collapse-all controls, while `CommentThread.vue` shows local reply disclosure when replies are hidden under the depth limit.

## Images And Screenshots

Story screenshots should render from `/api/screenshot/:id`.

- Do not use the old `hn42.net/cdn-cgi/image/...` URL; that domain is no longer owned.
- Do not add `provider="cloudflare"` to `NuxtImg` for screenshots.
- Current screenshot rendering intentionally uses plain `<img>` tags to avoid Nuxt Image generating CDN proxy URLs.
- `server/api/screenshot/[id].ts` resolves the HN story URL, checks `caches.default`, checks R2, then fetches a full-page JPEG screenshot from `backup15.terasp.net` on a miss.
- Successful screenshots are JPEGs stored in R2 through the `SCREENSHOTS_BUCKET` binding.
- Server-side backup15 fetch concurrency is controlled by `runtimeConfig.screenshotFetchConcurrency` and should remain queued so the screenshot service is not overwhelmed.
- Concurrent backup15 captures for the same R2 key are coalesced, short per-isolate R2 miss memory avoids repeated R2 reads during fallback cooldowns, and failed captures write a short-lived R2 failure marker instead of a reusable screenshot.
- Client-side image request concurrency is controlled by `runtimeConfig.public.screenshotImageQueueConcurrency`.
- Keep long shared-cache TTLs unless there is a concrete invalidation need.

## Styling, Linting, And Code Style

Styling approach:

- TailwindCSS is the base styling system.
- Component-specific CSS generally lives in scoped Vue styles.
- Shared typography/rich-text styling belongs in `app/assets/css/main.css`.
- Dark mode uses `@nuxtjs/color-mode` with class-based Tailwind dark mode.
- Fonts are Inter for body text and Sora for display headings.
- Prefer the existing feed theme and seed palette helpers over one-off color systems.

Linting and checks:

- There is currently no dedicated `lint` script in `package.json`.
- Use `npm run build` as the baseline verification.
- Use `git diff --check` for whitespace issues when editing docs or code.
- Type checking currently reports pre-existing issues across the codebase; do not treat `nuxi typecheck` failures as caused by your change unless isolated.

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
- R2 must be enabled on the Cloudflare account before bucket creation or deployment verification can succeed.
- Production screenshot storage expects the R2 bucket `hn42-screenshots`; preview/local Wrangler storage expects `hn42-screenshots-dev`.
- R2 lifecycle should delete the `screenshots/v1/` prefix after 30 days.
- Use `npm run cf:screenshots:bootstrap` to create missing screenshot R2 buckets and add the lifecycle rule. The script is intended to be idempotent and can be rerun.
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
npm run preview
npm run deploy
npm run cf-typegen
npm run cf:screenshots:bootstrap
npx wrangler deploy --dry-run
git diff --check
```

## Known Caveats

- The screenshot route can be slow on cold misses because it proxies external screenshot generation through a queued backup15 request.
- Browser verification should use the in-app browser against `http://localhost:3000` or the actual Nuxt dev port.
- The dev server may need a restart after dependency or Nuxt/Nitro preset changes; hot reload can leave the app shell blank.
- Screenshot latency is expected and should not be treated as a UI regression unless the task is specifically about screenshots.
- Type checking has known pre-existing issues.

## Working Conventions

- Preserve user changes in the worktree. Do not revert unrelated edits.
- Keep edits scoped to the request and the surrounding module.
- Prefer compatibility fixes over broad rewrites.
- For important architectural changes, update `README.md` and `AGENTS.md` in the same change so project documentation and agent guidance stay accurate.
- For UI changes, preserve the screenshot-first product hierarchy.
- For UI changes, verify in the in-app browser when feasible.
- For Cloudflare deployment changes, verify both build and Wrangler dry-run when possible.
