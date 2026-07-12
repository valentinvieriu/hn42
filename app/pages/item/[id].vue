<template>
  <div class="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
    <div class="max-w-7xl mx-auto p-4 md:p-8 lg:py-10">
      <div v-if="error" class="text-center mt-20">
        <h1 class="text-3xl font-display font-semibold mb-4">Error</h1>
        <p class="mb-6 leading-7">{{ error }}</p>
        <NuxtLink
          to="/"
          class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
        >
          Back to Home
        </NuxtLink>
      </div>

      <div v-else-if="isLoading" class="text-center mt-20">
        <h1 class="text-3xl font-display font-semibold mb-4">Loading...</h1>
      </div>

      <div v-else-if="story" class="grid gap-8 lg:gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <article class="min-w-0 lg:col-start-1">
          <h1 class="mb-3 text-3xl font-display font-semibold leading-tight text-gray-900 dark:text-gray-100 md:text-4xl">
            {{ story.title }}
          </h1>
          <a
            v-if="storyExternalUrl"
            :href="storyExternalUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="meta-text mb-3 flex items-center gap-1.5 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <span class="truncate">{{ storyExternalUrl }}</span> <LucideExternalLink :size="14" />
          </a>
          <div class="meta-text mb-4 text-gray-600 dark:text-gray-400">
            by
            <NuxtLink
              :to="getUserPath(story.author)"
              class="font-medium text-gray-700 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-gray-100"
            >
              {{ story.author }}
            </NuxtLink>
            • {{ timeAgo }}
          </div>
          <div class="meta-text flex items-center gap-4 mb-6">
            <span :class="['flex', 'items-center', 'gap-1', story.points >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400']">
              <LucideTrendingUp class="w-4 h-4" />
              {{ story.points }}
            </span>
            <a
              href="#comments"
              aria-label="Jump to comments"
              class="flex items-center gap-1 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <LucideMessageSquare class="w-4 h-4" />
              {{ commentCount }}
            </a>
            <span class="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <LucideClock class="w-4 h-4" />
              {{ timeAgo }}
            </span>
          </div>
          <a
            v-if="storyExternalUrl && isCompactViewport"
            :href="storyExternalUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="compact-source-preview seed-palette-surface mb-6 block lg:hidden"
            :data-screenshot-state="thumbnailPreviewState"
            :style="screenshotPreviewStyle"
            :aria-label="`Open ${storyDomain} externally`"
            data-testid="compact-source-preview"
          >
            <StoryPlaceholderVisual
              :domain="storyDomain"
              :seed="storyId ?? 'story'"
              :state="thumbnailPreviewState"
              presentation="compact"
            />
            <img
              :alt="`Preview of ${story.title}`"
              width="1440"
              height="900"
              :src="thumbnailScreenshotSrc"
              loading="eager"
              decoding="async"
              class="compact-source-preview-image"
              :class="{ 'is-loaded': thumbnailPreviewState === 'loaded' }"
              :aria-hidden="thumbnailPreviewState !== 'loaded'"
              @load="handleThumbnailPreviewLoad"
              @error="handleThumbnailPreviewError"
            />
            <span class="compact-source-preview-chip meta-text">
              <span>{{ storyDomain }}</span>
              <LucideExternalLink class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </span>
          </a>
          <div
            class="rich-text reading-measure mb-5 text-base leading-7 text-gray-700 dark:text-gray-300"
            v-html="sanitizedText"
          ></div>
          <div
            v-if="!isCompactViewport"
            class="source-screenshot-preview seed-palette-surface hidden lg:block mb-8"
            :data-screenshot-state="originalPreviewState"
            :style="screenshotPreviewStyle"
          >
            <StoryPlaceholderVisual
              :domain="storyDomain"
              :seed="storyId ?? 'story'"
              :state="originalPreviewState"
              presentation="detail"
            />
            <img
              :alt="story.title"
              width="1440"
              :src="originalScreenshotSrc"
              loading="lazy"
              decoding="async"
              class="source-screenshot-preview-image"
              :class="{ 'is-loaded': originalPreviewState === 'loaded' }"
              :aria-hidden="originalPreviewState !== 'loaded'"
              @load="handleOriginalPreviewLoad"
              @error="handleOriginalPreviewError"
            />
            <button
              v-if="originalPreviewState === 'loaded'"
              type="button"
              class="source-preview-expand-button"
              aria-label="Expand source preview"
              @click="openScreenshotPreview"
            >
              <LucideMaximize2 class="h-4 w-4" aria-hidden="true" />
              <span>Expand</span>
            </button>
          </div>
        </article>
        <aside id="comments" class="min-w-0 scroll-mt-24 lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div class="comments-toolbar">
            <div class="comments-title-group">
              <h2 class="section-title mb-0 text-2xl font-semibold text-gray-900 dark:text-gray-100">Comments</h2>
              <span v-if="commentCount > 0" class="comments-count text-gray-600 dark:text-gray-400">
                {{ commentCount }}
              </span>
            </div>
            <button
              v-if="hasCollapsedReplies"
              type="button"
              class="expand-comments-button text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              @click="toggleExpandAllComments"
            >
              <LucideChevronsUp v-if="expandAllComments" class="w-4 h-4" />
              <LucideChevronsDown v-else class="w-4 h-4" />
              <span>{{ expandAllComments ? 'Collapse nested' : 'Expand all' }}</span>
            </button>
          </div>
          <div v-if="story.children.length === 0" class="text-gray-500 leading-7">
            No comments yet.
          </div>
          <div v-else class="space-y-4">
            <CommentThread
              v-for="comment in story.children"
              :key="`${comment.id}-${expandAllComments ? 'expanded' : 'default'}`"
              :comment="comment"
              :expand-all="expandAllComments"
              :author-comment-counts="authorCommentCounts"
            />
          </div>
        </aside>
        <section class="min-w-0 lg:col-start-1">
          <RelatedStories v-if="storyId" :story-id="storyId" />
        </section>
        <dialog
          ref="screenshotDialog"
          class="source-preview-dialog"
          aria-labelledby="source-preview-dialog-title"
          @click.self="closeScreenshotPreview"
          @close="handleScreenshotDialogClose"
        >
          <div class="source-preview-dialog-shell">
            <div class="source-preview-dialog-header">
              <div class="min-w-0">
                <p id="source-preview-dialog-title" class="font-display font-semibold">Source preview</p>
                <p class="meta-text truncate text-gray-500 dark:text-gray-400">{{ storyDomain }}</p>
              </div>
              <button
                type="button"
                class="source-preview-dialog-close"
                aria-label="Close source preview"
                @click="closeScreenshotPreview"
              >
                <LucideX class="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div class="source-preview-dialog-scroll">
              <img
                v-if="isScreenshotDialogOpen"
                :alt="`Expanded preview of ${story.title}`"
                width="1440"
                :src="originalScreenshotSrc"
                decoding="async"
                class="source-preview-dialog-image"
              />
            </div>
          </div>
        </dialog>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { LucideExternalLink, LucideTrendingUp, LucideMessageSquare, LucideClock, LucideChevronsDown, LucideChevronsUp, LucideMaximize2, LucideX } from '@lucide/vue';
