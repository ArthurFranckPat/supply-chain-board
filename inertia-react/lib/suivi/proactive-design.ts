/**
 * Vue proactive du Suivi (redesign) — regroupements et formats partagés par le
 * bandeau de verdicts, la liste compacte et la feuille de détail.
 */
import type { ProactiveDisplayRow, ProactiveVerdictKey } from '@r/lib/suivi/types'

/**
 * Les six verdicts du moteur regroupés en quatre tuiles, DANS L'ORDRE DE GRAVITÉ
 * (fixe d'une session à l'autre). La couleur vient des tons de verdict déjà
 * arbitrés (issue #62) : la marque ne code jamais « ok ».
 */
export interface VerdictGroup {
  id: 'blocked' | 'late' | 'risk' | 'ok'
  label: string
  keys: readonly ProactiveVerdictKey[]
  /** Nom accessible du bouton filtre. */
  action: string
  /** Liseré supérieur de la tuile. */
  bar: string
}

export const VERDICT_GROUPS: readonly VerdictGroup[] = [
  {
    id: 'blocked',
    label: 'Bloquées',
    keys: ['blocked', 'uncov'],
    action: 'Afficher les commandes bloquées',
    bar: 'bg-destructive',
  },
  {
    id: 'late',
    label: 'En retard',
    keys: ['late'],
    action: 'Afficher les retards',
    bar: 'bg-suggere',
  },
  {
    id: 'risk',
    label: 'À risque',
    keys: ['risk'],
    action: 'Afficher les commandes à risque',
    bar: 'bg-planifie',
  },
  {
    id: 'ok',
    label: "À l'heure",
    keys: ['time', 'stock'],
    action: "Afficher les commandes à l'heure",
    bar: 'bg-ferme',
  },
]

/** ISO AAAA-MM-JJ → JJ/MM/AAAA (jamais d'ISO brut à l'écran). */
export function fmtFullDate(iso: string | null | undefined): string {
  if (!iso) return 'Non renseignée'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

const frNum = (n: number) => n.toString().replace('.', ',')

/** Cause du verdict en une phrase, lue directement dans la ligne du moteur. */
export function verdictCause(row: ProactiveDisplayRow): string {
  const manquants = row.composants.filter((c) => !c.cqSeul).map((c) => c.art)
  const liste = manquants.slice(0, 3).join(', ') + (manquants.length > 3 ? '…' : '')
  switch (row.verdictKey) {
    case 'blocked':
      return manquants.length > 0
        ? `Composant manquant pour l'OF couvrant : ${liste}.`
        : "Un OF couvrant n'est pas réalisable."
    case 'uncov':
      return "Ni stock, ni OF, ni commande d'achat ne couvrent la quantité restante."
    case 'late':
      return `Retard projeté de ${frNum(row.joursRetard)} j sur la date d'expédition.`
    case 'risk':
      return "OF ferme non démarré, fin à 2 jours ou moins de l'expédition."
    case 'stock':
      return 'Couverte par le stock disponible, sans production.'
    default:
      return 'OF couvrant réalisable, matières disponibles.'
  }
}
