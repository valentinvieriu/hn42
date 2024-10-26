import { ref, onMounted, onUnmounted } from 'vue';

export const useScroll = () => {
  const isScrolling = ref(false);
  let scrollTimeout: ReturnType<typeof setTimeout>;

  const handleScroll = () => {
    isScrolling.value = true;
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      isScrolling.value = false;
    }, 200); // Adjust timeout as needed
  };

  onMounted(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
  });

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll);
    clearTimeout(scrollTimeout);
  });

  return { isScrolling };
};
