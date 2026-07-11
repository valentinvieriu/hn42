<template>
  <div 
    role="article"
    tabindex="0"
    @keydown.enter="handleCardClick"
    ref="cardRef"
    :data-screenshot-state="imageState"
    :data-screenshot-requested="queuedImageSrc ? 'started' : 'pending'"
    class="story-card seed-palette-surface group flex flex-col overflow-hidden rounded-2xl bg-white transition-[border-color,box-shadow,transform] duration-300 dark:bg-gray-900"
    :class="[
      { 'pointer-events-none': isScrolling }
    ]" 
    :style="cardPaletteStyle">
    <div class="story-card-visual relative aspect-[4/4] shrink-0 overflow-hidden">
      <div class="story-card-topbar meta-text">
        <NuxtLink
          :to="externalStoryUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="story-source-link"
          :aria-label="`Open ${storyDomain} externally`"
        >
          <span class="story-domain-chip">{{ storyDomain }}</span>
          <LucideExternalLink class="story-source-icon" aria-hidden="true" />
        </NuxtLink>
        <span class="story-card-time">
          <LucideClock class="w-4 h-4" aria-hidden="true" />
          {{ formatCompactDistanceToNow(story.created_at) }}
        </span>
      </div>
      <NuxtLink :to="`/item/${story.objectID}`" class="block h-full">
        <div class="story-card-image-layer absolute inset-0 overflow-hidden">
          <StoryPlaceholderVisual
            :domain="storyDomain"
            :seed="story.objectID"
            :state="imageState"
            presentation="card"
          />
          <div 
            ref="imageContainerRef"
            class="story-card-image-track relative w-full h-full transform transition-transform duration-500"
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
              class="story-card-image w-full object-cover transition-opacity duration-500"
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
    <div class="story-card-body flex flex-1 flex-col p-4 md:p-4">
      <div class="story-card-body-backdrop" aria-hidden="true">
        <div
          ref="bodyImageContainerRef"
          class="story-card-body-image-track relative w-full h-full transform transition-transform duration-500"
          :class="{
            scrolling: isTouchDevice && isInView,
            'is-loaded': imageState === 'loaded',
            'group-hover:translate-y-[-50%]': !isTouchDevice || !isInView
          }"
        >
          <div class="story-card-body-image" :style="bodyBackdropImageStyle"></div>
        </div>
      </div>
      <div class="story-card-content">
        <NuxtLink :to="`/item/${story.objectID}`" class="story-card-title-link">
          <h2 class="story-card-title font-display text-[1.05rem] md:text-[1.08rem] font-semibold leading-snug line-clamp-3 overflow-hidden">
            {{ story.title }}
          </h2>
        </NuxtLink>
        <div class="story-card-status-row meta-text">
          <NuxtLink
            :to="getUserPath(story.author)"
            class="story-card-author"
          >
            {{ story.author }}
          </NuxtLink>
          <div class="story-card-stat-group">
            <span
              :class="['story-card-metric', pointsToneClass]"
              :aria-label="`${story.points} points`"
            >
              <LucideTrendingUp class="w-4 h-4" aria-hidden="true" />
              <span>{{ story.points }}</span>
              <span class="story-card-metric-label">pts</span>
            </span>
            <span class="story-card-stat-separator" aria-hidden="true"></span>
            <NuxtLink
              :to="`/item/${story.objectID}`"
              :class="['story-card-metric', 'story-card-metric-link', commentsToneClass]"
              :aria-label="`${story.num_comments} comments on ${story.title}`"
            >
              <LucideMessageSquare class="w-4 h-4" aria-hidden="true" />
              <span>{{ story.num_comments }}</span>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { LucideTrendingUp, LucideMessageSquare, LucideExternalLink, LucideClock } from '@lucide/vue'
import { useScroll } from '~/composables/useScroll'
import type { Story } from '#shared/types'
import { useDebounce } from '~/composables/useDebounce'; // Import the new debounce function
import { useImageLoadQueue, type ImageLoadQueueHandle } from '~/composables/useImageLoadQueue'
import { getSeedPaletteStyle } from '~/composables/useSeedPalette'
import { normalizeStoryPlaceholderDomain } from '~/composables/useStoryPlaceholder'

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

