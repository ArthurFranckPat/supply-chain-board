import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Fusionne des classes Tailwind conditionnellement (convention shadcn). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
