import { configApp } from '@adonisjs/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    // `tmp/` est un bac à sable gitignoré (scripts de sonde X3 jetables) :
    // le linter n'a rien à y dire.
    ignores: ['tmp/**'],
  },
  ...configApp(),
  {
    rules: {
      /**
       * `x != null` teste « ni null ni undefined » en une comparaison — c'est
       * l'idiome utilisé partout dans le domaine (payloads X3 où l'absence
       * arrive dans les deux formes). Le passer en `!==` changerait le sens.
       * Toutes les autres comparaisons restent strictes.
       */
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['inertia-react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      /**
       * Le front suit la convention React/shadcn (kebab-case) — le CLI shadcn
       * génère lui-même des fichiers kebab. La règle snake_case du preset
       * Adonis ne vaut que pour le backend.
       */
      '@unicorn/filename-case': 'off',
      // Vraie classe de bugs : un hook sous condition casse l'ordre des hooks.
      'react-hooks/rules-of-hooks': 'error',
      // Avertissement : les dépendances volontairement partielles sont
      // fréquentes ici (resync sur une seule clé), et déjà annotées.
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