import { formatDistanceToNow } from 'date-fns';
import { useSanitizer } from '~/composables/useSanitizer';
import { getSeedPaletteStyle } from '~/composables/useSeedPalette';
import type { Comment } from '#shared/types'
import { getScreenshotPath } from '#shared/utils/screenshot'
import { appendServerTiming } from '#shared/utils/serverTiming'

const route = useRoute();
const expandAllComments = ref(false);

type StoryDetail = {
  id: number
  created_at: string
  author: string
  title: string
  url: string
  text: string | null
  points: number
  parent_id: number | null
  children: Comment[]
}

const normalizeStoryId = (param: unknown): string | null => {
  const rawId = Array.isArray(param) ? param[0] : param

  return typeof rawId === 'string' && /^\d+$/.test(rawId) ? rawId : null
}

const storyId = computed(() => normalizeStoryId(route.params.id))
const storyDataKey = computed(() => `story-detail:${storyId.value ?? 'missing'}`)
const getUserPath = (author: string) => `/user/${encodeURIComponent(author)}`
const serverTimingHeader = useResponseHeader('Server-Timing')
const pageSsrStartedAt = import.meta.server ? performance.now() : null

if (import.meta.server && pageSsrStartedAt !== null) {
  useNuxtApp().hook('app:rendered', () => {
    serverTimingHeader.value = appendServerTiming(serverTimingHeader.value, [
      {
        name: 'page-ssr',
        duration: performance.now() - pageSsrStartedAt,
        description: 'Nuxt page data and render',
      },
    ])
  })
}

