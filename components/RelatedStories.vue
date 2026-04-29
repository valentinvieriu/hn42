<template>
  <div v-if="mounted" class="mt-8">
    <h2 :class="['text-xl', 'font-semibold', 'mb-4', colorMode.value === 'dark' ? 'text-gray-100' : 'text-gray-900']">
      Related Stories
    </h2>
    <div v-if="loading" class="text-gray-500">
      Loading related stories...
    </div>
    <div v-else-if="error" class="text-gray-500">
      Failed to load related stories.
    </div>
    <div v-else-if="stories.length === 0" class="text-gray-500">
      No related stories found.
    </div>
    <div v-else class="space-y-4">
      <NuxtLink
        v-for="story in stories"
        :key="story.objectID"
        :to="`/item/${story.objectID}`"
        class="block p-4 rounded-lg transition-colors"
        :class="colorMode.value === 'dark' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'"
      >
        <h3 class="font-medium mb-2">{{ story.title }}</h3>
        <div class="text-sm flex items-center gap-4" :class="colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600'">
          <span class="flex items-center gap-1">
            <LucideTrendingUp class="w-4 h-4" />
            {{ story.points }}
          </span>
          <span class="flex items-center gap-1">
            <LucideMessageSquare class="w-4 h-4" />
            {{ story.num_comments }}
          </span>
          <span>by {{ story.author }}</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { LucideTrendingUp, LucideMessageSquare } from 'lucide-vue-next'

const props = defineProps<{
  storyId: string
}>()

const colorMode = useColorMode()
const mounted = ref(false)
const loading = ref(true)
const error = ref(null)
const stories = ref([])

onMounted(async () => {
  mounted.value = true
  try {
    stories.value = await $fetch(`/api/related/${props.storyId}`)
  } catch (err) {
    error.value = err
    console.error('Failed to fetch related stories:', err)
  } finally {
    loading.value = false
  }
})
</script>