const formatCompactDistanceToNow = (dateValue: string): string => {
  const timestamp = new Date(dateValue).getTime()

  if (Number.isNaN(timestamp)) {
    return ''
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  const minute = 60
  const hour = minute * 60
  const day = hour * 24
  const month = day * 30
  const year = day * 365

  if (diffSeconds < minute) {
    return 'now'
  }

  if (diffSeconds < hour) {
    return `${Math.floor(diffSeconds / minute)}m ago`
  }

  if (diffSeconds < day) {
    return `${Math.floor(diffSeconds / hour)}h ago`
  }

  if (diffSeconds < month) {
    return `${Math.floor(diffSeconds / day)}d ago`
  }

  if (diffSeconds < year) {
    return `${Math.floor(diffSeconds / month)}mo ago`
  }

  return `${Math.floor(diffSeconds / year)}y ago`
}

const externalStoryUrl = computed(() => props.story.url || getHnItemUrl(props.story.objectID))
const storyDomain = computed(() => getDomainFromUrl(externalStoryUrl.value))
const paletteDomain = computed(() => normalizeStoryPlaceholderDomain(storyDomain.value))
const cardPaletteStyle = computed(() => getSeedPaletteStyle(props.story.objectID, 'light', paletteDomain.value))

const screenshotSrc = computed(() => `/api/screenshot/${props.story.objectID}?variant=thumbnail`)

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
    return 'story-card-tone-muted'
  }

  if (props.story.points >= 100 && props.story.num_comments < 50) {
    return 'story-card-tone-points'
  }

  if (props.story.points < 100 && props.story.num_comments >= 50) {
    return 'story-card-tone-comments'
  }

  return 'story-card-tone-active'
})

const commentsToneClass = computed(() => {
  if (props.story.num_comments < 50) {
    return 'story-card-tone-muted'
  }

  return 'story-card-tone-comments'
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
const bodyImageContainerRef = ref<HTMLElement | null>(null)
const queuedImageSrc = ref<string | null>(null)
const imageState = ref<'queued' | 'loading' | 'loaded' | 'failed'>('queued')
const hasRequestedImageLoad = ref(false)
const { enqueueImageLoad } = useImageLoadQueue()
let imageQueueHandle: ImageLoadQueueHandle | null = null
let imageLoadObserver: IntersectionObserver | null = null

const bodyBackdropImageStyle = computed(() => {
  if (!queuedImageSrc.value || imageState.value !== 'loaded') {
    return {}
  }

  return {
    backgroundImage: `url("${queuedImageSrc.value}")`,
  }
})

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
let scrollAnimationFrameId: number | null = null
let observer: IntersectionObserver | null = null
let isListeningForTouchScroll = false

// Scroll handling
const scrollProgress = ref(0)

let windowHeight = 0

const getWindowHeight = () => window.innerHeight || document.documentElement.clientHeight

const setImageTrackTransform = (transform: string) => {
  if (imageContainerRef.value) {
    imageContainerRef.value.style.transform = transform
  }

  if (bodyImageContainerRef.value) {
    bodyImageContainerRef.value.style.transform = transform
  }
}

const updateImageScrollTransform = () => {
  if (!isInView.value || !isTouchDevice.value || !imageContainerRef.value) return;

  const card = cardRef.value;
  if (!card) return;

  const rect = card.getBoundingClientRect();

  // Calculate how much of the card is visible (0 to 1)
  const visibleRatio = Math.max(0, Math.min(1, (windowHeight - rect.top) / (rect.height + windowHeight)));

  // Update scroll progress based on visibility
  scrollProgress.value = visibleRatio;

  // Apply transform using translate3d for better performance
  setImageTrackTransform(`translate3d(0, ${-50 * scrollProgress.value}%, 0)`);
};

const scheduleImageScrollUpdate = () => {
  if (!isInView.value || !isTouchDevice.value || scrollAnimationFrameId !== null) {
    return
  }

  scrollAnimationFrameId = requestAnimationFrame(() => {
    scrollAnimationFrameId = null
    updateImageScrollTransform()
  })
}

const updateWindowHeight = useDebounce(() => {
  windowHeight = getWindowHeight()
  scheduleImageScrollUpdate()
}, 150)

const addTouchScrollListener = () => {
  if (isListeningForTouchScroll) {
    return
  }

  window.addEventListener('scroll', scheduleImageScrollUpdate, { passive: true })
  isListeningForTouchScroll = true
}

const removeTouchScrollListener = () => {
  if (!isListeningForTouchScroll) {
    return
  }

  window.removeEventListener('scroll', scheduleImageScrollUpdate)
  isListeningForTouchScroll = false
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
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            isInView.value = entry.isIntersecting

            if (entry.isIntersecting) {
              addTouchScrollListener()
              scheduleImageScrollUpdate()
              return
            }

            removeTouchScrollListener()
            if (scrollAnimationFrameId) {
              cancelAnimationFrame(scrollAnimationFrameId)
              scrollAnimationFrameId = null
            }
          })
        },
        {
          threshold: [0, 0.1, 0.5, 1],
          rootMargin: '25% 0px',
        }
      )

      if (cardRef.value) {
        observer.observe(cardRef.value)
      }
    } else {
      isInView.value = true
      addTouchScrollListener()
      scheduleImageScrollUpdate()
    }

    window.addEventListener('resize', updateWindowHeight)
  }
})

