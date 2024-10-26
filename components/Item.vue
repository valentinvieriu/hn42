<template>
  <div class="group rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300" 
     :class="[
       colorMode.value === 'dark' ? 'bg-gray-900' : 'bg-white', 
       { 'pointer-events-none': isScrolling }
     ]" 
     :style="gradientStyle">
    <div class="relative aspect-[4/4] overflow-hidden">
      <NuxtLink :to="`/item/${story.objectID}`" class="block h-full">
        <div class="absolute inset-0 overflow-hidden">
          <div class="relative w-full h-full transform transition-transform duration-500 will-change-transform" :class="isScrolling ? '' : 'group-hover:translate-y-[-50%] opacity-75'">
            <NuxtImg 
              :alt="story.title"
              provider="cloudflare" 
              preset="thumbnail"
              width="400"
              :src="story.screenshotUrl" 
              loading="lazy"
              class="w-full object-cover"
            />
          </div>
        </div>
        <div class="absolute inset-0">
          <div 
            class="absolute inset-0"
            :style="radialGradientStyle"
          ></div>
        </div>
      </NuxtLink>
    </div>
    <div class="p-4 border-t-4" :style="{ 'border-top-color': 'hsla(var(--card-hue), 65%, 65%, var(--gradient-opacity-to))' }">
      <div class="flex items-center justify-between mb-2">
        <NuxtLink
          :to="story.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs font-medium px-2 py-1 rounded-full opacity-75"
          :style="{ backgroundColor: 'hsla(var(--card-hue), 65%, 65%, var(--gradient-opacity-to))' }"
        >
          {{ getDomainFromUrl(story.url) }}
        </NuxtLink>
        <NuxtLink
          :to="story.url"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open external link"
          tabindex="0"
          class="flex items-center"
        >
          <LucideExternalLink class="w-4 h-4" />
        </NuxtLink>
      </div>
      <NuxtLink :to="`/item/${story.objectID}`">
        <h2 class="text-lg font-semibold mb-2 line-clamp-2">
          {{ story.title }}
        </h2>
      </NuxtLink>
      <div class="flex items-center justify-between text-sm mb-2">
        <a 
          :href="`https://news.ycombinator.com/user?id=${story.author}`" 
          target="_blank" 
          rel="noopener noreferrer"
          class="opacity-75"
        >
          {{ story.author }}
        </a>
        <span class="opacity-75">
          {{ formatDistanceToNow(new Date(story.created_at), { addSuffix: true }) }} ago
        </span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="flex items-center gap-1">
          <LucideTrendingUp class="w-4 h-4" />
          {{ story.points }}
        </span>
        <span class="flex items-center gap-1">
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
import { defineProps, computed } from 'vue'
import { LucideTrendingUp, LucideMessageSquare, LucideExternalLink } from 'lucide-vue-next'
import { formatDistanceToNow } from 'date-fns'
import { useScroll } from '~/composables/useScroll' // Import the useScroll composable

const props = defineProps<{
  story: {
    objectID: string
    title: string
    author: string
    created_at: string
    points: number
    num_comments: number
    url: string
    screenshotUrl: string
    hue: number
  }
}>()

const { isScrolling } = useScroll(); // Use the scroll detection

const getDomainFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

// Define the radial gradient style using HSL and CSS variables
const radialGradientStyle = computed(() => ({
  background: `radial-gradient(
    circle at center,
    hsla(var(--card-hue), 0%, 100%, 0) 0%,
    hsla(var(--card-hue), 35%, 75%, var(--gradient-opacity-from)) 35%,
    hsla(var(--card-hue), 45%, 35%, var(--gradient-opacity-to)) 100%
  )`
}))

// Function to compute a hash from the objectID
const computeHue = (id: string): number => {
  const goldenRatio = 0.618033988749895;
  const hue = (parseInt(id, 10) * goldenRatio * 360) % 360; // Convert id to a number
  return Math.floor(hue);
}

// Compute the hue for the current story
const hue = computed(() => computeHue(props.story.objectID))

// Define CSS variables for the gradient colors
const gradientStyle = computed(() => ({
  '--card-hue': `${hue.value}`,
  '--gradient-opacity-from': '0.1', // Adjusted from 0.4 to 0.2
  '--gradient-opacity-to': '0.2', // Adjusted from 0.7 to 0.5
}))

const colorMode = useColorMode();
</script>

<style scoped>
/* Add any component-specific styles here */
</style>

