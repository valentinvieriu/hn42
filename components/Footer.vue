<template>
  <footer :class="`py-12 px-4 mt-auto ${
    colorMode.value === 'dark'
      ? 'bg-slate-900 border-t border-slate-800'
      : 'bg-slate-50 border-t border-slate-200'
  }`">
    <div class="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center">
      <div class="mb-8 md:mb-0">
        <h2 class="text-2xl font-bold mb-2">
          <span :class="colorMode.value === 'dark' ? 'text-slate-100' : 'text-slate-900'">HN</span>
          <span class="text-orange-500">42</span>
        </h2>
        <p :class="colorMode.value === 'dark' ? 'text-slate-400' : 'text-slate-600'">
          © 2024 HN42. All rights reserved.
        </p>
      </div>
      <nav>
        <ul class="flex flex-wrap justify-center gap-8">
          <li v-for="link in footerLinks" :key="link.name">
            <NuxtLink
              :to="link.to"
              :class="`text-sm font-medium transition-colors ${
                colorMode.value === 'dark'
                  ? 'text-slate-400 hover:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900'
              }`"
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
const colorMode = useColorMode();
const footerLinks = [
  { name: 'Privacy', to: '/privacy' },
  { name: 'Terms', to: '/terms' },
];
</script>
