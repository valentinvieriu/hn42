import { ref, onMounted, onUnmounted } from 'vue';

export const useScroll = () => {
  const isScrolling = ref(false);
  let scrollTimeout: ReturnType<typeof setTimeout>;
  let ticking = false;

  const handleScroll = () => {
    isScrolling.value = true;
    clearTimeout(scrollTimeout);

    if (!ticking) {
      window.requestAnimationFrame(() => {
        // Perform any required updates here
        ticking = false;
      });
      ticking = true;
    }

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
