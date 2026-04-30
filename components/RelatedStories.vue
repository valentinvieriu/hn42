<template>
  <div class="mt-10">
    <h2 :class="['section-title', 'text-xl', 'font-semibold', 'mb-4', colorMode.value === 'dark' ? 'text-gray-100' : 'text-gray-900']">
      Related Stories
    </h2>
    <div v-if="status === 'pending'" class="text-gray-500">
      Loading related stories...
    </div>
    <div v-else-if="error" class="text-gray-500">
      Failed to load related stories.
    </div>
    <div v-else-if="stories.length === 0" class="text-gray-500">
      No related stories found.
    </div>
    <div v-else class="related-story-list">
      <NuxtLink
        v-for="story in stories"
        :key="story.objectID"
        :to="`/item/${story.objectID}`"
        class="related-story-card"
        :style="relatedPaletteStyle(story)"
      >
        <h3 class="related-story-title">{{ story.title }}</h3>
        <div class="related-story-meta meta-text">
          <span class="related-story-metric">
            <LucideTrendingUp class="w-4 h-4" aria-hidden="true" />
            {{ story.points }}
          </span>
          <span class="related-story-metric">
            <LucideMessageSquare class="w-4 h-4" aria-hidden="true" />
            {{ story.num_comments }}
          </span>
          <span class="related-story-author">by {{ story.author }}</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { LucideTrendingUp, LucideMessageSquare } from '@lucide/vue'
import { getSeedPaletteStyle } from '~/composables/useSeedPalette'

const props = defineProps<{
  storyId: string
}>()

interface RelatedStory {
  title: string
  objectID: string
  points: number
  num_comments: number
  author: string
  url: string
}

const colorMode = useColorMode()
const relatedPaletteStyle = (story: RelatedStory) => {
  return getSeedPaletteStyle(story.objectID, colorMode.value === 'dark' ? 'dark' : 'light')
}
const { data: stories, status, error } = await useFetch<RelatedStory[]>(
  () => `/api/related/${props.storyId}`,
  {
    default: () => [],
    server: true,
  },
)
</script>

<style scoped>
.related-story-list {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.related-story-card {
  display: block;
  border: 1px solid color-mix(in oklch, var(--seed-border) 76%, transparent);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 34%),
    linear-gradient(90deg, var(--seed-surface-raised) 0%, var(--seed-surface) 68%, transparent 100%);
  padding: 0.85rem 0.95rem;
  box-shadow:
    0 12px 30px var(--seed-shadow),
    0 1px 0 rgb(255 255 255 / 0.42) inset;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    transform 180ms ease;
}

.related-story-card:hover,
.related-story-card:focus-visible {
  border-color: var(--seed-border-strong);
  box-shadow:
    0 16px 38px var(--seed-shadow-strong),
    0 1px 0 rgb(255 255 255 / 0.52) inset;
  transform: translateY(-1px);
}

.dark .related-story-card {
  box-shadow:
    0 14px 32px var(--seed-shadow),
    0 1px 0 rgb(255 255 255 / 0.08) inset;
}

.related-story-title {
  margin-bottom: 0.62rem;
  color: rgb(15 23 42);
  font-family: var(--font-display);
  font-size: 0.98rem;
  font-weight: 650;
  line-height: 1.3;
}

.dark .related-story-title {
  color: rgb(241 245 249);
}

.related-story-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.7rem;
  color: rgb(71 85 105);
}

.dark .related-story-meta {
  color: rgb(203 213 225 / 0.84);
}

.related-story-metric {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  border: 1px solid var(--seed-metric-border);
  border-radius: 999px;
  background: var(--seed-metric-bg);
  padding: 0.18rem 0.46rem;
  color: var(--seed-author-text);
  font-weight: 700;
  line-height: 1;
}

.related-story-author {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
