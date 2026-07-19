import { defineConfig } from 'cva'
import { twMerge } from 'tailwind-merge'

/**
 * Helper CVA (miroir de inertia/libs/cva.ts) : `cx` fusionne les classes via
 * twMerge ; `cva` définit les variantes. Les composants ui/* React importent
 * depuis ici — même lib `cva` beta que le runtime Solid, zéro divergence.
 */
export const { cva, cx, compose } = defineConfig({
  hooks: {
    onComplete: (className) => twMerge(className),
  },
})