const { data: storyData, pending, error: fetchError } = useAsyncData<StoryDetail | null>(
  storyDataKey,
  async () => {
    const id = storyId.value

    if (!id) {
      return null
    }

    const storyDataStartedAt = performance.now()
    const response = await $fetch.raw<StoryDetail>(`/api/item/${id}`)

    if (import.meta.server) {
      serverTimingHeader.value = appendServerTiming(response.headers.get('server-timing'), [
        {
          name: 'story-data',
          duration: performance.now() - storyDataStartedAt,
          description: 'SSR story data request',
        },
      ])
    }

    return response._data ?? null
  },
  {
    default: () => null,
    watch: [storyId],
  },
)

const story = computed(() => storyData.value)
const error = computed(() => {
  if (!storyId.value) {
    return 'Story ID is required'
  }

  if (fetchError.value) {
    return fetchError.value.message
  }

  if (!pending.value && !story.value) {
    return 'Story not found'
  }

  return null
})
const isLoading = computed(() => pending.value)
const screenshotSrc = computed(() => storyId.value ? getScreenshotPath(storyId.value) : '')
const thumbnailScreenshotSrc = screenshotSrc
const originalScreenshotSrc = screenshotSrc
const storyExternalUrl = computed(() => {
  if (story.value?.url) {
    return story.value.url
  }

  return storyId.value
    ? `https://news.ycombinator.com/item?id=${storyId.value}`
    : ''
})
type ScreenshotPreviewState = 'loading' | 'loaded' | 'failed'
const thumbnailPreviewState = ref<ScreenshotPreviewState>('loading')
const originalPreviewState = ref<ScreenshotPreviewState>('loading')
const isCompactViewport = ref(false)
const screenshotDialog = ref<HTMLDialogElement | null>(null)
const isScreenshotDialogOpen = ref(false)
let compactViewportMediaQuery: MediaQueryList | null = null

const updateCompactViewport = (event: MediaQueryList | MediaQueryListEvent) => {
  isCompactViewport.value = event.matches
}

onMounted(() => {
  compactViewportMediaQuery = window.matchMedia('(max-width: 1023px)')
  updateCompactViewport(compactViewportMediaQuery)
  compactViewportMediaQuery.addEventListener('change', updateCompactViewport)
})

onBeforeUnmount(() => {
  compactViewportMediaQuery?.removeEventListener('change', updateCompactViewport)
  screenshotDialog.value?.close()
})
const storyDomain = computed(() => {
  if (!storyExternalUrl.value) {
    return 'source'
  }

  try {
    return new URL(storyExternalUrl.value).hostname.replace(/^www\./, '')
  } catch {
    return 'source'
  }
})

const screenshotPreviewStyle = computed(() => {
  return getSeedPaletteStyle(storyId.value, 'light', storyDomain.value)
})

const getPreviewStateFromImage = (event: Event): ScreenshotPreviewState => {
  const image = event.target as HTMLImageElement

  return image.naturalWidth > 1 && image.naturalHeight > 1 ? 'loaded' : 'failed'
}

const handleThumbnailPreviewLoad = (event: Event) => {
  thumbnailPreviewState.value = getPreviewStateFromImage(event)
}

const handleThumbnailPreviewError = () => {
  thumbnailPreviewState.value = 'failed'
}

const handleOriginalPreviewLoad = (event: Event) => {
  originalPreviewState.value = getPreviewStateFromImage(event)
}

const handleOriginalPreviewError = () => {
  originalPreviewState.value = 'failed'
}

const openScreenshotPreview = () => {
  if (
    originalPreviewState.value !== 'loaded'
    || !screenshotDialog.value
    || screenshotDialog.value.open
  ) {
    return
  }

  screenshotDialog.value.showModal()
  isScreenshotDialogOpen.value = true
}

const closeScreenshotPreview = () => {
  screenshotDialog.value?.close()
}

const handleScreenshotDialogClose = () => {
  isScreenshotDialogOpen.value = false
}

watch(thumbnailScreenshotSrc, () => {
  thumbnailPreviewState.value = 'loading'
})

watch(originalScreenshotSrc, () => {
  originalPreviewState.value = 'loading'
})

