<template>
  <ColorScheme>
    <div class="min-h-screen font-inter bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 safe-area-container">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
  </ColorScheme>
</template>

<script setup lang="ts">
// Optional: Use ColorScheme for better initialization
</script>

<style>
body {
  font-family: 'Inter', sans-serif;
}

.safe-area-container {
  /* Handle bottom safe area */
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
