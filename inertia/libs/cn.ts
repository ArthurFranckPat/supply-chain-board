import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Alias `cn` (convention shadcn) — délègue à la fusion native `cx` (cva +
 * twMerge). Conservé pour les composants maison qui n'ont pas d'équivalent
 * natif (Sheet) et le code applicatif.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
