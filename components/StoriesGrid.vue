<template>
  <div :class="`${colorMode.value === 'dark' ? 'bg-gray-800 text-gray-100' : 'bg-gray-100 text-gray-900'}`">
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div v-if="error" class="text-center mt-20">
        <h1 class="text-3xl font-bold mb-4">Error</h1>
        <p class="mb-6">{{ error }}</p>
        <NuxtLink
          to="/"
          class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
        >
          Back to Home
        </NuxtLink>
      </div>

      <div v-else-if="isLoading" class="text-center mt-20">
        <h1 class="text-3xl font-bold mb-4">Loading...</h1>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Item
          v-for="story in stories"
          :key="story.objectID"
          :story="story"
          @mouseenter="hoveredStory = story.objectID"
          @mouseleave="hoveredStory = null"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useStories } from '~/composables/useStories';
import Item from '~/components/Item.vue';
const props = defineProps<{ endpoint: 'new' | 'show' | 'top' }>();
const { stories, hoveredStory, isLoading, error } = useStories(props.endpoint);
const colorMode = useColorMode();
</script>
