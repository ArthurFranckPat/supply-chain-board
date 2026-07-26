import { defineConfig } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react({
      // On restreint aux fichiers JS/TS : si on laisse 'inertia-react/**', le plugin
      // fait aussi passer les .css par Babel, qui s'étouffe sur ':root {' (vu comme
      // du JSX). Les feuilles de style sont gérées par Vite lui-même.
      include: [/inertia-react\/.*\.(t|j)sx?$/],
      babel: {
        // React 19 : Compiler natif, pas de target 18 ni de runtime polyfill.
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
    adonisjs({
      /**
       * Point d'entrée de l'app (React/Inertia).
       */
      entrypoints: ['inertia-react/app.tsx'],

      /**
       * Recharge le navigateur quand le shell Edge ou une page front change.
       */
      reload: ['resources/views/**/*.edge', 'inertia-react/pages/**/*.tsx'],
    }),
  ],
  server: {
    watch: {
      // Les worktrees d'agents vivent sous .claude/worktrees/ (~174k fichiers,
      // node_modules compris). Sans exclusion le watcher dépasse
      // kern.maxfilesperproc et le dev server meurt en EMFILE.
      ignored: ['**/.claude/**', '**/tmp/**', '**/build/**'],
    },
  },
  resolve: {
    alias: [
      { find: '@r', replacement: fileURLToPath(new URL('./inertia-react', import.meta.url)) },
    ],
  },
})
