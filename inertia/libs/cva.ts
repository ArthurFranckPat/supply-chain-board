import { defineConfig } from 'cva'
import { twMerge } from 'tailwind-merge'

/**
 * Helper CVA natif shadcn-solid (source : registry/lib/cva). `cx` fusionne les
 * classes via twMerge ; `cva` définit les variantes. Les composants ui/* natifs
 * importent depuis ici.
 */
export const { cva, cx, compose } = defineConfig({
  hooks: {
    onComplete: (className) => twMerge(className),
  },
})
