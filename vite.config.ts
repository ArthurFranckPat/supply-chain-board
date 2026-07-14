import { defineConfig } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import solid from 'vite-plugin-solid'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    // CRITICAL — double runtime Solid + React : il faut que Solid IGNORE les
    // fichiers React, sinon il les transforme en premier (enforce: 'pre') et
    // @vitejs/plugin-react plante ensuite ("can't detect preamble"). On utilise
    // une regex plutôt qu'un glob : vite passe l'id ABSOLU au filtre, et les
    // globs de @rollup/pluginutils ne matchent que des chemins relatifs → le
    // glob 'inertia-react/**' ne matchait jamais l'id absolu et Solid bouffait
    // tout. La regex matche le segment /inertia-react/ où qu'il soit.
    solid({
      exclude: /[/\\]inertia-react[/\\]/,
    }),
    react({
      // On restreint aux fichiers JS/TS : si on laisse 'inertia-react/**', le plugin
      // fait aussi passer les .css par Babel, qui s'étouffe sur ':root {' (vu comme
      // du JSX). Les feuilles de style sont gérées par Vite lui-même.
      include: [/inertia-react\/.*\.(t|j)sx?$/],
      babel: {
        plugins: [['babel-plugin-react-compiler', { target: '18' }]],
      },
    }),
    tailwindcss(),
    adonisjs({
      /**
       * Points d'entrée de l'app (SolidJS/Inertia et React/Inertia).
       */
      entrypoints: ['inertia/app/app.tsx', 'inertia-react/app.tsx'],

      /**
       * Recharge le navigateur quand le shell Edge ou une page front change.
       */
      reload: ['resources/views/**/*.edge', 'inertia/pages/**/*.tsx', 'inertia-react/pages/**/*.tsx'],
    }),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./inertia', import.meta.url)) },
      { find: '@r', replacement: fileURLToPath(new URL('./inertia-react', import.meta.url)) },
      // carbon-react n'a NI `main` NI `exports` dans son package.json → l'import bare
      // `carbon-react` ne résout pas tout seul sous Vite. On définit DEUX alias :
      //  - entrée exacte `carbon-react` → esm/index.js (pour `from 'carbon-react'`)
      //  - entrée préfixe `carbon-react/(.*)` → node_modules/carbon-react/$1
      //    (pour `from 'carbon-react/esm/components/flat-table'`)
      // L'ancien alias string pointait sur esm/index.js : il matchait aussi les
      // sous-chemins et donnait `esm/index.js/esm/components/...` → introuvable.
      // L'ordre compte : l'exacte doit venir avant la préfixe.
      {
        find: /^carbon-react$/,
        replacement: fileURLToPath(new URL('./node_modules/carbon-react/esm/index.js', import.meta.url)),
      },
      {
        find: /^carbon-react\/(.*)$/,
        replacement: fileURLToPath(new URL('./node_modules/carbon-react/$1', import.meta.url)),
      },
    ],
  },
})