onBeforeUnmount(() => {
  if (scrollAnimationFrameId) {
    cancelAnimationFrame(scrollAnimationFrameId)
  }
  imageQueueHandle?.cancel()
  imageLoadObserver?.disconnect()
  observer?.disconnect()
  removeTouchScrollListener()
  window.removeEventListener('resize', updateWindowHeight)
})
</script>

<style scoped>
.story-card {
  position: relative;
  border: 1px solid color-mix(in oklch, var(--seed-border) 70%, rgb(203 213 225 / 0.58));
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--seed-highlight) 54%, transparent), transparent 32%),
    linear-gradient(
      180deg,
      color-mix(in oklch, var(--seed-surface-raised) 26%, transparent),
      color-mix(in oklch, var(--seed-surface) 18%, transparent)
    );
  box-shadow:
    0 20px 48px var(--seed-shadow),
    0 5px 18px rgb(15 23 42 / 0.055),
    0 1px 0 rgb(255 255 255 / 0.46) inset;
  transition-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
}

@supports (content-visibility: auto) {
  .story-card {
    content-visibility: auto;
    contain-intrinsic-size: auto 34rem;
  }
}

.story-card:focus-visible {
  outline: 3px solid var(--seed-ring);
  outline-offset: 4px;
}

.story-card > * {
  position: relative;
  z-index: 2;
}

.story-card::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 0.34), transparent 34%, transparent 100%),
    radial-gradient(circle at 102% 96%, var(--seed-ring) 0, transparent 40%),
    radial-gradient(circle at 10% 0%, var(--seed-highlight) 0, transparent 30%);
  opacity: 0.24;
}

.dark .story-card {
  border-color: var(--seed-border);
  background:
    linear-gradient(145deg, color-mix(in oklch, var(--seed-highlight) 50%, transparent), transparent 34%),
    linear-gradient(
      180deg,
      color-mix(in oklch, var(--seed-surface-raised) 34%, transparent),
      color-mix(in oklch, var(--seed-surface) 24%, transparent)
    );
  box-shadow:
    0 22px 54px var(--seed-shadow),
    0 5px 18px rgb(0 0 0 / 0.24),
    0 1px 0 rgb(255 255 255 / 0.08) inset;
}

.dark .story-card::after {
  background:
    linear-gradient(145deg, rgb(255 255 255 / 0.09), transparent 38%, transparent 100%),
    radial-gradient(circle at 102% 96%, var(--seed-ring) 0, transparent 42%),
    radial-gradient(circle at 12% 0%, var(--seed-highlight) 0, transparent 30%);
  opacity: 0.5;
}

.story-card-topbar {
  position: absolute;
  inset: 0 0 auto;
  z-index: 5;
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: var(--story-card-topbar-height);
  border-bottom: 1px solid color-mix(in oklch, var(--seed-border) 46%, transparent);
  background:
    linear-gradient(135deg, color-mix(in oklch, var(--seed-highlight) 72%, transparent), transparent 46%),
    color-mix(in oklch, var(--seed-surface-raised) 58%, white 18%);
  padding: 0.68rem 0.95rem 0.6rem;
  -webkit-backdrop-filter: blur(18px) saturate(1.35);
  backdrop-filter: blur(18px) saturate(1.35);
  box-shadow: 0 12px 28px rgb(15 23 42 / 0.08);
}

.dark .story-card-topbar {
  background:
    linear-gradient(135deg, color-mix(in oklch, var(--seed-highlight) 54%, transparent), transparent 46%),
    color-mix(in oklch, var(--seed-surface-raised) 46%, black 20%);
  box-shadow: 0 12px 28px rgb(0 0 0 / 0.22);
}

