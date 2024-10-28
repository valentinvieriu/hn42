import { ref, computed } from 'vue';
import { useFetch } from 'nuxt/app';
import type { Ref } from 'vue';
import type { Story } from '~/types';

export const useStories = (endpoint: 'new' | 'show' | 'top') => {
  const hoveredStory: Ref<string | null> = ref(null);
  const { data, error, pending } = useFetch<Story[]>(`/api/${endpoint}`);
  
  const stories = computed(() => data.value || [] as Story[]);
  const isLoading = computed(() => pending.value);
  const fetchError = computed(() => error.value?.message || null);
  
  return {
    stories,
    hoveredStory,
    isLoading,
    error: fetchError,
  };
};
