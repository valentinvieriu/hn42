<template>
  <div 
    role="article"
    tabindex="0"
    @keydown.enter="handleCardClick"
    ref="cardRef"
    :data-screenshot-state="imageState"
    :data-screenshot-requested="queuedImageSrc ? 'started' : 'pending'"
    class="story-card group flex flex-col rounded-2xl overflow-hidden transition-[border-color,box-shadow,transform] duration-300" 
    :class="[
      colorMode.value === 'dark' ? 'bg-gray-900' : 'bg-white', 
      { 'pointer-events-none': isScrolling }
    ]" 
    :style="cardPaletteStyle">
    <div class="relative aspect-[4/4] shrink-0 overflow-hidden">
      <NuxtLink :to="`/item/${story.objectID}`" class="block h-full">
        <div class="absolute inset-0 overflow-hidden">
          <div class="story-visual-fallback absolute inset-0" :style="fallbackVisualStyle" aria-hidden="true">
            <div class="fallback-panels absolute inset-0">
              <span
                v-for="panel in fallbackPanels"
                :key="panel.key"
                class="fallback-panel absolute"
                :class="panel.variant"
                :style="panel.style"
              ></span>
            </div>
            <div class="fallback-mark" aria-hidden="true">{{ fallbackInitials }}</div>
          </div>
          <div 
            ref="imageContainerRef"
            class="relative w-full h-full transform transition-transform duration-500 will-change-transform" 
            :class="{
              scrolling: isTouchDevice && isInView,
              'group-hover:translate-y-[-50%]': !isTouchDevice || !isInView
            }">
            <img
              v-if="queuedImageSrc"
              :alt="story.title"
              width="400"
              :src="queuedImageSrc"
              loading="eager"
              decoding="async"
              fetchpriority="low"
              class="w-full object-cover transition-opacity duration-500"
              :class="imageState === 'loaded' ? 'opacity-100' : 'opacity-0'"
              :aria-hidden="imageState !== 'loaded'"
              @load="handleImageLoad"
              @error="handleImageError"
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
    <div class="story-card-body flex flex-1 flex-col p-4 md:p-5">
      <div class="flex items-center justify-between gap-3 mb-3">
        <NuxtLink
          :to="externalStoryUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="story-domain-chip text-[0.72rem] font-semibold leading-none px-2 py-1.5 rounded-full border"
          :style="{
            backgroundColor: 'var(--seed-accent-soft)',
            borderColor: 'var(--seed-border)',
            color: 'var(--seed-author-text)'
          }"
        >
          {{ storyDomain }}
        </NuxtLink>
        <NuxtLink
          :to="externalStoryUrl"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open external link"
          tabindex="0"
          class="story-card-external flex items-center"
        >
          <LucideExternalLink class="w-4 h-4" />
        </NuxtLink>
      </div>
      <NuxtLink :to="`/item/${story.objectID}`">
        <h2 class="story-card-title font-display text-[1.05rem] md:text-lg font-semibold leading-snug mb-3 line-clamp-2 md:line-clamp-2 md:min-h-[3.15rem] overflow-hidden">
          {{ story.title }}
        </h2>
      </NuxtLink>
      <div class="meta-text flex items-center justify-between gap-3 mb-3">
        <NuxtLink
          :to="getUserPath(story.author)"
          class="story-card-muted"
        >
          {{ story.author }}
        </NuxtLink>
        <span class="story-card-muted flex items-center gap-1">
          <LucideClock class="w-4 h-4" aria-label="Time since created" />
          {{ formatDistanceToNow(new Date(story.created_at), { addSuffix: true }) }}
        </span>
      </div>
      <div class="meta-text mt-auto flex items-center justify-between gap-3">
        <span :class="['story-card-metric flex items-center gap-1', pointsToneClass]">
          <LucideTrendingUp class="w-4 h-4" />
          {{ story.points }}
        </span>
        <span :class="['story-card-metric flex items-center gap-1', commentsToneClass]">
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
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { LucideTrendingUp, LucideMessageSquare, LucideExternalLink, LucideClock } from '@lucide/vue'
import { formatDistanceToNow } from 'date-fns'
import { useScroll } from '~/composables/useScroll'
import type { Story } from '~/types'
import { useRouter } from 'vue-router'
import { useDebounce } from '~/composables/useDebounce'; // Import the new debounce function
import { useImageLoadQueue, type ImageLoadQueueHandle } from '~/composables/useImageLoadQueue'
import { getSeedPaletteStyle } from '~/composables/useSeedPalette'

const props = defineProps<{
  story: Story
}>()

const { isScrolling } = useScroll()

const getDomainFromUrl = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'news.ycombinator.com'
  }
}

