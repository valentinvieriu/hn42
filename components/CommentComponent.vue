<template>
  <div class="ml-4 border-l-2 pl-4 mb-4">
    <div :class="`text-sm ${
      colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600'
    } mb-1`">
      <span class="font-medium">
        <a :href="`https://news.ycombinator.com/user?id=${comment.author}`" target="_blank" rel="noopener noreferrer">
          {{ comment.author }}
        </a>
      </span> • {{ timeAgo }} ago
    </div>
    <p 
      :class="`${colorMode.value === 'dark' ? 'text-gray-300' : 'text-gray-700'}`" 
      v-html="sanitizedText"
    ></p>
    <div class="flex items-center gap-2 mt-2">
      <span :class="`flex items-center gap-1 ${
        comment.points < 100 && comment.children.length < 50
          ? 'text-gray-500'
          : comment.points >= 100 && comment.children.length < 50
          ? 'text-yellow-600'
          : comment.points < 100 && comment.children.length >= 50
          ? 'text-red-600'
          : 'text-green-600'
      }`">
        <LucideMessageSquare class="w-4 h-4" />
        {{ comment.points }}
      </span>
      <a
        :href="`https://news.ycombinator.com/reply?id=${comment.id}&goto=item%3Fid%3D${comment.parent_id}%23${comment.id}`"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm hover:underline"
        :class="`${
          colorMode.value === 'dark'
            ? 'text-gray-400 hover:text-gray-300'
            : 'text-gray-600 hover:text-gray-800'
        }`"
      >
        Reply
      </a>
    </div>
    <div v-if="comment.children && comment.children.length > 0" class="mt-4">
      <CommentComponent
        v-for="child in comment.children"
        :key="child.id"
        :comment="child"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { LucideTrendingUp } from 'lucide-vue-next'
import DOMPurify from 'dompurify'
import { formatDistanceToNow } from 'date-fns' // Importing the function

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
}>()

const colorMode = useColorMode()

const timeAgo = computed(() => {
  return formatDistanceToNow(new Date(props.comment.created_at), { addSuffix: true }) // Updated to use date-fns
})

// Sanitize the comment text
const sanitizedText = computed(() => {
  let clean = DOMPurify.sanitize(props.comment.text, {
    ALLOWED_TAGS: ['a', 'p', 'strong', 'em', 'ul', 'li', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
  // Add rel="noopener noreferrer" to all <a> tags
  clean = clean.replace(/<a /g, '<a rel="noopener noreferrer" ')
  return clean
})
</script>

<style scoped>
/* Add any component-specific styles here */
</style>
