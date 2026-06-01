<template>
  <div class="flex items-center gap-1">
    <div
      v-for="i in total"
      :key="i"
      class="joker"
      :class="{ 'joker--used': i <= used }"
    >
      !
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  total: number
  used: number
}>()
</script>

<style scoped>
.joker {
  @apply w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none;
  background: #23232f;
  border: 2px solid #2e2e3e;
  color: #e8e8f0;
}

.joker--used {
  @apply opacity-25 line-through;
}
</style>