// Use the sanitizer
const { sanitize } = useSanitizer();
const sanitizedText = computed(() => sanitize(story.value?.text || '', `story-${storyId.value}`));

const MAX_COMMENT_DEPTH = 3;

const countComments = (comments: Comment[]): number => {
  return comments.reduce((total, comment) => {
    return total + 1 + countComments(comment.children || []);
  }, 0);
};

const hasRepliesBeyondDefaultDepth = (comments: Comment[], depth = 1): boolean => {
  return comments.some((comment) => {
    const children = comment.children || [];

    if (depth >= MAX_COMMENT_DEPTH && children.length > 0) {
      return true;
    }

    return hasRepliesBeyondDefaultDepth(children, depth + 1);
  });
};

const commentCount = computed(() => countComments(story.value?.children || []));
const hasCollapsedReplies = computed(() => hasRepliesBeyondDefaultDepth(story.value?.children || []));

const countCommentsByAuthor = (comments: Comment[] = [], counts: Record<string, number> = {}) => {
  comments.forEach((comment) => {
    if (comment.author) {
      counts[comment.author] = (counts[comment.author] || 0) + 1;
    }

    countCommentsByAuthor(comment.children || [], counts);
  });

  return counts;
};

const authorCommentCounts = computed(() => countCommentsByAuthor(story.value?.children || []));

const toggleExpandAllComments = () => {
  expandAllComments.value = !expandAllComments.value;
};

const timeAgo = computed(() => {
  if (!story.value?.created_at) return '';
  return formatDistanceToNow(new Date(story.value.created_at), { addSuffix: true });
});

const requestUrl = useRequestURL()
const siteOrigin = requestUrl.origin
const title = computed(() => story.value?.title ?? 'Loading...')
const socialImage = computed(() => {
  const path = storyId.value
    ? getScreenshotPath(storyId.value)
    : '/icon_x512.png'

  return new URL(path, siteOrigin).href
})

useSeoMeta({
  title,
  description: () => story.value ? `Read the story titled "${story.value.title}" by ${story.value.author}.` : 'Loading story...',
  ogTitle: title,
  ogDescription: () => story.value ? `Read the story titled "${story.value.title}" by ${story.value.author}.` : 'Loading story...',
  ogImage: socialImage,
  twitterCard: 'summary_large_image',
  twitterImage: socialImage,
});
</script>

<style scoped>
.compact-source-preview {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  border: 1px solid color-mix(in oklch, var(--seed-border) 74%, rgb(148 163 184 / 0.26));
  border-radius: 0.75rem;
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--seed-highlight) 54%, transparent), transparent 32%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface));
  box-shadow: 0 18px 40px -32px var(--seed-shadow-strong);
}

.compact-source-preview::after {
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  content: "";
  background: linear-gradient(to top, rgb(15 23 42 / 0.36), transparent);
  pointer-events: none;
}

.compact-source-preview-image {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  opacity: 0;
  transition: opacity 0.28s ease, transform 0.25s ease;
}

.compact-source-preview-image.is-loaded {
  opacity: 1;
}

.compact-source-preview:hover .compact-source-preview-image,
.compact-source-preview:focus-visible .compact-source-preview-image {
  transform: scale(1.015);
}

.compact-source-preview-chip {
  position: absolute;
  right: 0.75rem;
  bottom: 0.75rem;
  left: 0.75rem;
  z-index: 1;
  display: inline-flex;
  width: max-content;
  max-width: calc(100% - 1.5rem);
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.58rem;
  border: 1px solid rgb(255 255 255 / 0.68);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.88);
  color: rgb(31 41 55);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 8px 22px -16px rgb(15 23 42 / 0.75);
  backdrop-filter: blur(12px);
}

.compact-source-preview-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-screenshot-preview {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--seed-border) 72%, rgb(148 163 184 / 0.26));
  border-radius: 0.75rem;
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--seed-highlight) 54%, transparent), transparent 32%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface));
  box-shadow: 0 18px 40px -32px var(--seed-shadow-strong);
}

.source-screenshot-preview[data-screenshot-state="loading"],
.source-screenshot-preview[data-screenshot-state="failed"] {
  aspect-ratio: 4 / 3;
}

.source-screenshot-preview-image {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: auto;
  opacity: 0;
  transition: opacity 0.28s ease;
}

