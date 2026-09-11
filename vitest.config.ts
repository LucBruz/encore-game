import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
    resolve: {
        alias: {
            // Memes alias que Nuxt : ~~ = racine du projet, ~ = app/
            '~~': root,
            '@@': root,
            '~': fileURLToPath(new URL('./app', import.meta.url)),
            '@': fileURLToPath(new URL('./app', import.meta.url)),
        },
    },
    test: {
        environment: 'node',
        include: ['engine/**/*.spec.ts', 'bots/**/*.spec.ts', 'app/**/*.spec.ts'],
    },
})
