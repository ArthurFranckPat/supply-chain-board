import type { Component, JSX } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import { cn } from '@/libs/cn'

type NavKey = 'board' | 'shortages'

interface NavItem {
  key: NavKey
  href: string
  icon: string
  label: string
}

const NAV: NavItem[] = [
  { key: 'board', href: '/scheduler/board', icon: 'event_note', label: 'Planning Prods' },
  { key: 'shortages', href: '/scheduler/shortages', icon: 'report', label: 'Suivi des ruptures' },
]

/**
 * Coquille applicative : sidebar fixe (nav Scheduler) + zone principale.
 * Chaque page rend sa propre barre d'en-tête dans le slot.
 */
export const AppLayout: Component<{ active?: NavKey; children: JSX.Element }> = (props) => {
  return (
    <>
      <aside class="fixed left-0 top-12 h-[calc(100vh-48px)] w-12 flex flex-col items-center py-4 bg-white border-r border-gray-200 z-40">
        <nav class="flex flex-col gap-5">
          <a
            class="p-2 text-gray-400 hover:text-primary transition-colors"
            href="/scheduler/board"
            title="Vue d'ensemble"
          >
            <span class="material-symbols-outlined">grid_view</span>
          </a>
          {NAV.map((item) => (
            <Link
              href={item.href}
              title={item.label}
              class={cn(
                'p-2 rounded-lg transition-colors',
                props.active === item.key
                  ? item.key === 'shortages'
                    ? 'text-error bg-error/5'
                    : 'text-primary bg-m3-primary/5'
                  : item.key === 'shortages'
                    ? 'text-gray-400 hover:text-error'
                    : 'text-gray-400 hover:text-primary'
              )}
            >
              <span class="material-symbols-outlined">{item.icon}</span>
            </Link>
          ))}
          <a class="p-2 text-gray-400 hover:text-primary transition-colors" href="#" title="Ressources">
            <span class="material-symbols-outlined">inventory</span>
          </a>
          <a class="p-2 text-gray-400 hover:text-primary transition-colors" href="#" title="Maintenance">
            <span class="material-symbols-outlined">build</span>
          </a>
          <a class="p-2 text-gray-400 hover:text-primary transition-colors" href="#" title="Analytics">
            <span class="material-symbols-outlined">monitoring</span>
          </a>
        </nav>
        <div class="mt-auto flex flex-col gap-4 pb-4">
          <button class="text-gray-300 hover:text-gray-600">
            <span class="material-symbols-outlined">terminal</span>
          </button>
        </div>
      </aside>
      {props.children}
    </>
  )
}

export default AppLayout
