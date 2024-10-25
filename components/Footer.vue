<template>
  <footer class="py-12 px-4 mt-auto bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
      <div class="mb-8 md:mb-0">
        <h2 class="text-2xl font-bold mb-2">
          <span class="text-slate-900 dark:text-slate-100">HN</span>
          <span class="text-orange-500">42</span>
        </h2>
        <p class="text-slate-600 dark:text-slate-400">
          © 2024 HN42. All rights reserved.
        </p>
      </div>
      <nav>
        <ul class="flex flex-wrap justify-center gap-8">
          <li v-for="link in footerLinks" :key="link.name">
            <NuxtLink
              :to="link.to"
              class="text-sm font-medium transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              tabindex="0"
              :aria-label="link.name"
            >
              {{ link.name }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
    </div>
  </footer>
</template>

<script setup lang="ts">
const footerLinks = [
  { name: 'Privacy', to: '/privacy' },
  { name: 'Terms', to: '/terms' },
];
</script>
