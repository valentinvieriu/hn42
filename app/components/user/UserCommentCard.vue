<template>
  <article class="user-comment-card seed-palette-surface" :style="commentPaletteStyle">
    <div class="comment-card-header">
      <NuxtLink
        v-if="comment.story_id"
        :to="`/item/${comment.story_id}`"
        class="comment-story-title"
      >
        {{ comment.story_title }}
      </NuxtLink>
      <a
        v-else-if="comment.story_url"
        :href="comment.story_url"
        target="_blank"
        rel="noopener noreferrer"
        class="comment-story-title"
      >
        {{ comment.story_title }}
      </a>
      <span v-else class="comment-story-title">{{ comment.story_title }}</span>
      <span class="comment-time">
        <LucideClock class="h-3.5 w-3.5" aria-hidden="true" />
        {{ timeAgo }}
      </span>
    </div>

    <div
      class="rich-text comment-card-text"
      v-html="sanitizedText"
    ></div>

    <div class="comment-card-actions">
      <span class="comment-card-metric">
        <LucideTrendingUp class="h-3.5 w-3.5" aria-hidden="true" />
        {{ comment.points }}
      </span>
      <NuxtLink
        v-if="comment.story_id"
        :to="`/item/${comment.story_id}`"
        class="comment-card-link"
      >
        <LucideMessageSquare class="h-3.5 w-3.5" aria-hidden="true" />
        <span>Thread</span>
      </NuxtLink>
      <a
        :href="hnCommentUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="comment-card-link"
      >
        <LucideExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
        <span>HN</span>
      </a>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatDistanceToNow } from 'date-fns'
import { LucideClock, LucideExternalLink, LucideMessageSquare, LucideTrendingUp } from '@lucide/vue'
import type { UserComment } from '#shared/types'
import { useSanitizer } from '~/composables/useSanitizer'
import { getSeedPaletteStyle } from '~/composables/useSeedPalette'

const props = defineProps<{
  comment: UserComment
}>()

const { sanitize } = useSanitizer()

const commentPaletteStyle = computed(() => {
  return getSeedPaletteStyle(
    props.comment.story_id || props.comment.objectID,
  )
})

const sanitizedText = computed(() => sanitize(props.comment.text || '', `user-comment-${props.comment.objectID}`))

const timeAgo = computed(() => {
  if (!props.comment.created_at) {
    return ''
  }

  const createdAt = new Date(props.comment.created_at)

  if (Number.isNaN(createdAt.getTime())) {
    return ''
  }

  return formatDistanceToNow(createdAt, { addSuffix: true })
})

const hnCommentUrl = computed(() => `https://news.ycombinator.com/item?id=${props.comment.objectID}`)
</script>

<style scoped>
.user-comment-card {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--seed-border) 82%, transparent);
  border-left: 4px solid var(--seed-rail);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    linear-gradient(90deg, var(--seed-surface-raised) 0%, var(--seed-surface) 66%, transparent 100%),
    rgb(255 255 255 / 0.82);
  box-shadow:
    0 16px 42px var(--seed-shadow),
    inset 0 1px 0 rgb(255 255 255 / 0.38);
}

.dark .user-comment-card {
  background:
    linear-gradient(135deg, var(--seed-highlight), transparent 36%),
    linear-gradient(90deg, var(--seed-surface-raised) 0%, var(--seed-surface) 66%, transparent 100%),
    rgb(15 23 42 / 0.68);
  box-shadow:
    0 16px 42px var(--seed-shadow),
    inset 0 1px 0 rgb(255 255 255 / 0.08);
}

.user-comment-card::before {
  content: '';
  position: absolute;
  inset: 0.9rem auto 0.9rem -4px;
  width: 4px;
  border-radius: 999px;
  background: var(--seed-accent);
  box-shadow: 0 0 0 3px var(--seed-ring);
}

.comment-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  border-bottom: 1px solid color-mix(in oklch, var(--seed-border), transparent 22%);
  background:
    linear-gradient(90deg, color-mix(in oklch, var(--seed-surface-strong), transparent 8%), transparent),
    color-mix(in oklch, var(--seed-metric-bg), transparent 34%);
  padding: 0.8rem 1rem 0.72rem 1.05rem;
}

.comment-story-title {
  min-width: 0;
  overflow: hidden;
  color: var(--seed-author-text);
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-story-title:hover {
  text-decoration: underline;
}

.comment-time,
.comment-card-metric,
.comment-card-link {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.32rem;
  color: rgb(71 85 105);
  font-size: 0.76rem;
  font-weight: 600;
  line-height: 1;
}

.dark .comment-time,
.dark .comment-card-metric,
.dark .comment-card-link {
  color: rgb(203 213 225);
}

.comment-card-text {
  padding: 0.95rem 1.05rem 0.2rem;
  color: rgb(30 41 59);
  font-size: 0.95rem;
  line-height: 1.68;
}

.dark .comment-card-text {
  color: rgb(226 232 240);
}

.comment-card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.95rem;
  border-top: 1px solid color-mix(in oklch, var(--seed-border), transparent 34%);
  padding: 0.72rem 1.05rem 0.95rem;
  background:
    linear-gradient(90deg, color-mix(in oklch, var(--seed-surface), transparent 18%), transparent),
    color-mix(in oklch, var(--seed-metric-bg), transparent 46%);
}

.comment-card-link {
  min-height: 1.85rem;
  border: 1px solid color-mix(in oklch, var(--seed-border), transparent 20%);
  border-radius: 999px;
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 46%),
    var(--seed-metric-bg);
  padding: 0.22rem 0.56rem;
  color: var(--seed-author-text);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.34) inset;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

.comment-card-link:hover {
  border-color: var(--seed-border-strong);
  background:
    linear-gradient(180deg, var(--seed-highlight), transparent 42%),
    var(--seed-metric-bg-hover);
  color: var(--seed-accent-strong);
}

@media (max-width: 640px) {
  .comment-card-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.45rem;
  }

  .comment-story-title {
    white-space: normal;
  }
}
</style>
