import { ref, computed } from 'vue';
import { useFetch } from 'nuxt/app';

interface Story {
  objectID: string;
  title: string;
  author: string;
  created_at: string;
  points: number;
  num_comments: number;
  url: string;
  screenshotUrl: string;
}

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
