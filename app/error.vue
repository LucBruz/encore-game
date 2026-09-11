<script setup lang="ts">
import type { NuxtError } from '#app'

// La page d'erreur par defaut de Nuxt peint son propre fond, indexe sur
// `prefers-color-scheme` : elle restait donc blanche sur un navigateur clair,
// meme une fois la racine peinte. D'ou cette version, aux memes jetons que le
// reste du jeu.
defineProps<{ error: NuxtError }>()

const handleBack = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="page">
    <div class="card">
      <p class="code">{{ error?.statusCode || 500 }}</p>
      <h1 class="title">
        {{ error?.statusCode === 404 ? 'Page introuvable' : 'Quelque chose a casse' }}
      </h1>
      <p class="message">
        {{
          error?.statusCode === 404
            ? "Cette adresse ne correspond a aucune page du jeu."
            : "Une erreur inattendue s'est produite. Reessayez depuis l'accueil."
        }}
      </p>
      <p v-if="error?.message && error.statusCode !== 404" class="detail">{{ error.message }}</p>
      <button class="btn" @click="handleBack">Retour a l'accueil</button>
    </div>
  </div>
</template>

<style scoped>
.page {
  @apply min-h-screen flex items-center justify-center px-4 py-12;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.card {
  @apply flex flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center;
  max-width: 520px;
  background: #1a1a24;
  border: 1px solid #2e2e3e;
}

.code {
  @apply text-sm font-bold tracking-widest;
  color: #6e6e88;
  font-family: 'Space Mono', monospace;
}

.title {
  @apply text-3xl font-black;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.message {
  @apply text-sm leading-relaxed;
  color: #a0a0b8;
}

.detail {
  @apply text-xs rounded-lg px-3 py-2 mt-1 w-full text-left;
  background: #23232f;
  color: #6e6e88;
  font-family: 'Space Mono', monospace;
  overflow-wrap: anywhere;
}

.btn {
  @apply mt-3 rounded-xl px-5 py-2.5 text-sm font-black transition-transform;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  color: #0f0f13;
}

.btn:hover { transform: translateY(-1px); }
</style>
