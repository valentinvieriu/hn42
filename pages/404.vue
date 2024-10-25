<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-500 dark:bg-gray-900 text-gray-800 dark:text-white">
    <div class="text-center">
      <h1 class="text-6xl font-bold mb-4">404</h1>
      <p class="text-2xl mb-8">Oops! Page not found.</p>
      <NuxtLink
        to="/"
        class="bg-natural-wood text-white px-6 py-3 rounded-lg shadow-md hover:bg-opacity-90 transition-all"
      >
        Go Home
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
// No additional script needed
</script>
