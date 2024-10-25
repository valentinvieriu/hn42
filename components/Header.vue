<template>
  <nav class="sticky top-0 z-50 backdrop-blur-lg bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
    <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <NuxtLink to="/top" class="flex items-center space-x-2">
        <h1 class="text-2xl font-bold tracking-tight">
          <span class="text-slate-900 dark:text-slate-100">HN</span>
          <span class="text-orange-500">42</span>
        </h1>
      </NuxtLink>
      <div class="flex items-center gap-6">
        <NuxtLink 
          v-for="link in ['Top', 'New', 'Show']" 
          :key="link"
          :to="`/${link.toLowerCase()}`"
          class="text-sm font-medium transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
        >
          {{ link }}
        </NuxtLink>
        <button 
          @click="toggleDarkMode"
          @keydown.enter="toggleDarkMode"
          aria-label="Toggle dark mode"
          tabindex="0"
          class="p-2 rounded-full transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <LucideSun v-if="colorMode.preference === 'dark'" class="w-5 h-5" />
          <LucideMoon v-else class="w-5 h-5" />
        </button>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
const colorMode = useColorMode();

const toggleDarkMode = () => {
  colorMode.preference = colorMode.preference === 'dark' ? 'light' : 'dark';
};
</script>
