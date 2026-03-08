<template>
  <div class="flex items-center gap-2">
    <span class="text-xs font-bold uppercase tracking-widest text-gray-500">?/✕ =</span>
    <div class="flex gap-1">
      <div
        v-for="i in total"
        :key="i"
        class="joker"
        :class="{ 'joker--used': i <= used }"
        @click="i > used && $emit('use')"
      >
        !
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  total: number
  used: number
}>()

defineEmits<{
  use: []
}>()
</script>

<style scoped>
.joker {
  @apply w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-all duration-150 select-none;
  background: #23232f;
  border: 2px solid #2e2e3e;
  color: #e8e8f0;
}

.joker:hover {
  border-color: #f5d742;
  color: #f5d742;
}

.joker--used {
  @apply opacity-25 line-through cursor-default;
}

.joker--used:hover {
  border-color: #2e2e3e;
  color: #e8e8f0;
}
</style>