.source-screenshot-preview[data-screenshot-state="loading"] .source-screenshot-preview-image,
.source-screenshot-preview[data-screenshot-state="failed"] .source-screenshot-preview-image {
  position: absolute;
  inset: 0;
  height: 100%;
  object-fit: cover;
}

.source-screenshot-preview-image.is-loaded {
  opacity: 1;
}

.source-preview-expand-button {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 3;
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid rgb(255 255 255 / 0.68);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  color: rgb(31 41 55);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 8px 22px -14px rgb(15 23 42 / 0.75);
  backdrop-filter: blur(12px);
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.source-preview-expand-button:hover,
.source-preview-expand-button:focus-visible {
  background: white;
  transform: translateY(-1px);
}

.source-preview-dialog {
  width: min(calc(100vw - 2rem), 90rem);
  height: min(calc(100vh - 2rem), 56rem);
  max-width: none;
  max-height: none;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgb(148 163 184 / 0.32);
  border-radius: 1rem;
  background: white;
  color: rgb(17 24 39);
  box-shadow: 0 36px 90px rgb(15 23 42 / 0.32);
}

.source-preview-dialog::backdrop {
  background: rgb(15 23 42 / 0.72);
  backdrop-filter: blur(5px);
}

.source-preview-dialog-shell {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.source-preview-dialog-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0.9rem;
  border-bottom: 1px solid rgb(148 163 184 / 0.24);
  background: rgb(255 255 255 / 0.96);
}

.source-preview-dialog-close {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(148 163 184 / 0.3);
  border-radius: 999px;
  background: rgb(148 163 184 / 0.08);
  color: rgb(55 65 81);
}

.source-preview-dialog-close:hover,
.source-preview-dialog-close:focus-visible {
  background: rgb(148 163 184 / 0.16);
  color: rgb(17 24 39);
}

.source-preview-dialog-scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  background: rgb(241 245 249);
}

.source-preview-dialog-image {
  display: block;
  width: min(100%, 90rem);
  height: auto;
  margin: 0 auto;
  background: white;
}

.dark .compact-source-preview {
  border-color: color-mix(in oklch, var(--seed-border) 82%, rgb(148 163 184 / 0.28));
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--seed-highlight) 50%, transparent), transparent 34%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface));
}

.dark .source-screenshot-preview {
  border-color: color-mix(in oklch, var(--seed-border) 82%, rgb(148 163 184 / 0.28));
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--seed-highlight) 50%, transparent), transparent 34%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface));
}

.dark .source-preview-expand-button {
  border-color: rgb(255 255 255 / 0.16);
  background: rgb(15 23 42 / 0.82);
  color: rgb(226 232 240);
}

.dark .source-preview-expand-button:hover,
.dark .source-preview-expand-button:focus-visible {
  background: rgb(30 41 59 / 0.96);
}

.dark .source-preview-dialog {
  border-color: rgb(148 163 184 / 0.28);
  background: rgb(17 24 39);
  color: rgb(243 244 246);
}

.dark .source-preview-dialog-header {
  border-color: rgb(148 163 184 / 0.18);
  background: rgb(17 24 39 / 0.97);
}

.dark .source-preview-dialog-close {
  border-color: rgb(148 163 184 / 0.22);
  background: rgb(148 163 184 / 0.1);
  color: rgb(209 213 219);
}

.dark .source-preview-dialog-close:hover,
.dark .source-preview-dialog-close:focus-visible {
  background: rgb(148 163 184 / 0.18);
  color: white;
}

.dark .source-preview-dialog-scroll {
  background: rgb(15 23 42);
}

.dark .compact-source-preview-chip {
  border-color: rgb(255 255 255 / 0.16);
  background: rgb(15 23 42 / 0.78);
  color: rgb(226 232 240);
}

.comments-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.comments-title-group {
  display: inline-flex;
  align-items: baseline;
  gap: 0.55rem;
  min-width: 0;
}

.comments-count {
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1;
}

.expand-comments-button {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.35rem 0.7rem;
  border: 1px solid rgb(148 163 184 / 0.24);
  border-radius: 999px;
  background: rgb(148 163 184 / 0.08);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.expand-comments-button:hover {
  border-color: rgb(148 163 184 / 0.38);
  background: rgb(148 163 184 / 0.13);
}

@media (max-width: 640px) {
  .comments-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
