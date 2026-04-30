<template>
  <article :class="commentContainerClasses" :style="commentPaletteStyle" :data-author="comment.author">
    <div class="comment-panel">
      <div :class="`comment-header ${headerTextColor} flex items-center`">
        <span class="author-chip">
          <span class="author-dot" aria-hidden="true"></span>
          <NuxtLink :to="getUserPath(comment.author)" class="hover:underline">
            {{ comment.author }}
          </NuxtLink>
        </span>
        <span
          v-if="authorCommentCount > 1"
          class="author-activity-stat"
          :class="{ 'author-activity-stat-strong': authorCommentCount >= 5 }"
          :aria-label="`${comment.author} has made ${authorCommentCount} comments on this story`"
          :title="`${comment.author} has made ${authorCommentCount} comments on this story`"
        >
          <LucideMessageSquare class="w-3.5 h-3.5" aria-hidden="true" />
          <span>{{ authorCommentCount }}</span>
        </span>
        <span class="comment-separator">•</span>
        <span class="comment-time">
          <LucideClock class="w-3.5 h-3.5" />
          {{ timeAgo }}
        </span>
      </div>
      <div
        :class="`comment-text rich-text ${textColor} break-words`"
        v-html="sanitizedText"
      ></div>
      <div class="comment-actions">
        <a
          :href="`https://news.ycombinator.com/reply?id=${comment.id}&goto=item%3Fid%3D${comment.parent_id}%23${comment.id}`"
          target="_blank"
          rel="noopener noreferrer"
          class="reply-action reply-link hover:underline"
          :class="replyLinkColor"
        >
          <LucideMessageSquare class="w-3.5 h-3.5" />
          <span>Reply</span>
        </a>
        <button 
          v-if="canShowMoreReplies" 
          @click="toggleReplies" 
          class="more-replies-button focus:outline-none"
          :class="replyLinkColor"
          :aria-expanded="showReplies"
        >
          <LucideChevronDown v-if="showReplies" class="w-3.5 h-3.5" />
          <LucideChevronRight v-else class="w-3.5 h-3.5" />
          <span>{{ showReplies ? 'Hide replies' : `Show ${hiddenReplyCount} repl${hiddenReplyCount > 1 ? 'ies' : 'y'}` }}</span>
        </button>
      </div>
    </div>
    <div v-if="shouldRenderChildren" class="comment-children">
      <CommentThread
        v-for="child in comment.children"
        :key="child.id"
        :comment="child"
        :current-depth="currentDepth + 1"
        :expand-all="expandAll"
        :author-comment-counts="authorCommentCounts"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { LucideMessageSquare, LucideClock, LucideChevronDown, LucideChevronRight } from '@lucide/vue'
import { formatDistanceToNow } from 'date-fns'
import { useSanitizer } from '~/composables/useSanitizer'
import { getSeedPaletteStyle } from '~/composables/useSeedPalette'

interface Comment {
  id: number
  created_at: string
  author: string
  text: string
  points: number
  parent_id: number | null
  children: Comment[]
}

const props = defineProps<{
  comment: Comment
  currentDepth?: number
  expandAll?: boolean
  authorCommentCounts?: Record<string, number>
}>()

const { sanitize } = useSanitizer()
const sanitizedText = computed(() => sanitize(props.comment.text || '', `comment-${props.comment.id}`))

const MAX_DEPTH = 3
const currentDepth = computed(() => props.currentDepth || 1)
const expandAll = computed(() => Boolean(props.expandAll))
const authorCommentCounts = computed(() => props.authorCommentCounts || {})
const authorCommentCount = computed(() => authorCommentCounts.value[props.comment.author] || 1)
const getUserPath = (author: string) => `/user/${encodeURIComponent(author)}`

const colorMode = useColorMode()

const commentPaletteStyle = computed(() => ({
  ...getSeedPaletteStyle(props.comment.author, colorMode.value === 'dark' ? 'dark' : 'light'),
}))

const timeAgo = computed(() => {
  return formatDistanceToNow(new Date(props.comment.created_at), { addSuffix: true })
})

const replyLinkColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'
})

const headerTextColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600'
})

const textColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-200' : 'text-gray-800'
})

const commentContainerClasses = computed(() => {
  return [
    'comment-container',
    `comment-depth-${Math.min(currentDepth.value, MAX_DEPTH)}`,
    {
      'comment-max-depth': currentDepth.value >= MAX_DEPTH,
    },
  ]
})

const showReplies = ref(false)

const countComments = (comments: Comment[]): number => {
  return comments.reduce((total, child) => total + 1 + countComments(child.children || []), 0)
}

const hiddenReplyCount = computed(() => countComments(props.comment.children || []))

const canShowMoreReplies = computed(() => {
  return !expandAll.value && currentDepth.value >= MAX_DEPTH && hiddenReplyCount.value > 0
})

