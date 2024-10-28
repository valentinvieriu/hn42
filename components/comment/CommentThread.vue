<template>
  <div :class="commentContainerClasses">
    <div :class="`comment-header text-sm ${headerTextColor} mb-1 flex items-center`">
      <span class="font-medium">
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
    <p 
      :class="`comment-text ${textColor} break-words overflow-hidden whitespace-normal`" 
      v-html="sanitizedText"
    ></p>
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
    <div v-if="shouldRenderChildren" class="mt-4">
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
import { LucideMessageSquare, LucideClock } from 'lucide-vue-next'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns'
import { useSanitizer } from '~/composables/useSanitizer'; // Import the sanitizer composable

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

const { sanitize } = useSanitizer();
const sanitizedText = computed(() => sanitize(props.comment.text));

const MAX_DEPTH = 3
const currentDepth = computed(() => props.currentDepth || 1)

const colorMode = useColorMode()

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
    'mb-4',
    {
      'relative pl-4 border-l-2 border-gray-300': currentDepth.value < MAX_DEPTH,
      'relative pl-4 border-l-2 border-gray-200': currentDepth.value >= MAX_DEPTH, // Adjust styling for max depth
    }
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
  background-color: var(--comment-bg, transparent);
  padding: 1rem;
  border-radius: 0.5rem;
  transition: background-color 0.3s ease;
}

.comment-container:nth-child(odd) {
  --comment-bg: rgba(0, 0, 0, 0.05);
}

.comment-header a:hover {
  text-decoration: underline;
}

.reply-link {
  /* Additional styling if needed */
}

@media (max-width: 640px) {
  .comment-container {
    padding: 0.5rem;
  }
}
</style>
