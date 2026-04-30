import { computed, ref, watch } from 'vue';
import { useFetch } from 'nuxt/app';
import type { Ref } from 'vue';
import type { Story } from '#shared/types';

type StoryEndpoint = 'best' | 'new' | 'show' | 'top';

const FEED_CACHE_PREFIX = 'hn42:stories:';
const FEED_CACHE_MAX_AGE = 30 * 60 * 1000;

type FeedCachePayload = {
  savedAt: number;
  stories: Story[];
};

const memoryCache = new Map<StoryEndpoint, Story[]>();

const removeCachedStories = (endpoint: StoryEndpoint) => {
  try {
    window.sessionStorage.removeItem(`${FEED_CACHE_PREFIX}${endpoint}`);
  } catch {
    // Ignore storage access failures; they only affect the optional stale cache.
  }
};

const readCachedStories = (endpoint: StoryEndpoint): Story[] => {
  if (!import.meta.client) {
    return [];
  }

  const memoryStories = memoryCache.get(endpoint);
  if (memoryStories?.length) {
    return memoryStories;
  }

  try {
    const rawPayload = window.sessionStorage.getItem(`${FEED_CACHE_PREFIX}${endpoint}`);
    if (!rawPayload) {
      return [];
    }

    const payload = JSON.parse(rawPayload) as FeedCachePayload;
    if (
      !Array.isArray(payload.stories)
      || typeof payload.savedAt !== 'number'
      || Date.now() - payload.savedAt > FEED_CACHE_MAX_AGE
    ) {
      removeCachedStories(endpoint);
      return [];
    }

    memoryCache.set(endpoint, payload.stories);
    return payload.stories;
  } catch {
    removeCachedStories(endpoint);
    return [];
  }
};

const rememberStories = (endpoint: StoryEndpoint, stories: Story[]) => {
  if (!import.meta.client || stories.length === 0) {
    return;
  }

  memoryCache.set(endpoint, stories);

  try {
    window.sessionStorage.setItem(
      `${FEED_CACHE_PREFIX}${endpoint}`,
      JSON.stringify({
        savedAt: Date.now(),
        stories,
      } satisfies FeedCachePayload),
    );
  } catch {
    // Storage can be unavailable in private browsing or constrained WebViews.
  }
};

export const useStories = (endpoint: StoryEndpoint) => {
  const hoveredStory: Ref<string | null> = ref(null);
  const cachedStories = ref<Story[]>(readCachedStories(endpoint));
  const { data, error, pending } = useFetch<Story[]>(`/api/${endpoint}`, {
    key: `stories:${endpoint}`,
    lazy: true,
    default: () => cachedStories.value,
  });

  watch(
    data,
    (currentStories) => {
      if (currentStories?.length) {
        cachedStories.value = currentStories;
        rememberStories(endpoint, currentStories);
      }
    },
    { immediate: true },
  );

  const stories = computed(() => data.value ?? cachedStories.value);
  const hasStories = computed(() => stories.value.length > 0);
  const isLoading = computed(() => pending.value && !hasStories.value);
  const isRefreshing = computed(() => pending.value && hasStories.value);
  const fetchError = computed(() => (!hasStories.value ? error.value?.message || null : null));
  
  return {
    stories,
    hoveredStory,
    isLoading,
    isRefreshing,
    error: fetchError,
  };
};
