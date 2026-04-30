import { ref } from 'vue';

export const useDebounce = (fn: Function, delay: number) => {
  const timer = ref<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFunction = (...args: any[]) => {
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      fn(...args);
    }, delay);
  };

  return debouncedFunction;
};
