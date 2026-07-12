<template>
  <div
    class="feed-shell feed-theme-surface min-h-full text-slate-900 dark:text-slate-100"
    :style="feedThemeStyle"
  >
    <div class="max-w-7xl mx-auto px-4 py-8 md:py-10">
      <header class="feed-page-header mb-7 md:mb-8">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="feed-kicker meta-text mb-2 inline-flex items-center gap-2 font-semibold uppercase">
              <span class="feed-kicker-dot h-2.5 w-2.5 rounded-full" aria-hidden="true"></span>
              {{ feedTheme.label }}
            </p>
            <h1 class="mb-0 text-3xl font-display font-semibold leading-tight md:text-4xl">
              {{ feedTheme.title }}
            </h1>
          </div>
          <p class="feed-description mb-0 max-w-sm text-sm leading-6 sm:text-right">
            {{ feedTheme.description }}
          </p>
        </div>
      </header>

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

      <div v-else>
        <div
          v-if="isLoading"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-7"
          aria-busy="true"
          aria-live="polite"
        >
          <span class="sr-only">Loading stories</span>
          <div
            v-for="index in 9"
            :key="`story-skeleton-${endpoint}-${index}`"
            class="story-card-skeleton seed-palette-surface flex flex-col rounded-2xl overflow-hidden bg-white shadow-lg dark:bg-gray-900"
            :style="skeletonPaletteStyle(index)"
            aria-hidden="true"
          >
            <div class="relative aspect-[4/4] shrink-0 overflow-hidden skeleton-shot">
              <div class="story-card-skeleton-topbar meta-text">
                <div class="h-3 w-24 rounded-full skeleton-line"></div>
                <div class="h-3 w-12 rounded-full skeleton-line skeleton-line-muted"></div>
              </div>
              <div class="absolute inset-x-[14%] top-[16%] h-[10%] rounded-full skeleton-line"></div>
              <div class="absolute inset-x-[10%] top-[31%] h-[7%] rounded-full skeleton-line skeleton-line-muted"></div>
              <div class="absolute inset-x-[18%] top-[43%] h-[7%] rounded-full skeleton-line skeleton-line-muted"></div>
              <div class="absolute left-[11%] right-[26%] top-[62%] h-[20%] rounded-lg skeleton-block"></div>
            </div>
            <div class="story-card-skeleton-body flex flex-1 flex-col p-4">
              <div class="space-y-2.5 mb-4">
                <div class="h-4 rounded-full skeleton-line" :style="{ width: skeletonTitleWidths[(index - 1) % skeletonTitleWidths.length] }"></div>
                <div class="h-4 w-2/3 rounded-full skeleton-line skeleton-line-muted"></div>
                <div class="h-4 w-5/6 rounded-full skeleton-line skeleton-line-muted"></div>
              </div>
              <div class="mt-auto flex items-center justify-between gap-3">
                <div class="h-3 w-20 rounded-full skeleton-line skeleton-line-muted"></div>
                <div class="h-3 w-24 rounded-full skeleton-line skeleton-line-muted"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else>
          <div
            v-if="isRefreshing"
            class="mb-4 flex justify-end"
            aria-live="polite"
          >
            <div class="meta-text inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 font-medium text-slate-600 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300">
              <LucideRefreshCw class="h-3.5 w-3.5 animate-spin text-orange-500" aria-hidden="true" />
              <span>Updating</span>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-7">
            <StoryCard
              v-for="story in stories"
              :key="story.objectID"
              :story="story"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStories } from '~/composables/useStories';
import { getSeedPaletteStyle } from '~/composables/useSeedPalette';
import { getFeedTheme, getFeedThemeStyle } from '~/composables/useFeedTheme';
import type { FeedEndpoint } from '~/composables/useFeedTheme';
import { LucideRefreshCw } from '@lucide/vue';

const props = defineProps<{ endpoint: FeedEndpoint }>();
const { stories, isLoading, isRefreshing, error } = useStories(props.endpoint);
const feedTheme = computed(() => getFeedTheme(props.endpoint));
const feedThemeStyle = computed(() => getFeedThemeStyle(props.endpoint));
const title = computed(() => feedTheme.value.title);
const requestUrl = useRequestURL();
const feedSocialImage = new URL('/icon_x512.png', requestUrl.origin).href;
const skeletonTitleWidths = ['82%', '68%', '76%', '58%', '88%'];
const skeletonPaletteStyle = (index: number) => {
  return getSeedPaletteStyle(`loading-${props.endpoint}-${index}`);
};

