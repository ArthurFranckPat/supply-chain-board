import { useEffect } from 'react'

/**
 * Les portails Base UI (Dialog, Sheet, Select, Combobox, Tooltip…) rendent
 * dans document.body, hors de tout wrapper `.theme-*`. Sans classe de thème
 * sur <body>, leur CSS scoped ne s'applique jamais et ils retombent sur le
 * thème par défaut (Airbnb). Ce hook synchronise document.body avec la classe
 * de thème active et la retire au démontage ou au changement de thème.
 */
export function useThemeBody(themeClass: string) {
  useEffect(() => {
    const { classList } = document.body
    if (themeClass) classList.add(themeClass)
    return () => {
      if (themeClass) classList.remove(themeClass)
    }
  }, [themeClass])
}
