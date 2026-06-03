export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Enregistre tous les composants par leur nom de fichier sans préfixe de dossier
  // (ex. EndGameOverlay, LaunchOverlay au lieu de AnimationsEndGameOverlay)
  components: [{ path: '~/components', pathPrefix: false }],
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/webp', href: '/jeu-de-dés.webp' }
      ]
    }
  },
  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@nuxtjs/supabase',
  ],
  supabase: {
    redirect: false,
  },
  typescript: {
    strict: false
  }
})