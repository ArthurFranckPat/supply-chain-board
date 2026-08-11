import { useEffect, useState } from 'react'

/**
 * `true` pendant qu'une impression est en préparation.
 *
 * Sert à désactiver la virtualisation : une table virtualisée n'a dans le DOM
 * que la fenêtre visible, donc une impression ne sort qu'une vingtaine de
 * lignes. `beforeprint` arrive AVANT que le navigateur peigne les pages, donc
 * le re-rendu non virtualisé est pris en compte.
 *
 * `matchMedia('print')` couvre les navigateurs qui basculent le media sans
 * émettre l'évènement (aperçu d'impression de certains Chromium).
 */
export function useIsPrinting(): boolean {
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    const before = () => setPrinting(true)
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)

    const mql = window.matchMedia?.('print')
    const onChange = (e: MediaQueryListEvent) => setPrinting(e.matches)
    mql?.addEventListener?.('change', onChange)

    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      mql?.removeEventListener?.('change', onChange)
    }
  }, [])

  return printing
}
