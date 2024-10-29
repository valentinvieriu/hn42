<template>
  <div 
    role="article"
    tabindex="0"
    @keydown.enter="handleCardClick"
    ref="cardRef"
    class="group rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300" 
    :class="[
      colorMode.value === 'dark' ? 'bg-gray-900' : 'bg-white', 
      { 'pointer-events-none': isScrolling }
    ]" 
    :style="gradientStyle">
    <div class="relative aspect-[4/4] overflow-hidden">
      <NuxtLink :to="`/item/${story.objectID}`" class="block h-full">
        <div class="absolute inset-0 overflow-hidden">
          <div 
            ref="imageContainerRef"
            class="relative w-full h-full transform transition-transform duration-500 will-change-transform" 
            :class="isTouchDevice && isInView ? 'scrolling' : 'group-hover:translate-y-[-50%]'">
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
    <div class="p-4 border-t-4" :style="{ 'border-top-color': 'hsla(var(--card-hue), var(--card-saturation), var(--card-luminosity), 100%)' }">
      <div class="flex items-center justify-between mb-2">
        <NuxtLink
          :to="story.url"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs font-medium px-2 py-1 rounded-full opacity-75"
          :style="{ backgroundColor: 'hsla(var(--card-hue), var(--card-saturation), var(--card-luminosity), 100%)' }"
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
        <h2 class="text-lg font-semibold mb-2 line-clamp-2 md:line-clamp-2 md:min-h-[5em] overflow-hidden">
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
        <span class="flex items-center gap-1 opacity-75">
          <LucideClock class="w-4 h-4" aria-label="Time since created" />
          {{ formatDistanceToNow(new Date(story.created_at), { addSuffix: true }) }}
        </span>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span :class="`flex items-center gap-1 ${
          story.points < 100 && story.num_comments < 50
            ? 'text-gray-500'
            : story.points >= 100 && story.num_comments < 50
            ? 'text-yellow-600'
            : story.points < 100 && story.num_comments >= 50
            ? 'text-red-600'
            : 'text-green-600'
        }`">
          <LucideTrendingUp class="w-4 h-4" />
          {{ story.points }}
        </span>
        <span :class="`flex items-center gap-1 ${
          story.num_comments < 50
            ? 'text-gray-500'
            : story.num_comments >= 50
            ? 'text-red-600'
            : 'text-green-600'
        }`">
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
import { defineProps, computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { LucideTrendingUp, LucideMessageSquare, LucideExternalLink, LucideClock } from 'lucide-vue-next'
import { formatDistanceToNow } from 'date-fns'
import { useScroll } from '~/composables/useScroll'
import { Story } from '~/types'
import { useRouter } from 'vue-router'
import { useColorMode } from '@vueuse/core'

const props = defineProps<{
  story: Story
}>()

const { isScrolling } = useScroll()

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
    hsla(var(--card-hue), 0%, 0%, 0) 0%,
    hsla(var(--card-hue), 35%, 35%, 30%) 75%,
    hsla(var(--card-hue), 35%, 20%, 40%) 100%
  )`
}))

// Function to compute a hash from the objectID
const computeHue = (id: string): number => {
  const goldenRatio = 0.618033988749895
  const hue = (parseInt(id, 10) * goldenRatio * 360) % 360 // Convert id to a number
  return Math.floor(hue)
}

// Compute the hue for the current story
const hue = computed(() => computeHue(props.story.objectID))

// Define CSS variables for the gradient colors
const gradientStyle = computed(() => ({
  '--card-hue': `${hue.value}`
}))

const colorMode = useColorMode()

// Extract category color logic into computed properties
const categoryColorUpvotes = computed(() => {
  if (props.story.points < 100 && props.story.num_comments < 50) return 'text-gray-500'
  if (props.story.points >= 100 && props.story.num_comments < 50) return 'text-yellow-600'
  if (props.story.points < 100 && props.story.num_comments >= 50) return 'text-red-600'
  return 'text-green-600'
})

const categoryColorComments = computed(() => {
  return props.story.num_comments < 50 ? 'text-gray-500' : props.story.num_comments >= 50 ? 'text-red-600' : 'text-green-600'
})

const router = useRouter()

const handleCardClick = () => {
  router.push(`/item/${props.story.objectID}`)
}

// Touch device detection
const isTouchDevice = computed(() => {
  if (typeof window !== 'undefined') {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
  }
  return false
})

// Refs for DOM elements
const cardRef = ref<HTMLElement | null>(null)
const imageContainerRef = ref<HTMLElement | null>(null)

// Visibility state
const isInView = ref(false)

// Animation frame ID
let animationFrameId: number | null = null

// Scroll handling
const scrollProgress = ref(0)

const handleScroll = () => {
  if (!isInView.value || !isTouchDevice.value || !imageContainerRef.value) return

  const card = cardRef.value
  if (!card) return

  const rect = card.getBoundingClientRect()
  const windowHeight = window.innerHeight || document.documentElement.clientHeight

  // Calculate how much of the card is visible (0 to 1)
  const visibleRatio = Math.max(0, Math.min(1, (windowHeight - rect.top) / (rect.height + windowHeight)))

  // Update scroll progress based on visibility
  scrollProgress.value = visibleRatio

  // Apply transform to move in sync with scroll direction
  // Start at 0 and move down to -50% as user scrolls
  imageContainerRef.value.style.transform = `translateY(${-50 * scrollProgress.value}%)`
}

const animate = () => {
  handleScroll()
  animationFrameId = requestAnimationFrame(animate)
}

onMounted(() => {
  if (isTouchDevice.value) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          isInView.value = entry.isIntersecting
          if (entry.isIntersecting) {
            // Reset transform when card comes into view
            if (imageContainerRef.value) {
              imageContainerRef.value.style.transform = 'translateY(0%)'
            }
            if (!animationFrameId) {
              animate()
            }
          } else {
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId)
              animationFrameId = null
            }
          }
        })
      },
      {
        threshold: [0, 0.5, 1]
      }
    )

    if (cardRef.value) {
      observer.observe(cardRef.value)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
  }
})

onBeforeUnmount(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  window.removeEventListener('scroll', handleScroll)
})
</script>

<style scoped>
.scrolling {
  /* Additional styles if needed for scrolling state */
}
</style>
