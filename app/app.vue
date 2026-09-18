<template>
  <NuxtPage :transition="{ name: 'page-slide', mode: 'out-in' }" />
</template>

<script setup lang="ts">
// Declare la langue affichee sur <html lang> : lecteurs d'ecran et moteurs de
// recherche lisent la page dans la bonne langue, et elle suit la bascule FR/EN.
const { locale } = useI18n()
useHead({ htmlAttrs: { lang: locale } })
</script>

<style>
.page-slide-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.page-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.page-slide-enter-from {
  opacity: 0;
  transform: translateY(14px);
}
.page-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>