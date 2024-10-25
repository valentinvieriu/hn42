<template>
  <div :class="`min-h-screen font-inter ${colorMode.value === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode();
</script>

<style>
body {
  font-family: 'Inter', sans-serif;
}
</style>
