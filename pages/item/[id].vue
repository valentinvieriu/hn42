<template>
  <div :class="['min-h-screen', colorMode.value === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900']">
    <div class="max-w-7xl mx-auto p-4 md:p-8">
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

      <div v-else class="flex flex-col md:flex-row md:gap-8">
        <div class="md:w-1/2 mb-8 md:mb-0">
          <h1 :class="['text-2xl', 'font-bold', 'mb-2', colorMode.value === 'dark' ? 'text-gray-100' : 'text-gray-900']">
            {{ story.title }}
          </h1>
          <a
            :href="story.url"
            target="_blank"
            rel="noopener noreferrer"
            :class="['text-sm', 'flex', 'items-center', 'gap-1', 'mb-2', colorMode.value === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800']"
          >
            <span class="truncate">{{ story.url }}</span> <LucideExternalLink size="14" />
          </a>
          <div :class="['text-sm', 'mb-2', colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600']">
            by {{ story.author }} • {{ timeAgo }} ago
          </div>
          <div class="flex items-center gap-4 text-sm mb-4">
            <span :class="['flex', 'items-center', 'gap-1', story.points >= 0 ? (colorMode.value === 'dark' ? 'text-green-400' : 'text-green-600') : (colorMode.value === 'dark' ? 'text-red-400' : 'text-red-500')]">
              <LucideTrendingUp class="w-4 h-4" />
              {{ story.points }}
            </span>
            <span :class="['flex', 'items-center', 'gap-1', colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600']">
              <LucideMessageSquare class="w-4 h-4" />
              {{ story.children.length }}
            </span>
            <span :class="['flex', 'items-center', 'gap-1', colorMode.value === 'dark' ? 'text-gray-400' : 'text-gray-600']">
              <LucideClock class="w-4 h-4" />
              {{ timeAgo }}
            </span>
          </div>
          <p :class="`${colorMode.value === 'dark' ? 'text-gray-300' : 'text-gray-700'}`" v-html="sanitizedText">
          </p>
          <NuxtImg 
                :alt="story.title"
                provider="cloudflare" 
                preset="detail"
                width="600"
                :src="`/api/screenshot/${route.params.id}`" 
                loading="lazy"
                class="hidden md:block w-full h-auto rounded-lg shadow-md mb-4"
          />
        </div>
        <div class="md:w-1/2">
          <h2 :class="['text-xl', 'font-semibold', 'mb-4', colorMode.value === 'dark' ? 'text-gray-100' : 'text-gray-900']">Comments</h2>
          <div v-if="story.children.length === 0" class="text-gray-500">
            No comments yet.
          </div>
          <div v-else>
            <CommentThread
              v-for="comment in story.children"
              :key="comment.id"
              :comment="comment"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';
import { useStoryCategories } from '~/composables/useStoryCategories'; // Import the new composable
import { LucideExternalLink, LucideTrendingUp, LucideMessageSquare, LucideClock } from 'lucide-vue-next';
import { formatDistanceToNow } from 'date-fns';
import { useSanitizer } from '~/composables/useSanitizer'; // Import the sanitizer composable

const route = useRoute();
const colorMode = useColorMode();
const story = ref(null);
const error = ref(null);
const isLoading = ref(true);

// Fetch story data
const { data: storyData, pending, error: fetchError } = await useFetch(`/api/item/${route.params.id}`, {
  immediate: true,
});

watchEffect(() => {
  if (fetchError.value) {
    error.value = fetchError.value.message;
  }
  if (storyData.value) {
    story.value = storyData.value;
  }
  isLoading.value = pending.value;
});

// Use the new composable for category colors
const { color } = useStoryCategories(story.value?.points || 0, story.value?.children.length || 0);

// Use the sanitizer
const { sanitize } = useSanitizer();
const sanitizedText = computed(() => sanitize(story.value?.text || ''));

const timeAgo = computed(() => {
  if (!story.value?.created_at) return '';
  return formatDistanceToNow(new Date(story.value.created_at), { addSuffix: true });
});

// Update SEO metadata with null checks
const title = computed(() => story.value?.title ?? 'Loading...')
const ogImage = computed(() => story.value?.screenshotUrl ?? 'https://example.com/default-image.png')

// Set SEO metadata
useSeoMeta({
  title,
  description: () => story.value ? `Read the story titled "${story.value.title}" by ${story.value.author}.` : 'Loading story...',
  ogTitle: title,
  ogDescription: () => story.value ? `Read the story titled "${story.value.title}" by ${story.value.author}.` : 'Loading story...',
  ogImage,
  twitterCard: ogImage,
});
</script>

<style scoped>
/* Add any component-specific styles here */
</style>