.story-card-visual {
  --story-card-topbar-height: 2.75rem;
  border-bottom: 1px solid color-mix(in oklch, var(--seed-border) 42%, transparent);
}

.story-card-image-layer {
  box-sizing: border-box;
  padding-top: var(--story-card-topbar-height);
}

.story-card-image-track {
  backface-visibility: hidden;
  transform-origin: center top;
}

.story-card-image {
  display: block;
  min-height: 100%;
}

.story-card-body {
  position: relative;
  gap: 0.7rem;
  isolation: isolate;
  min-height: 9.65rem;
  overflow: hidden;
  color: rgb(15 23 42);
  background: transparent;
  box-shadow:
    0 -1px 0 color-mix(in oklch, white 68%, transparent) inset,
    0 1px 0 color-mix(in oklch, var(--seed-border) 38%, transparent) inset;
}

.story-card-body::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  -webkit-backdrop-filter: blur(10px) saturate(1.12);
  backdrop-filter: blur(10px) saturate(1.12);
  background:
    linear-gradient(135deg, oklch(100% 0 var(--seed-hue) / 0.38), transparent 48%),
    radial-gradient(circle at 100% 0%, color-mix(in oklch, var(--seed-ring) 38%, transparent) 0, transparent 42%),
    linear-gradient(
      180deg,
      oklch(99% 0.004 var(--seed-hue) / 0.78) 0%,
      oklch(96.8% 0.012 var(--seed-hue) / 0.7) 100%
    );
}

.dark .story-card-body {
  color: rgb(241 245 249);
  background: transparent;
  box-shadow:
    0 -1px 0 rgb(255 255 255 / 0.08) inset,
    0 1px 0 color-mix(in oklch, var(--seed-border) 44%, transparent) inset;
}

.dark .story-card-body::before {
  background:
    linear-gradient(135deg, oklch(88% 0.04 var(--seed-hue) / 0.1), transparent 48%),
    radial-gradient(circle at 100% 0%, color-mix(in oklch, var(--seed-ring) 42%, transparent) 0, transparent 48%),
    linear-gradient(
      180deg,
      oklch(22% 0.024 var(--seed-hue) / 0.82) 0%,
      oklch(16% 0.028 var(--seed-hue) / 0.86) 100%
    );
}

.story-card-body-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.story-card-body-image-track {
  min-height: 14rem;
  backface-visibility: hidden;
  transform-origin: center top;
}

.story-card-body-image {
  position: absolute;
  inset: -10%;
  background-position: center top;
  background-repeat: no-repeat;
  background-size: cover;
  filter: blur(7px) saturate(1.16) contrast(0.94);
  opacity: 0;
  transform: scale(1.05);
  transition: opacity 500ms ease;
}

.story-card-body-image-track.is-loaded .story-card-body-image {
  opacity: 0.18;
}

.dark .story-card-body-image-track.is-loaded .story-card-body-image {
  opacity: 0.24;
}

.story-source-link {
  display: inline-flex;
  min-width: 0;
  max-width: min(72%, 16rem);
  min-height: 1.35rem;
  align-items: center;
  gap: 0.32rem;
  color: var(--seed-author-text);
  font-weight: 700;
  line-height: 1.1;
  transition:
    color 180ms ease,
    opacity 180ms ease;
}

.story-source-link:hover,
.story-source-link:focus-visible {
  color: var(--seed-accent-strong);
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.dark .story-source-link {
  color: color-mix(in oklch, var(--seed-author-text) 90%, white);
}

.story-domain-chip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-source-icon {
  width: 0.85rem;
  height: 0.85rem;
  flex: 0 0 auto;
  opacity: 0.7;
}

.story-card-content {
  display: flex;
  position: relative;
  z-index: 1;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.9rem;
}

.story-card-title-link {
  display: block;
  min-width: 0;
}

.story-card-title {
  margin-bottom: 0;
  color: rgb(15 23 42);
  transition: color 180ms ease;
}

.story-card-title-link:hover .story-card-title,
.story-card-title-link:focus-visible .story-card-title {
  color: var(--seed-accent-strong);
}

.dark .story-card-title {
  color: rgb(241 245 249);
}

.dark .story-card-title-link:hover .story-card-title,
.dark .story-card-title-link:focus-visible .story-card-title {
  color: var(--seed-accent-strong);
}

.story-card-status-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: auto;
  border-top: 1px solid color-mix(in oklch, var(--seed-border) 38%, transparent);
  padding-top: 0.7rem;
}

