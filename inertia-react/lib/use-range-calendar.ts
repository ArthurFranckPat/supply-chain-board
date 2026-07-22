import { useEffect, useRef, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'

/**
 * Sélection de plage react-day-picker « propre à la réouverture ».
 *
 * Problème résolu : react-day-picker (mode="range") traite un clic sur une plage
 * DÉJÀ complète comme une modification (`addToRange`) — il renvoie aussitôt une
 * plage complète. Comme nos sélecteurs sont amorcés avec la fenêtre courante
 * (from ET to renseignés), le tout premier clic « termine » la plage et referme
 * le popover : impossible de repartir d'une nouvelle plage.
 *
 * Ici, le premier clic après ouverture repart TOUJOURS d'une borne unique
 * (`from = clic`, `to = undefined`) ; le second clic complète et déclenche
 * `onCommit` (au parent de fermer / appliquer le filtre). Après validation, le
 * compteur repart à zéro — utile pour un calendrier toujours ouvert (démo,
 * pas de popover) où l'on enchaîne les sélections.
 *
 * @param open     état ouvert du popover (optionnel) — réarme le brouillon à
 *                 chaque (ré)ouverture. Omettre pour un calendrier permanent.
 * @param value    plage affichée quand aucun brouillon n'est en cours.
 * @param onCommit appelé avec la plage complète (2 clics).
 */
export function useRangeCalendar(opts: {
  open?: boolean
  value: DayPickerRange | undefined
  onCommit: (range: DayPickerRange) => void
}) {
  const { open, value, onCommit } = opts
  const [draft, setDraft] = useState<DayPickerRange | undefined>(undefined)
  // true = le prochain clic démarre une nouvelle plage (ignore la plage affichée).
  const freshRef = useRef(true)

  // Réarme à chaque ouverture du popover : rouvrir = repartir d'une plage neuve.
  useEffect(() => {
    if (open) {
      freshRef.current = true
      setDraft(undefined)
    }
  }, [open])

  const selected = draft ?? value

  const onSelect = (range: DayPickerRange | undefined, triggerDate: Date) => {
    if (freshRef.current) {
      // 1er clic : borne de départ seule, peu importe la plage affichée.
      freshRef.current = false
      setDraft({ from: triggerDate, to: undefined })
      return
    }
    // 2e clic : react-day-picker a étendu le brouillon (ordre + min/max gérés).
    setDraft(range)
    if (range?.from && range?.to) {
      freshRef.current = true // plage complète → prochain clic repart à zéro
      onCommit(range)
    }
  }

  return { selected, onSelect }
}
