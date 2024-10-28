import { computed } from 'vue';

export const useStoryCategories = (points: number, commentCount: number) => {
  return computed(() => ({
    color: points < 100 && commentCount < 50
      ? 'text-gray-500'
      : points >= 100 && commentCount < 50
      ? 'text-yellow-600'
      : points < 100 && commentCount >= 50
      ? 'text-red-600'
      : 'text-green-600'
  }));
};
