import { computed, shallowRef, watch } from 'vue';
import { onNuxtReady, useFetch, useNuxtApp } from 'nuxt/app';
import type { Story } from '#shared/types';
import type { FeedEndpoint } from './useFeedTheme';

const FEED_CACHE_PREFIX = 'hn42:stories:';
const FEED_CACHE_MAX_AGE = 30 * 60 * 1000;

type FeedCachePayload = {
  savedAt: number;
  stories: Story[];
};

const memoryCache = new Map<FeedEndpoint, Story[]>();
const pendingStoragePayloads = new Map<FeedEndpoint, FeedCachePayload>();
const scheduledStorageWrites = new Set<FeedEndpoint>();

type IdleCapableWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
};

const removeCachedStories = (endpoint: FeedEndpoint) => {
  try {
    window.sessionStorage.removeItem(`${FEED_CACHE_PREFIX}${endpoint}`);
  } catch {
    // Ignore storage access failures; they only affect the optional stale cache.
  }
};

const readCachedStories = (endpoint: FeedEndpoint): Story[] => {
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

const flushStoredStories = (endpoint: FeedEndpoint) => {
  scheduledStorageWrites.delete(endpoint);
  const payload = pendingStoragePayloads.get(endpoint);
  pendingStoragePayloads.delete(endpoint);

  if (!payload) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      `${FEED_CACHE_PREFIX}${endpoint}`,
      JSON.stringify(payload),
    );
  } catch {
    // Storage can be unavailable in private browsing or constrained WebViews.
  }
};

const scheduleStoredStories = (endpoint: FeedEndpoint, stories: Story[]) => {
  pendingStoragePayloads.set(endpoint, {
    savedAt: Date.now(),
    stories,
  });

  if (scheduledStorageWrites.has(endpoint)) {
    return;
  }

  scheduledStorageWrites.add(endpoint);
  const flush = () => flushStoredStories(endpoint);
  const idleWindow = window as IdleCapableWindow;

  if (typeof idleWindow.requestIdleCallback === 'function') {
    idleWindow.requestIdleCallback(flush, { timeout: 2000 });
    return;
  }

  window.setTimeout(flush, 0);
};

const rememberStories = (
  endpoint: FeedEndpoint,
  stories: Story[],
  persist = true,
) => {
  if (!import.meta.client || stories.length === 0) {
    return;
  }

  memoryCache.set(endpoint, stories);

  if (persist) {
    scheduleStoredStories(endpoint, stories);
  }
};

export const useStories = (endpoint: FeedEndpoint) => {
  const nuxtApp = useNuxtApp();
  const cachedStories = shallowRef<Story[]>(
    import.meta.client && !nuxtApp.isHydrating ? readCachedStories(endpoint) : [],
  );

  if (import.meta.client && nuxtApp.isHydrating) {
    onNuxtReady(() => {
      const currentStories = memoryCache.get(endpoint);

      if (currentStories?.length) {
        scheduleStoredStories(endpoint, currentStories);
      }
    });
  }

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
        rememberStories(endpoint, currentStories, !nuxtApp.isHydrating);
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
    isLoading,
    isRefreshing,
    error: fetchError,
  };
};
