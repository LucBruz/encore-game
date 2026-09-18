<template>
  <div class="lang" role="group" :aria-label="$t('lang.aria')">
    <button
      v-for="l in locales"
      :key="l.code"
      class="lang__btn"
      :class="{ 'lang__btn--on': locale === l.code }"
      type="button"
      :aria-pressed="locale === l.code"
      @click="setLocale(l.code)"
    >
      {{ l.code.toUpperCase() }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Bascule de langue. Le choix est garde dans un cookie (`encore_lang`) et les
 * URL ne changent pas : un lien de partie deja envoye reste valable quelle que
 * soit la langue de celui qui l'ouvre.
 */
const { locale, locales, setLocale } = useI18n()
</script>

<style scoped>
.lang {
  @apply inline-flex items-center rounded-full overflow-hidden;
  border: 1px solid #2e2e3e;
  background: #1a1a24;
}

.lang__btn {
  @apply px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors;
  font-family: 'Space Mono', monospace;
  background: transparent;
  border: none;
  color: #8f8fa3;
  letter-spacing: 0.06em;
}

.lang__btn:hover { color: #e8e8f0; }

.lang__btn--on {
  background: #f5d742;
  color: #0f0f13;
}
</style>