const getHnItemUrl = (id: string) => `https://news.ycombinator.com/item?id=${id}`
const getUserPath = (author: string) => `/user/${encodeURIComponent(author)}`

const colorMode = useColorMode()

const cardPaletteStyle = computed(() => {
  return getSeedPaletteStyle(props.story.objectID, colorMode.value === 'dark' ? 'dark' : 'light')
})

const externalStoryUrl = computed(() => props.story.url || getHnItemUrl(props.story.objectID))
const storyDomain = computed(() => getDomainFromUrl(externalStoryUrl.value))
const storySeed = computed(() => `${props.story.objectID}:${props.story.title}:${externalStoryUrl.value}`)

const hashSeed = (seed: string): number => {
  let hash = 2166136261

  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const seededRange = (salt: string, min: number, max: number): number => {
  const hash = hashSeed(`${storySeed.value}:${salt}`)
  return min + (hash % (max - min + 1))
}

const fallbackInitials = computed(() => {
  const domain = storyDomain.value.replace(/^www\./, '')
  const domainLabel = domain.split('.')[0] || props.story.title || 'HN'
  const compactLabel = domainLabel.replace(/[^a-z0-9]/gi, '')

  return (compactLabel.slice(0, 2) || 'HN').toUpperCase()
})

const fallbackVisualStyle = computed(() => {
  const angle = seededRange('angle', -32, 32)

  return {
    '--fallback-angle': `${angle}deg`,
    '--fallback-frame-angle': `${angle * -0.5}deg`,
    '--fallback-band-angle': `${angle * 0.25}deg`,
    '--fallback-grid': `${seededRange('grid', 26, 44)}px`,
    '--fallback-sweep': `${seededRange('sweep', 18, 76)}%`,
    '--fallback-cut': `${seededRange('cut', 24, 68)}%`,
  }
})

const fallbackPanels = computed(() => {
  return Array.from({ length: 9 }, (_, index) => {
    const panelSeed = `panel-${index}`
    const width = seededRange(`${panelSeed}-width`, 18, 46)
    const height = seededRange(`${panelSeed}-height`, 5, 15)
    const left = seededRange(`${panelSeed}-left`, -8, 86)
    const top = seededRange(`${panelSeed}-top`, 9, 84)
    const rotate = seededRange(`${panelSeed}-rotate`, -22, 22)
    const opacity = seededRange(`${panelSeed}-opacity`, 30, 68) / 100

    return {
      key: `${props.story.objectID}-${index}`,
      variant: index % 3 === 0 ? 'fallback-panel-strong' : index % 3 === 1 ? 'fallback-panel-soft' : 'fallback-panel-line',
      style: {
        width: `${width}%`,
        height: `${height}%`,
        left: `${left}%`,
        top: `${top}%`,
        opacity,
        transform: `rotate(${rotate}deg)`,
      },
    }
  })
})

const screenshotSrc = computed(() => `/api/screenshot/${props.story.objectID}`)

// Define the radial gradient style using OKLCH CSS variables
const radialGradientStyle = computed(() => ({
  background: `radial-gradient(
    circle at center,
    transparent 0%,
    var(--seed-overlay-mid) 75%,
    var(--seed-overlay-edge) 100%
  )`
}))

const pointsToneClass = computed(() => {
  if (props.story.points < 100 && props.story.num_comments < 50) {
    return colorMode.value === 'dark' ? 'text-slate-400' : 'text-slate-600'
  }

  if (props.story.points >= 100 && props.story.num_comments < 50) {
    return colorMode.value === 'dark' ? 'text-amber-300' : 'text-amber-800'
  }

  if (props.story.points < 100 && props.story.num_comments >= 50) {
    return colorMode.value === 'dark' ? 'text-red-400' : 'text-red-700'
  }

  return colorMode.value === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
})

const commentsToneClass = computed(() => {
  if (props.story.num_comments < 50) {
    return colorMode.value === 'dark' ? 'text-slate-400' : 'text-slate-600'
  }

  return colorMode.value === 'dark' ? 'text-red-400' : 'text-red-700'
})

const router = useRouter()

const handleCardClick = () => {
  router.push(`/item/${props.story.objectID}`)
}

// Touch device detection starts false for SSR and initial hydration.
const isTouchDevice = ref(false)

// Refs for DOM elements
const cardRef = ref<HTMLElement | null>(null)
const imageContainerRef = ref<HTMLElement | null>(null)
const queuedImageSrc = ref<string | null>(null)
const imageState = ref<'queued' | 'loading' | 'loaded' | 'failed'>('queued')
const hasRequestedImageLoad = ref(false)
const { enqueueImageLoad } = useImageLoadQueue()
let imageQueueHandle: ImageLoadQueueHandle | null = null
let imageLoadObserver: IntersectionObserver | null = null

const releaseImageQueueSlot = () => {
  imageQueueHandle?.complete()
  imageQueueHandle = null
}

const handleImageLoad = (event: Event) => {
  const image = event.target as HTMLImageElement
  imageState.value = image.naturalWidth > 1 && image.naturalHeight > 1 ? 'loaded' : 'failed'
  releaseImageQueueSlot()
}

const handleImageError = () => {
  imageState.value = 'failed'
  releaseImageQueueSlot()
}

const queueScreenshotLoad = () => {
  if (queuedImageSrc.value || imageQueueHandle) {
    return
  }

  hasRequestedImageLoad.value = true
  imageState.value = 'queued'
  imageQueueHandle = enqueueImageLoad(() => {
    imageState.value = 'loading'
    queuedImageSrc.value = screenshotSrc.value
  })
}

watch(
  () => props.story.objectID,
  async () => {
    imageQueueHandle?.cancel()
    imageQueueHandle = null
    queuedImageSrc.value = null
    imageState.value = 'queued'
    await nextTick()

    if (hasRequestedImageLoad.value) {
      queueScreenshotLoad()
    }
  },
)

// Visibility state
const isInView = ref(false)

// Animation frame ID
let animationFrameId: number | null = null
let observer: IntersectionObserver | null = null

// Scroll handling
const scrollProgress = ref(0)

let windowHeight = 0

const getWindowHeight = () => window.innerHeight || document.documentElement.clientHeight

const updateWindowHeight = useDebounce(() => {
  windowHeight = getWindowHeight()
}, 150);

const handleScroll = () => {
  if (!isInView.value || !isTouchDevice.value || !imageContainerRef.value) return;

  const card = cardRef.value;
  if (!card) return;

  const rect = card.getBoundingClientRect();

  // Calculate how much of the card is visible (0 to 1)
  const visibleRatio = Math.max(0, Math.min(1, (windowHeight - rect.top) / (rect.height + windowHeight)));

  // Update scroll progress based on visibility
  scrollProgress.value = visibleRatio;

  // Apply transform using translate3d for better performance
  imageContainerRef.value.style.transform = `translate3d(0, ${-50 * scrollProgress.value}%, 0)`;
};

const animate = () => {
  handleScroll()
  animationFrameId = requestAnimationFrame(animate)
}

onMounted(() => {
  if ('IntersectionObserver' in window) {
    imageLoadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          queueScreenshotLoad()
          imageLoadObserver?.disconnect()
          imageLoadObserver = null
        }
      },
      {
        rootMargin: '700px 0px',
        threshold: 0.01,
      },
    )

    if (cardRef.value) {
      imageLoadObserver.observe(cardRef.value)
    }
  } else {
    queueScreenshotLoad()
  }

  isTouchDevice.value = ('ontouchstart' in window) || navigator.maxTouchPoints > 0
  windowHeight = getWindowHeight()

  if (isTouchDevice.value) {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          isInView.value = entry.isIntersecting;
          if (entry.isIntersecting) {
            // Reset transform when card comes into view
            if (imageContainerRef.value) {
              imageContainerRef.value.style.transform = 'translate3d(0, 0%, 0)';
            }
            if (!animationFrameId) {
              animate();
            }
          } else {
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }
          }
        });
      },
      {
        threshold: [0, 0.5, 1],
        rootMargin: '0px', // Adjust if necessary to preload images slightly before they enter the viewport
      }
    );

    if (cardRef.value) {
      observer.observe(cardRef.value);
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  window.addEventListener('resize', updateWindowHeight);
})