.story-card-author,
.story-card-time {
  color: rgb(71 85 105);
  min-width: 0;
}

.story-card-author {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-card-author:hover,
.story-card-author:focus-visible {
  color: var(--seed-accent-strong);
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

.story-card-time {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.3rem;
  color: rgb(71 85 105);
  white-space: nowrap;
}

.dark .story-card-author,
.dark .story-card-time {
  color: rgb(203 213 225 / 0.82);
}

.story-card-stat-group {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 0.62rem;
  margin-top: auto;
}

.story-card-stat-separator {
  width: 1px;
  height: 1.15rem;
  flex: 0 0 auto;
  border-radius: 999px;
  background: color-mix(in oklch, var(--seed-border) 70%, transparent);
  opacity: 0.82;
}

.dark .story-card-stat-separator {
  background: color-mix(in oklch, var(--seed-border) 78%, transparent);
  opacity: 0.72;
}

.story-card-metric {
  display: inline-flex;
  min-width: 0;
  min-height: 1.45rem;
  align-items: center;
  justify-content: center;
  gap: 0.24rem;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  transition:
    color 180ms ease,
    opacity 180ms ease;
}

.story-card-metric svg {
  flex: 0 0 auto;
}

.story-card-tone-muted {
  color: rgb(71 85 105);
}

.dark .story-card-tone-muted {
  color: rgb(148 163 184);
}

.story-card-tone-points {
  color: rgb(146 64 14);
}

.dark .story-card-tone-points {
  color: rgb(252 211 77);
}

.story-card-tone-comments {
  color: rgb(185 28 28);
}

.dark .story-card-tone-comments {
  color: rgb(248 113 113);
}

.story-card-tone-active {
  color: rgb(4 120 87);
}

.dark .story-card-tone-active {
  color: rgb(110 231 183);
}

.story-card-metric-label {
  color: currentColor;
  font-size: 0.72rem;
  font-weight: 700;
  opacity: 0.68;
}

.story-card-metric-link:hover,
.story-card-metric-link:focus-visible {
  color: var(--seed-accent-strong);
  text-decoration: underline;
  text-decoration-thickness: 0.08em;
  text-underline-offset: 0.18em;
}

@media (hover: hover) and (pointer: fine) {
  .story-card:hover {
    border-color: var(--seed-border-strong);
    box-shadow:
      0 28px 64px var(--seed-shadow-strong),
      0 8px 24px rgb(15 23 42 / 0.075),
      0 1px 0 rgb(255 255 255 / 0.56) inset;
    transform: translateY(-3px);
    will-change: transform;
  }

  .story-card:hover .story-card-image-track,
  .story-card:hover .story-card-body-image-track {
    will-change: transform;
  }

  .dark .story-card:hover {
    box-shadow:
      0 30px 68px var(--seed-shadow-strong),
      0 8px 26px rgb(0 0 0 / 0.3),
      0 1px 0 rgb(255 255 255 / 0.1) inset;
  }
}

.story-card-image-track.scrolling,
.story-card-body-image-track.scrolling {
  transition-duration: 0ms;
  will-change: transform;
}

@media (pointer: coarse) {
  .story-card-topbar {
    -webkit-backdrop-filter: blur(14px) saturate(1.22);
    backdrop-filter: blur(14px) saturate(1.22);
  }

  .story-card-body::before {
    -webkit-backdrop-filter: blur(6px) saturate(1.06);
    backdrop-filter: blur(6px) saturate(1.06);
  }

  .story-card-body-image {
    filter: blur(5px) saturate(1.1) contrast(0.96);
  }
}

@media (prefers-reduced-motion: reduce) {
  .story-card,
  .story-card-image-track,
  .story-card-body-image-track,
  .story-card-body-image {
    transition-duration: 1ms !important;
  }

  .story-card:hover,
  .story-card:hover .story-card-image-track,
  .story-card:hover .story-card-body-image-track {
    transform: none !important;
  }
}

@media (max-width: 430px) {
  .story-card-status-row {
    gap: 0.5rem;
  }

  .story-card-author {
    flex: 1 1 auto;
  }

  .story-card-stat-group {
    gap: 0.42rem;
  }

  .story-card-metric {
    gap: 0.18rem;
  }

  .story-card-metric svg {
    width: 0.9rem;
    height: 0.9rem;
  }

  .story-card-metric-label {
    display: none;
  }
}

</style>
