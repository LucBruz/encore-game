<template>
  <div class="page">
    <header class="rv-header">
      <NuxtLink to="/" class="back">{{ $t('common.back') }}</NuxtLink>
      <h1 class="rv-title">{{ $t('review.pageTitle') }}</h1>
      <LangSwitch />
    </header>

    <GameReview :game-id="gameId" :default-player-id="lobby.localPlayerId" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GameReview from '~/components/review/GameReview.vue'
import { useLobbyStore } from '~/stores/lobbyStore'

/**
 * Page d'analyse autonome. L'analyse elle-meme vit dans GameReview, partage avec
 * l'ecran de fin de partie ; cette page existe pour avoir une adresse — rouvrir
 * ou partager une analyse apres avoir ferme l'onglet de la partie.
 */
const route = useRoute()
const lobby = useLobbyStore()
const gameId = computed(() => route.params.id as string)

// Identifiant du joueur local, lu dans le localStorage : cote client uniquement.
if (import.meta.client) lobby.init()
</script>

<style scoped>
.page {
  @apply min-h-screen mx-auto px-4 py-10 flex flex-col gap-6;
  max-width: 1120px;
  background: #0f0f13;
  color: #e8e8f0;
  font-family: 'Nunito', sans-serif;
}

.rv-header { @apply flex flex-col gap-1; }

.back {
  @apply text-xs font-bold uppercase tracking-wider;
  color: #8f8fa3;
}
.back:hover { color: #e8e8f0; }

.rv-title {
  @apply text-3xl font-black;
  background: linear-gradient(135deg, #f5d742, #f58a35);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
</style>
