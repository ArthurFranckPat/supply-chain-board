/**
 * Registre de raccourcis clavier pour la page Programme — port React du Solid
 * inertia/lib/a11y/shortcuts.ts.
 *
 * Issue #62 (lot 1) : il n'existait aucun raccourci clavier dans l'app. On
 * pose ici un registre minimal — les touches simples (sans modificateur)
 * déclenchent les actions principales quand le focus n'est pas dans un champ
 * de saisie. Échap ferme les overlays.
 *
 * Le handler ignore les frappes émises depuis <input>, <textarea>, <select>
 * ou un élément [contenteditable], ainsi que les combinaisons avec Ctrl/Meta/Alt
 * (pour ne pas écraser les raccourcis navigateur/OS).
 */
import { useEffect } from 'react'

export interface ShortcutMap {
  /** Touche (minuscule) → action. Ex : { r: refresh, '1': modeOf }. */
  [key: string]: () => void
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  if (EDITABLE_TAGS.has(el.tagName)) return true
  return el.isContentEditable
}

/**
 * Hook React — monte un écouteur `keydown` global pour la durée du composant.
 *
 * @param shortcuts Mapping touche → action (ex: { r: () => refresh(), '1': () => setMode('ordonnancement') })
 * @param onEscape Callback optionnel pour la touche Escape (fermeture générique)
 */
export function useShortcuts(shortcuts: ShortcutMap, onEscape?: () => void): void {
  const handler = (e: KeyboardEvent) => {
    // Ne jamais intercepter avec un modificateur (raccourcis navigateur/OS).
    if (e.ctrlKey || e.metaKey || e.altKey) return

    // Échap : fermeture générique (calendrier, drawer, popover hand-rolled).
    if (e.key === 'Escape') {
      onEscape?.()
      return
    }

    // Ignorer quand on tape dans un champ — la lettre « r » doit s'écrire.
    if (isEditable(e.target)) return

    const action = shortcuts[e.key.toLowerCase()]
    if (action) {
      e.preventDefault()
      action()
    }
  }

  useEffect(() => {
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
}
