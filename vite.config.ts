import { defineConfig } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    adonisjs({
      /**
       * Point d'entrée unique de l'app SolidJS/Inertia.
       */
      entrypoints: ['inertia/app/app.tsx'],

      /**
       * Recharge le navigateur quand le shell Edge ou une page Solid change.
       */
      reload: ['resources/views/**/*.edge', 'inertia/pages/**/*.tsx'],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./inertia', import.meta.url)),
    },
  },
})