const toggleReplies = () => {
  showReplies.value = !showReplies.value
}

const shouldRenderChildren = computed(() => {
  if (expandAll.value) {
    return props.comment.children.length > 0
  }

  if (currentDepth.value < MAX_DEPTH) {
    return props.comment.children.length > 0
  } else {
    return showReplies.value
  }
})
</script>

<style scoped>
.comment-container {
  position: relative;
}

.comment-panel {
  position: relative;
  background:
    linear-gradient(90deg, var(--seed-surface-strong) 0%, var(--seed-surface) 64%, transparent 100%);
  border: 1px solid var(--seed-border);
  border-left: 4px solid var(--seed-rail);
  border-radius: 0.5rem;
  overflow: hidden;
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.comment-panel::before {
  content: '';
  position: absolute;
  inset: 0.75rem auto 0.75rem -4px;
  width: 4px;
  border-radius: 999px;
  background: var(--seed-accent);
  box-shadow: 0 0 0 3px var(--seed-ring);
}

.comment-depth-2 .comment-panel {
  border-left-width: 3px;
}

.comment-depth-3 .comment-panel {
  border-left-width: 2px;
}

.comment-max-depth .comment-panel {
  background:
    linear-gradient(90deg, var(--seed-surface-strong) 0%, var(--seed-surface) 45%, transparent 100%);
}

.comment-header {
  gap: 0.375rem;
  flex-wrap: wrap;
  padding: 0.625rem 0.95rem 0.55rem 1rem;
  border-bottom: 1px solid color-mix(in oklch, var(--seed-border), transparent 25%);
  background: linear-gradient(90deg, color-mix(in oklch, var(--seed-surface-strong), transparent 8%), transparent);
  font-size: 0.765rem;
  font-weight: 500;
  line-height: 1.3;
  opacity: 0.82;
}

.author-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 0.35rem;
  color: var(--seed-author-text);
}

.author-dot {
  flex: 0 0 auto;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--seed-accent);
  box-shadow: 0 0 0 3px var(--seed-ring);
}

.author-chip a {
  color: inherit;
  overflow: hidden;
  text-overflow: ellipsis;
}

.comment-separator {
  opacity: 0.45;
}

.author-activity-stat {
  display: inline-flex;
  align-items: center;
  gap: 0.24rem;
  color: var(--seed-author-text);
  font-size: 0.765rem;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  opacity: 0.82;
}

.author-activity-stat-strong {
  color: var(--seed-accent-strong);
  opacity: 1;
}

.comment-time {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.comment-text {
  margin: 0;
  max-width: 72ch;
  padding: 0.95rem 1rem 0.9rem;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

.comment-actions {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  padding: 0.55rem 1rem 0.65rem;
  border-top: 1px solid color-mix(in oklch, var(--seed-border), transparent 28%);
  background: linear-gradient(90deg, color-mix(in oklch, var(--seed-surface), transparent 18%), transparent);
  font-size: 0.765rem;
  font-weight: 500;
  line-height: 1.25;
  opacity: 0.78;
}

.comment-children {
  border-left: 1px dashed var(--seed-child-guide);
  margin: 0.85rem 0 0 0.85rem;
  padding-left: 0.95rem;
}

.comment-children > .comment-container + .comment-container {
  margin-top: 0.85rem;
}

.comment-header a:hover {
  text-decoration: underline;
}

.reply-link {
  font-size: inherit;
  font-weight: inherit;
}

.reply-action,
.more-replies-button {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.8rem;
}

.reply-action {
  padding: 0.2rem 0.55rem;
  border: 1px solid color-mix(in oklch, var(--seed-border), transparent 20%);
  border-radius: 999px;
  background: color-mix(in oklch, var(--seed-surface-strong), transparent 30%);
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.reply-action:hover {
  border-color: var(--seed-border);
  background: color-mix(in oklch, var(--seed-surface-strong), transparent 14%);
}

.more-replies-button {
  margin-left: 0.15rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid color-mix(in oklch, var(--seed-border), transparent 20%);
  border-radius: 999px;
  background: color-mix(in oklch, var(--seed-surface-strong), transparent 30%);
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.more-replies-button:hover {
  border-color: var(--seed-border);
  background: color-mix(in oklch, var(--seed-surface-strong), transparent 14%);
}

@media (max-width: 640px) {
  .comment-header {
    padding: 0.55rem 0.75rem 0.5rem;
  }

  .comment-text {
    padding: 0.8rem 0.75rem;
    font-size: 0.98rem;
    line-height: 1.68;
  }

  .comment-actions {
    padding: 0.5rem 0.75rem 0.55rem;
    gap: 0.35rem;
  }

  .comment-children {
    margin-left: 0.45rem;
    margin-top: 0.75rem;
    padding-left: 0.7rem;
  }
}
</style>
