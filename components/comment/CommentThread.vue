<template>
  <div :class="commentContainerClasses" :style="commentPaletteStyle" :data-author="comment.author">
    <div :class="`comment-header text-sm ${headerTextColor} mb-2 flex items-center`">
      <span class="author-chip font-medium">
        <span class="author-dot" aria-hidden="true"></span>
        <a :href="`https://news.ycombinator.com/user?id=${comment.author}`" target="_blank" rel="noopener noreferrer" class="hover:underline">
          {{ comment.author }}
        </a>
      </span>
      <span class="mx-1">•</span>
      <span class="flex items-center text-xs">
        <LucideClock class="w-4 h-4 mr-1" />
        {{ timeAgo }}
      </span>
    </div>
    <p :class="`comment-text ${textColor} break-words overflow-hidden whitespace-pre-line`">
      {{ sanitizedText }}
    </p>
    <div class="comment-actions flex items-center gap-4 mt-2">
      <span :class="`flex items-center gap-1 ${categoryColor}`">
        <LucideMessageSquare class="w-4 h-4" />
        {{ comment.points }}
      </span>
      <a
        :href="`https://news.ycombinator.com/reply?id=${comment.id}&goto=item%3Fid%3D${comment.parent_id}%23${comment.id}`"
        target="_blank"
        rel="noopener noreferrer"
        class="reply-link text-sm hover:underline"
        :class="replyLinkColor"
      >
        Reply
      </a>
      <button 
        v-if="canShowMoreReplies" 
        @click="toggleReplies" 
        class="text-sm text-blue-500 hover:underline focus:outline-none"
      >
        {{ showReplies ? 'Hide replies' : `View ${comment.children.length} repl${comment.children.length > 1 ? 'ies' : 'y'}` }}
      </button>
    </div>
    <div v-if="shouldRenderChildren" class="comment-children">
      <CommentThread
        v-for="child in comment.children"
        :key="child.id"
        :comment="child"
        :current-depth="currentDepth + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, computed, ref } from 'vue'
import { LucideMessageSquare, LucideClock } from '@lucide/vue'
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
}>()

const { sanitize } = useSanitizer()
const sanitizedText = computed(() => sanitize(props.comment.text || ''))

const MAX_DEPTH = 3
const currentDepth = computed(() => props.currentDepth || 1)

const colorMode = useColorMode()

const commentPaletteStyle = computed(() => ({
  ...getSeedPaletteStyle(props.comment.author, colorMode.value === 'dark' ? 'dark' : 'light'),
}))

const timeAgo = computed(() => {
  return formatDistanceToNow(new Date(props.comment.created_at), { addSuffix: true })
})

const categoryColor = computed(() => {
  if (props.comment.points < 100 && props.comment.children.length < 50) return 'text-gray-500'
  if (props.comment.points >= 100 && props.comment.children.length < 50) return 'text-yellow-600'
  if (props.comment.points < 100 && props.comment.children.length >= 50) return 'text-red-600'
  return 'text-green-600'
})

const replyLinkColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'
})

const headerTextColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600'
})

const textColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-300' : 'text-gray-700'
})

const commentContainerClasses = computed(() => {
  return [
    'comment-container',
    'mb-3',
    `comment-depth-${Math.min(currentDepth.value, MAX_DEPTH)}`,
    {
      'comment-max-depth': currentDepth.value >= MAX_DEPTH,
    },
  ]
})

const showReplies = ref(false)

const canShowMoreReplies = computed(() => {
  return currentDepth.value >= MAX_DEPTH && props.comment.children.length > 0
})

const toggleReplies = () => {
  showReplies.value = !showReplies.value
}

const shouldRenderChildren = computed(() => {
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
  background:
    linear-gradient(90deg, var(--seed-surface-strong) 0%, var(--seed-surface) 58%, transparent 100%);
  border: 1px solid var(--seed-border);
  border-left: 4px solid var(--seed-rail);
  border-radius: 0.5rem;
  padding: 0.875rem 1rem 1rem;
  transition: background-color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.comment-container::before {
  content: '';
  position: absolute;
  inset: 0.75rem auto 0.75rem -4px;
  width: 4px;
  border-radius: 999px;
  background: var(--seed-accent);
  box-shadow: 0 0 0 3px var(--seed-ring);
}

.comment-depth-2 {
  border-left-width: 3px;
}

.comment-depth-3 {
  border-left-width: 2px;
}

.comment-max-depth {
  background:
    linear-gradient(90deg, var(--seed-surface-strong) 0%, var(--seed-surface) 45%, transparent 100%);
}

.comment-header {
  gap: 0.375rem;
  flex-wrap: wrap;
}

.author-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 0.375rem;
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

.comment-children {
  border-left: 1px dashed var(--seed-child-guide);
  margin-top: 0.875rem;
  padding-left: 1rem;
}

.comment-header a:hover {
  text-decoration: underline;
}

.reply-link {
  /* Additional styling if needed */
}

@media (max-width: 640px) {
  .comment-container {
    padding: 0.75rem;
  }

  .comment-children {
    margin-top: 0.75rem;
    padding-left: 0.625rem;
  }
}
</style>
