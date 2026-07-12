<template>
  <div class="min-h-screen font-sans bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100 safe-area-container">
    <NuxtLoadingIndicator />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<style>
.safe-area-container {
  /* Handle bottom safe area */
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
