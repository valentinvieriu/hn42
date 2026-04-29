<template>
  <div :class="`${colorMode.value === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-900'}`">
    <div class="max-w-7xl mx-auto px-4 py-8 md:py-10">
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
            class="story-card-skeleton rounded-2xl overflow-hidden shadow-lg"
            :class="colorMode.value === 'dark' ? 'bg-gray-900' : 'bg-white'"
            :style="skeletonPaletteStyle(index)"
            aria-hidden="true"
          >
            <div class="relative aspect-[4/4] overflow-hidden skeleton-shot">
              <div class="absolute inset-x-[14%] top-[16%] h-[10%] rounded-full skeleton-line"></div>
              <div class="absolute inset-x-[10%] top-[31%] h-[7%] rounded-full skeleton-line skeleton-line-muted"></div>
              <div class="absolute inset-x-[18%] top-[43%] h-[7%] rounded-full skeleton-line skeleton-line-muted"></div>
              <div class="absolute left-[11%] right-[26%] top-[62%] h-[20%] rounded-lg skeleton-block"></div>
            </div>
            <div class="p-4 md:p-5 border-t-4" :style="{ 'border-top-color': 'var(--seed-accent)' }">
              <div class="flex items-center justify-between gap-3 mb-4">
                <div class="h-6 w-28 rounded-full skeleton-pill"></div>
                <div class="h-4 w-4 rounded skeleton-pill"></div>
              </div>
              <div class="space-y-2.5 mb-5">
                <div class="h-4 rounded-full skeleton-line" :style="{ width: skeletonTitleWidths[(index - 1) % skeletonTitleWidths.length] }"></div>
                <div class="h-4 w-2/3 rounded-full skeleton-line skeleton-line-muted"></div>
              </div>
              <div class="flex items-center justify-between gap-3 mb-4">
                <div class="h-3 w-20 rounded-full skeleton-line skeleton-line-muted"></div>
                <div class="h-3 w-24 rounded-full skeleton-line skeleton-line-muted"></div>
              </div>
              <div class="flex items-center justify-between gap-3">
                <div class="h-3 w-12 rounded-full skeleton-line skeleton-line-muted"></div>
                <div class="h-3 w-12 rounded-full skeleton-line skeleton-line-muted"></div>
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
              @mouseenter="hoveredStory = story.objectID"
              @mouseleave="hoveredStory = null"
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
import { LucideRefreshCw } from '@lucide/vue';

const props = defineProps<{ endpoint: 'best' | 'new' | 'show' | 'top' }>();
const { stories, hoveredStory, isLoading, isRefreshing, error } = useStories(props.endpoint);
const colorMode = useColorMode();
const title = ref(`${props.endpoint.charAt(0).toUpperCase() + props.endpoint.slice(1)} Stories`);
const firstStoryImage = computed(() => stories.value.length > 0 ? stories.value[0].screenshotUrl : 'https://example.com/default-image.png'); // Default image if no stories
const skeletonTitleWidths = ['82%', '68%', '76%', '58%', '88%'];
const skeletonPaletteStyle = (index: number) => {
  return getSeedPaletteStyle(`loading-${props.endpoint}-${index}`, colorMode.value === 'dark' ? 'dark' : 'light');
};

useSeoMeta({
  title,
  description: () => `Explore the latest ${props.endpoint} stories on our platform.`,
  ogTitle: title,
  ogDescription: () => `Explore the latest ${props.endpoint} stories on our platform.`,
  ogImage: firstStoryImage,
  twitterCard: firstStoryImage,
});
</script>

<style scoped>
.story-card-skeleton {
  position: relative;
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
.skeleton-pill,
.skeleton-block {
  background: var(--seed-accent-soft);
  border: 1px solid var(--seed-border);
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
