<template>
  <ColorScheme>
    <div class="min-h-screen font-inter bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 safe-area-container">
      <NuxtLoadingIndicator />
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </div>
  </ColorScheme>
</template>

<script setup lang="ts">
</script>

<style>
.safe-area-container {
  /* Handle bottom safe area */
  padding-bottom: env(safe-area-inset-bottom);
}
</style>

