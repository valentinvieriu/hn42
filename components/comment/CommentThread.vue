<template>
  <div
    :class="commentContainerClasses"
    :style="commentStyleVars"
  >
    <div :class="`comment-header text-sm ${headerTextColor} mb-2 flex items-center justify-between gap-3`">
      <div class="flex items-center min-w-0">
        <span class="inline-flex w-2.5 h-2.5 rounded-full mr-2 shrink-0" :style="authorDotStyle" aria-hidden="true" />
        <span class="font-medium truncate">
          <a :href="`https://news.ycombinator.com/user?id=${comment.author}`" target="_blank" rel="noopener noreferrer" class="hover:underline">
            {{ comment.author }}
          </a>
        </span>
        <span class="mx-1">•</span>
        <span class="flex items-center text-xs shrink-0">
          <LucideClock class="w-4 h-4 mr-1" />
          {{ timeAgo }}
        </span>
      </div>
      <span class="text-[11px] uppercase tracking-wide opacity-70 shrink-0">Depth {{ currentDepth }}</span>
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

    <div v-if="shouldRenderChildren" class="mt-4 space-y-2">
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

const MAX_DEPTH = 3
const currentDepth = computed(() => props.currentDepth || 1)
const colorMode = useColorMode()

const { sanitize } = useSanitizer()
const sanitizedText = computed(() => sanitize(props.comment.text))

const timeAgo = computed(() => {
  return formatDistanceToNow(new Date(props.comment.created_at), { addSuffix: true })
})

const { getHueFromSeed, getOklchColor } = useSeededPalette()

const authorHue = computed(() => getHueFromSeed(props.comment.author))
const depthOffset = computed(() => (currentDepth.value * 14) % 40)

const authorDotStyle = computed(() => ({
  backgroundColor: getOklchColor(props.comment.author, colorMode.value === 'dark' ? 68 : 56, 0.15)
}))

const commentStyleVars = computed(() => {
  const isDark = colorMode.value === 'dark'
  const lightness = isDark ? 20 + depthOffset.value / 8 : 97 - depthOffset.value / 3
  const borderLightness = isDark ? 60 : 72

  return {
    '--comment-bg': `oklch(${lightness}% ${isDark ? 0.045 : 0.03} ${authorHue.value})`,
    '--comment-border': `oklch(${borderLightness}% 0.12 ${authorHue.value})`
  }
})

const categoryColor = computed(() => {
  if (props.comment.points < 100 && props.comment.children.length < 50) return 'text-gray-500'
  if (props.comment.points >= 100 && props.comment.children.length < 50) return 'text-yellow-600'
  if (props.comment.points < 100 && props.comment.children.length >= 50) return 'text-red-600'
  return 'text-green-600'
})

const replyLinkColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900'
})

const headerTextColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-300' : 'text-gray-700'
})

const textColor = computed(() => {
  return colorMode.value === 'dark' ? 'text-gray-200' : 'text-gray-800'
})

const commentContainerClasses = computed(() => {
  return [
    'comment-container',
    'mb-3',
    'relative pl-4 border-l-4'
  ]
})

const showReplies = ref(false)
const canShowMoreReplies = computed(() => currentDepth.value >= MAX_DEPTH && props.comment.children.length > 0)
const toggleReplies = () => { showReplies.value = !showReplies.value }
const shouldRenderChildren = computed(() => currentDepth.value < MAX_DEPTH ? props.comment.children.length > 0 : showReplies.value)
</script>

<style scoped>
.comment-container {
  background-color: var(--comment-bg, transparent);
  border-left-color: var(--comment-border, rgba(156, 163, 175, 0.7));
  padding: 0.9rem;
  border-radius: 0.6rem;
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.comment-header a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .comment-container {
    padding: 0.65rem;
  }
}
</style>