useSeoMeta({
  title,
  description: () => feedTheme.value.description,
  ogTitle: title,
  ogDescription: () => feedTheme.value.description,
  ogImage: feedSocialImage,
  twitterCard: 'summary_large_image',
  twitterImage: feedSocialImage,
});
</script>

<style scoped>
.feed-shell {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(circle at 8% -7%, var(--feed-glow-a) 0, transparent 30rem),
    radial-gradient(circle at 84% 0%, var(--feed-glow-b) 0, transparent 34rem),
    radial-gradient(circle at 52% 28%, var(--feed-glow-c) 0, transparent 28rem),
    linear-gradient(135deg, var(--feed-bg-start) 0%, var(--feed-bg-mid) 48%, var(--feed-bg-end) 100%);
}

.feed-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(rgb(15 23 42 / 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgb(15 23 42 / 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  -webkit-mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.5), transparent 70%);
  mask-image: linear-gradient(180deg, rgb(0 0 0 / 0.5), transparent 70%);
}

.dark .feed-shell::before {
  background-image:
    linear-gradient(rgb(255 255 255 / 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px);
}

.feed-page-header {
  border-bottom: 1px solid var(--feed-border);
  padding-bottom: 1.25rem;
}

.feed-kicker {
  color: var(--feed-accent-strong);
}

.feed-kicker-dot {
  background: var(--feed-swatch);
  box-shadow:
    0 0 0 4px var(--feed-accent-soft),
    0 8px 22px var(--feed-glow-a);
}

.feed-description {
  color: rgb(71 85 105);
}

.dark .feed-description {
  color: rgb(203 213 225);
}

.story-card-skeleton {
  position: relative;
  border: 1px solid color-mix(in oklch, var(--seed-border) 72%, rgb(203 213 225 / 0.5));
  background:
    linear-gradient(145deg, var(--seed-highlight), transparent 32%),
    linear-gradient(180deg, var(--seed-surface-raised), var(--seed-surface));
  box-shadow:
    0 20px 48px var(--seed-shadow),
    inset 0 1px 0 rgb(255 255 255 / 0.36);
}

.story-card-skeleton-topbar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid color-mix(in oklch, var(--seed-border) 46%, transparent);
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 34%),
    color-mix(in oklch, var(--seed-surface-raised) 58%, white 18%);
  padding: 0.7rem 0.95rem 0.62rem;
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  backdrop-filter: blur(18px) saturate(1.35);
}

.story-card-skeleton-body {
  border-top: 1px solid color-mix(in oklch, var(--seed-border) 54%, transparent);
  background:
    radial-gradient(circle at 100% 0%, color-mix(in oklch, var(--seed-ring) 68%, transparent) 0, transparent 48%),
    linear-gradient(
      180deg,
      color-mix(in oklch, white 82%, var(--seed-surface-raised) 9%),
      color-mix(in oklch, rgb(248 250 252) 76%, var(--seed-surface-strong) 14%)
    );
  -webkit-backdrop-filter: blur(12px) saturate(1.08);
  backdrop-filter: blur(12px) saturate(1.08);
}

.dark .story-card-skeleton-body {
  background:
    radial-gradient(circle at 100% 0%, color-mix(in oklch, var(--seed-ring) 72%, transparent) 0, transparent 48%),
    linear-gradient(
      180deg,
      color-mix(in oklch, var(--seed-surface-raised) 68%, black 14%),
      color-mix(in oklch, var(--seed-surface-strong) 66%, black 18%)
    );
}

.skeleton-shot {
  background:
    radial-gradient(circle at 25% 20%, var(--seed-accent-soft), transparent 28%),
    linear-gradient(180deg, var(--seed-surface) 0%, var(--seed-surface-strong) 58%, var(--seed-overlay-edge) 100%);
}

.skeleton-shot::after,
.story-card-skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(110deg, transparent 20%, rgb(255 255 255 / 0.22) 45%, transparent 70%);
  animation: skeleton-shimmer 1.9s ease-in-out infinite;
  pointer-events: none;
}

.story-card-skeleton::after {
  animation-delay: 0.35s;
}

.skeleton-line,
.skeleton-block {
  border: 1px solid var(--seed-metric-border);
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 48%),
    var(--seed-metric-bg);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.36) inset;
}

.skeleton-line-muted {
  opacity: 0.72;
}

.skeleton-block {
  background: var(--seed-surface-strong);
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-shot::after,
  .story-card-skeleton::after {
    animation: none;
  }
}
</style>
