import { defineConfig } from 'vite'
import adonisjs from '@adonisjs/vite/client'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// React 19 : Compiler natif, pas de target 18 ni de runtime polyfill.
// Depuis @vitejs/plugin-react 6 (Vite 8), le plugin ne porte plus Babel :
// le compilateur passe par @rolldown/plugin-babel. Filtre restreint aux
// fichiers JS/TS du front, comme l'ancien `include` — Babel s'étouffe sur
// les .css (':root {' lu comme du JSX).
const reactCompilerBase = reactCompilerPreset()
const reactCompiler = {
  ...reactCompilerBase,
  rolldown: {
    ...reactCompilerBase.rolldown,
    filter: {
      ...reactCompilerBase.rolldown?.filter,
      id: { include: /inertia-react\/.*\.(t|j)sx?$/ },
    },
  },
}

export default defineConfig({
  // `@adonisjs/vite` démarre un serveur Vite aussi sous `node ace test`. Le hash
  // du cache de deps inclut NODE_ENV : un run de test (NODE_ENV=test) juge le
  // cache du serveur de dev périmé, SUPPRIME `deps/` et meurt avant d'avoir
  // fini de le reconstruire. Le serveur de dev sert alors des deps disparues →
  // « 504 (Outdated Optimize Dep) ». Un cache par environnement : chacun garde
  // le sien.
  cacheDir: process.env.NODE_ENV === 'test' ? 'node_modules/.vite-test' : 'node_modules/.vite',
  plugins: [
    react({ include: [/inertia-react\/.*\.(t|j)sx?$/] }),
    babel({ presets: [reactCompiler] }),
    tailwindcss(),
    adonisjs({
      /**
       * Point d'entrée de l'app (React/Inertia).
       */
      entryPoints: ['inertia-react/app.tsx'],

      /**
       * Recharge le navigateur quand le shell Edge ou une page front change.
       */
      reload: ['resources/views/**/*.edge', 'inertia-react/pages/**/*.tsx'],
    }),
  ],
  optimizeDeps: {
    // `app.tsx` charge les pages via `import.meta.glob` lazy. Le scanner de
    // deps (esbuild) ne suit pas les globs : sans ces entrées il ne voit que
    // `app.tsx` et rate toute dep qui n'existe que dans une page (react-table,
    // pragmatic-drag-and-drop, react-markdown, luxon…). Elle est alors
    // découverte à la première navigation → re-optimize à chaud → nouveau
    // hash `?v=` → les chunks déjà chargés répondent
    // « 504 (Outdated Optimize Dep) ». On force la découverte au démarrage.
    entries: ['inertia-react/app.tsx', 'inertia-react/pages/**/*.tsx'],
  },
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
