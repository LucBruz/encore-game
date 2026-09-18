import fr from './locales/fr.json'
import en from './locales/en.json'

/**
 * Options de vue-i18n.
 *
 * Les deux langues sont embarquees ici plutot que chargees a la demande : quelques
 * Ko chacune, et le chargement differe echouait en developpement (le fichier de
 * traduction repondait 404 cote navigateur, qui affichait alors les cles brutes
 * apres l'hydratation, alors que le rendu serveur etait juste).
 *
 * Les longs paragraphes de la page des agents contiennent un peu de HTML (gras,
 * code en ligne) et sont rendus par `v-html` : ils sont ecrits par nous dans ces
 * fichiers, jamais saisis par un visiteur, d'ou l'autorisation du HTML.
 */
export default defineI18nConfig(() => ({
  legacy: false,
  fallbackLocale: 'en',
  messages: { fr, en },
  strictMessage: false,
  warnHtmlMessage: false,
}))
