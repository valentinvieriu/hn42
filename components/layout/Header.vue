<template>
  <nav
    class="site-header sticky top-0 z-50 border-b backdrop-blur-lg"
    :style="currentFeed ? getNavStyle(currentFeed) : undefined"
  >
    <div class="max-w-7xl mx-auto flex h-14 items-center justify-between gap-3 px-3 sm:h-16 sm:gap-5 sm:px-5 lg:px-6">
      <NuxtLink to="/top" class="flex shrink-0 items-center space-x-2">
        <h1 class="mb-0 text-[1.3rem] font-display font-semibold leading-none sm:text-2xl">
          <span class="text-slate-900 dark:text-slate-100">HN</span>
          <span class="text-orange-500">42</span>
        </h1>
      </NuxtLink>
      <div class="flex min-w-0 flex-1 items-center justify-end">
        <div
          ref="feedNavRef"
          class="feed-nav-scroll flex w-full min-w-0 items-center justify-end gap-3 overflow-x-auto sm:w-auto sm:gap-6"
          aria-label="Story feeds"
        >
          <NuxtLink
            v-for="link in feedThemeList"
            :key="link.key"
            :to="link.path"
            class="feed-nav-link inline-flex shrink-0 items-center py-1 font-medium transition-colors duration-200"
            :class="{ 'feed-nav-link-active': currentFeed === link.key }"
            :style="getNavStyle(link.key)"
            :aria-current="currentFeed === link.key ? 'page' : undefined"
          >
            <span>{{ link.label }}</span>
          </NuxtLink>
        </div>
      </div>
      <button
        type="button"
        class="theme-toggle ml-1 shrink-0 sm:ml-2"
        :aria-label="colorMode.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        :title="colorMode.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggleColorMode"
      >
        <LucideSun v-if="colorMode.value === 'dark'" class="h-4 w-4" aria-hidden="true" />
        <LucideMoon v-else class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { feedThemeList, getFeedThemeStyle, isFeedEndpoint } from '~/composables/useFeedTheme';
import type { FeedEndpoint } from '~/composables/useFeedTheme';

const colorMode = useColorMode();
const route = useRoute();
const feedNavRef = ref<HTMLElement | null>(null);

const colorModeName = computed(() => colorMode.value === 'dark' ? 'dark' : 'light');
const currentFeed = computed(() => {
  const feedCandidate = route.path.split('/')[1];
  return isFeedEndpoint(feedCandidate) ? feedCandidate : null;
});

const getNavStyle = (feed: FeedEndpoint) => {
  return getFeedThemeStyle(feed, colorModeName.value);
};

const toggleColorMode = () => {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
};

watch(
  currentFeed,
  () => {
    nextTick(() => {
      const activeLink = feedNavRef.value?.querySelector<HTMLElement>('[aria-current="page"]');
      activeLink?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  },
  { immediate: true },
);
</script>

<style scoped>
.site-header {
  border-color: var(--feed-border, rgb(226 232 240 / 1));
  background:
    radial-gradient(circle at 18% -70%, var(--feed-glow-a, transparent) 0, transparent 19rem),
    radial-gradient(circle at 78% -90%, var(--feed-glow-b, transparent) 0, transparent 21rem),
    rgb(255 255 255 / 0.9);
}

.dark .site-header {
  border-color: var(--feed-border, rgb(30 41 59 / 1));
  background:
    radial-gradient(circle at 18% -70%, var(--feed-glow-a, transparent) 0, transparent 19rem),
    radial-gradient(circle at 78% -90%, var(--feed-glow-b, transparent) 0, transparent 21rem),
    rgb(15 23 42 / 0.9);
}

.feed-nav-scroll {
  scrollbar-width: none;
  max-width: 100%;
}

.feed-nav-scroll::-webkit-scrollbar {
  display: none;
}

.feed-nav-link {
  font-family: var(--font-display);
  font-size: 0.765rem;
  line-height: 1.2;
  color: rgb(71 85 105);
}

.dark .feed-nav-link {
  color: rgb(203 213 225);
}

.feed-nav-link:hover {
  color: var(--feed-accent-strong);
}

.feed-nav-link-active,
.dark .feed-nav-link-active {
  font-weight: 700;
  color: var(--feed-accent-strong);
}

.feed-nav-link-active:hover,
.dark .feed-nav-link-active:hover {
  color: var(--feed-accent-strong);
}

.theme-toggle {
  display: inline-flex;
  min-height: 1.875rem;
  min-width: 1.875rem;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(226 232 240 / 0.56);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.22);
  color: rgb(71 85 105 / 0.76);
  opacity: 0.72;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease,
    opacity 180ms ease;
}

.theme-toggle:hover,
.theme-toggle:focus-visible {
  border-color: rgb(203 213 225 / 0.76);
  background: rgb(255 255 255 / 0.46);
  color: rgb(15 23 42);
  opacity: 0.96;
}

.theme-toggle:focus-visible {
  outline: 2px solid rgb(100 116 139);
  outline-offset: 2px;
}

.dark .theme-toggle {
  border-color: rgb(71 85 105 / 0.5);
  background: rgb(15 23 42 / 0.22);
  color: rgb(203 213 225 / 0.74);
}

.dark .theme-toggle:hover,
.dark .theme-toggle:focus-visible {
  border-color: rgb(100 116 139 / 0.72);
  background: rgb(15 23 42 / 0.42);
  color: rgb(248 250 252);
}

@media (min-width: 640px) {
  .feed-nav-link {
    font-size: 0.875rem;
  }

  .theme-toggle {
    min-height: 2rem;
    min-width: 2rem;
  }
}
</style>
