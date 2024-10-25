<template>
  <div
    class="group bg-white dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
    @mouseenter="hoveredStory = story.objectID"
    @mouseleave="hoveredStory = null"
  >
    <div class="relative aspect-[3/4] overflow-hidden">
      <NuxtLink :to="`/item/${story.objectID}`" class="block h-full">
        <div class="absolute inset-0 overflow-hidden">
          <div class="relative w-full h-full transform transition-transform duration-500 group-hover:translate-y-[-50%]">
            <NuxtImg 
                :alt="story.title"
                provider="cloudflare" 
                preset="thumbnail"
                width="400"
                :src="story.screenshotUrl" 
                loading="lazy"
                class="w-full object-cover"/>
          </div>
        </div>
        <div class="absolute inset-0">
          <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0),_rgba(0,0,0,0.1),_rgba(0,0,0,0.4))]"></div>
        </div>
      </NuxtLink>
    </div>
    <div class="p-4">
      <div class="flex items-center justify-between mb-2">
        <NuxtLink
          :to="story.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs font-medium px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full"
        >
          {{ getDomainFromUrl(story.url) }}
        </NuxtLink>
        <a
          :href="story.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <LucideExternalLink class="w-4 h-4" />
        </a>
      </div>
      <NuxtLink :to="`/item/${story.objectID}`">
        <h2 class="text-lg font-semibold mb-2 line-clamp-2">
          {{ story.title }}
        </h2>
      </NuxtLink>
      <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
        <a :href="`https://news.ycombinator.com/user?id=${story.author}`" target="_blank" rel="noopener noreferrer">
        {{ story.author }}
        </a>
        <span>{{ formatDistanceToNow(new Date(story.created_at), { addSuffix: true }) }} ago</span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <LucideTrendingUp class="w-4 h-4" />
          {{ story.points }}
        </span>
        <span class="flex items-center gap-1 text-gray-600 dark:text-gray-400">
          <LucideMessageSquare class="w-4 h-4" />
          <NuxtLink :to="`/item/${story.objectID}`" class="cursor-pointer">
            {{ story.num_comments }}
          </NuxtLink>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue';
import { LucideTrendingUp, LucideMessageSquare, LucideExternalLink } from 'lucide-vue-next';
import { formatDistanceToNow } from 'date-fns';

const props = defineProps<{
  story: {
    objectID: string;
    title: string;
    author: string;
    created_at: string;
    points: number;
    num_comments: number;
    url: string;
    screenshotUrl: string;
  };
}>();

const getDomainFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};
</script>

