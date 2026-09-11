export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Enregistre tous les composants par leur nom de fichier sans préfixe de dossier
  // (ex. EndGameOverlay, LaunchOverlay au lieu de AnimationsEndGameOverlay)
  components: [{ path: '~/components', pathPrefix: false }],
  // Fond de page global. Charge ici (et pas dans un composant) pour atterrir
  // dans le bundle d'entree, donc avant tout chunk de page.
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      meta: [
        // Annonce le theme sombre des le HTML servi : aucune feuille de style
        // n'est encore resolue a ce moment-la, donc c'est la seule chose qui
        // empeche un flash blanc au tout premier rendu.
        { name: 'color-scheme', content: 'dark' },
      ],
      link: [
        { rel: 'icon', type: 'image/webp', href: '/jeu-de-dés.webp' },
        // Les deux familles sont referencees dans tout le CSS du jeu mais
        // n'etaient chargees nulle part : le site tombait sur les polices systeme.
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap',
        },
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