onBeforeUnmount(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  imageQueueHandle?.cancel()
  imageLoadObserver?.disconnect()
  observer?.disconnect()
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('resize', updateWindowHeight);
})
</script>

<style scoped>
.story-card {
  position: relative;
  border: 1px solid color-mix(in oklch, var(--seed-border) 58%, rgb(203 213 225 / 0.62));
  box-shadow:
    0 18px 44px rgb(15 23 42 / 0.12),
    0 1px 0 rgb(255 255 255 / 0.46) inset;
  transform: translateZ(0);
}

.story-card > * {
  position: relative;
  z-index: 2;
}

.story-card::after {
  content: '';
  position: absolute;
  inset: 1px;
  z-index: 1;
  pointer-events: none;
  border-radius: calc(1rem - 1px);
  background:
    linear-gradient(145deg, rgb(255 255 255 / 0.22), transparent 35%, transparent 100%),
    radial-gradient(circle at 100% 100%, var(--seed-ring) 0, transparent 46%),
    radial-gradient(circle at 12% 0%, rgb(255 255 255 / 0.28), transparent 28%);
  opacity: 0.38;
}

.dark .story-card {
  border-color: var(--seed-border);
  box-shadow:
    0 18px 48px rgb(0 0 0 / 0.32),
    0 1px 0 rgb(255 255 255 / 0.08) inset;
}

