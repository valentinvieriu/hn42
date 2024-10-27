import { ref, computed } from 'vue';
import { useFetch } from 'nuxt/app';
import { Story } from '~/types';

export const useStories = (endpoint: 'new' | 'show' | 'top') => {
  const hoveredStory = ref<string | null>(null);
  const { data, error, pending } = useFetch<Story[]>(`/api/${endpoint}`);
  
  const stories = computed(() => data.value || []);
  const isLoading = computed(() => pending.value);
  const fetchError = computed(() => error.value?.message || null);
  
  return {
    stories,
    hoveredStory,
    isLoading,
    error: fetchError,
  };
};