.dark .story-card::after {
  background:
    linear-gradient(145deg, rgb(255 255 255 / 0.08), transparent 38%, transparent 100%),
    radial-gradient(circle at 100% 100%, var(--seed-ring) 0, transparent 46%),
    radial-gradient(circle at 12% 0%, rgb(255 255 255 / 0.1), transparent 28%);
  opacity: 0.86;
}

.story-card-body {
  border-top: 1px solid color-mix(in oklch, var(--seed-border) 32%, rgb(226 232 240 / 0.82));
  color: rgb(15 23 42);
  background:
    linear-gradient(
      180deg,
      color-mix(in oklch, white 92%, var(--seed-surface) 8%) 0%,
      color-mix(in oklch, rgb(248 250 252) 88%, var(--seed-surface-strong) 12%) 100%
    );
}

.dark .story-card-body {
  color: rgb(241 245 249);
  border-top-color: color-mix(in oklch, var(--seed-border) 58%, transparent);
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--seed-surface) 72%, black) 0%, color-mix(in oklch, var(--seed-surface-strong) 76%, black) 100%);
}

.story-domain-chip {
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.62) inset;
}

.dark .story-domain-chip {
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.08) inset;
}

.story-card-title {
  color: rgb(15 23 42);
}

.dark .story-card-title {
  color: rgb(241 245 249);
}

.story-card-muted {
  color: rgb(71 85 105);
}

.dark .story-card-muted {
  color: rgb(203 213 225 / 0.82);
}

.story-card-external {
  color: rgb(51 65 85);
  transition: color 180ms ease;
}

.story-card-external:hover,
.story-card-external:focus-visible {
  color: var(--seed-accent-strong);
}

.dark .story-card-external {
  color: rgb(203 213 225 / 0.82);
}

.story-card-metric {
  font-weight: 600;
}

@media (hover: hover) and (pointer: fine) {
  .story-card:hover {
    border-color: var(--seed-accent);
    box-shadow:
      0 24px 62px rgb(15 23 42 / 0.18),
      0 1px 0 rgb(255 255 255 / 0.5) inset;
    transform: translateY(-3px);
  }

  .dark .story-card:hover {
    box-shadow:
      0 24px 62px rgb(0 0 0 / 0.44),
      0 1px 0 rgb(255 255 255 / 0.1) inset;
  }
}

.story-visual-fallback {
  background:
    linear-gradient(135deg, transparent 0 var(--fallback-cut), var(--seed-ring) var(--fallback-cut) calc(var(--fallback-cut) + 1px), transparent calc(var(--fallback-cut) + 1px)),
    repeating-linear-gradient(var(--fallback-angle), rgb(255 255 255 / 0.055) 0 1px, transparent 1px var(--fallback-grid)),
    linear-gradient(150deg, var(--seed-surface-strong) 0%, var(--seed-overlay-mid) var(--fallback-sweep), var(--seed-overlay-edge) 100%);
}

.story-visual-fallback::before,
.story-visual-fallback::after {
  content: '';
  position: absolute;
  inset: 8%;
  pointer-events: none;
}

.story-visual-fallback::before {
  border: 1px solid var(--seed-border);
  opacity: 0.34;
  transform: rotate(var(--fallback-frame-angle));
}

.story-visual-fallback::after {
  inset: 17% 11%;
  border-top: 1px solid var(--seed-border);
  border-bottom: 1px solid var(--seed-border);
  opacity: 0.24;
  transform: skewY(var(--fallback-band-angle));
}

.fallback-panel {
  border: 1px solid var(--seed-border);
  border-radius: 0.5rem;
  box-shadow: 0 18px 40px rgb(15 23 42 / 0.16);
  transform-origin: center;
}

.fallback-panel-strong {
  background: var(--seed-accent-soft);
}

.fallback-panel-soft {
  background: var(--seed-surface);
}

.fallback-panel-line {
  height: 2px !important;
  border-radius: 999px;
  background: var(--seed-accent);
  border-color: transparent;
}

.fallback-mark {
  position: absolute;
  right: 1.1rem;
  bottom: 0.6rem;
  color: var(--seed-accent-strong);
  font-family: var(--font-display);
  font-size: 4.2rem;
  font-weight: 700;
  line-height: 1;
  opacity: 0.2;
  pointer-events: none;
}

.scrolling {
  /* Define the transform within CSS for better performance */
  transform: translate3d(0, -50%, 0);
  transition: transform 0.5s ease-out;
}
</style>
