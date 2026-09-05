import { useMemo, useState } from 'react'
import { TriangleAlert, PackageCheck, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import type { ApproPayload, ApproRow } from '@r/lib/appro/types'

/**
 * Contrôle matières d'un poste de charge — le chaînon manquant entre « voici
 * les heures » et « voici si elles sont faisables ».
 *
 * La page /charge dit combien d'heures chaque poste doit encaisser. Elle ne dit
 * rien des composants qu'il faudra pour les tenir. Ce panneau descend le plan
 * du poste sélectionné dans la nomenclature, le confronte au stock projeté et
 * aux réceptions d'achat attendues, et rend la seule chose qu'un planificateur
 * vienne chercher : **ce qui va manquer, et à partir de quelle période**.
 *
 * ── Deux honnêtetés à tenir à l'écran ──────────────────────────────────────
 *
 * 1. **Ancrage sur la demande, pas sur les OF.** Les besoins viennent de
 *    l'explosion des commandes et prévisions — la même que la vue « Commande »
 *    de /charge, aux mêmes entrées. En vue « OF », les heures affichées au-
 *    dessus sortent des ordres de fabrication : les deux moitiés de l'écran ne
 *    parlent alors pas de la même population, et la légende le dit.
 *
 * 2. **Fenêtre tronquée à la maille semaine.** Le plan matières plafonne à 14
 *    périodes (lisibilité) là où /charge en montre 26. Les 13 premières
 *    semaines sont donc contrôlées, pas les suivantes — écrit dans l'en-tête
 *    plutôt que laissé deviner.
 *
 * Le calcul n'est PAS lancé à l'ouverture de /charge : c'est une explosion de
 * nomenclature complète plus une lecture X3, on ne la paie pas pour un
 * planificateur venu regarder ses courbes. Un bouton la déclenche.
 */

/** Plafond du plan matières — cf. `MATERIAL_MAX_PERIODS` côté serveur. */
const MAX_PERIODS = 14

const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

const isoDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000)

/**
 * Fenêtre et maille du contrôle, dérivées de celles de /charge.
 *
 * Maille mois : les 6 mois de l'horizon tiennent sous le plafond, la fenêtre
 * est celle du graphe, à l'identique. Maille semaine : 26 semaines n'y tiennent
 * pas — les 13 premières sont contrôlées, et `tronquee` le dit à l'écran.
 */
function checkWindow(
  gran: 'month' | 'week',
  monthKeys: string[],
  weekKeys: string[],
  startIso: string
): { from: string; to: string; gran: 'semaine' | 'mois'; periodes: number; tronquee: boolean } {
  if (gran === 'week' && weekKeys.length) {
    const kept = Math.min(weekKeys.length, MAX_PERIODS - 1)
    const lastMonday = new Date(weekKeys[kept - 1])
    return {
      from: weekKeys[0],
      to: isoDay(addDays(lastMonday, 6)),
      gran: 'semaine',
      periodes: kept,
      tronquee: kept < weekKeys.length,
    }
  }
  // Mois : dernier jour du dernier bucket mensuel (clés « 2026-9 »).
  const last = monthKeys[monthKeys.length - 1]?.split('-') ?? []
  const to =
    last.length === 2
      ? isoDay(new Date(Number(last[0]), Number(last[1]), 0))
      : isoDay(addDays(new Date(startIso), 180))
  return {
    from: startIso,
    to,
    gran: 'mois',
    periodes: monthKeys.length,
    tronquee: false,
  }
}

/** Manque total d'une ligne sur la fenêtre, toutes natures. */
const manqueTotal = (r: ApproRow): number =>
  r.manqueFerme.reduce((s, v) => s + v, 0) + r.manquePrevi.reduce((s, v) => s + v, 0)

export function MaterialCheck(props: {
  /** Poste de charge sélectionné (`ligne` du plan appro). */
  poste: string
  gran: 'month' | 'week'
  monthKeys: string[]
  weekKeys: string[]
  startIso: string
  /** Vue de charge active — sert uniquement à l'avertissement d'ancrage. */
  view: 'of' | 'commande'
}) {
  const { poste, gran, monthKeys, weekKeys, startIso, view } = props
  // Le contrôle est armé par poste : changer de poste redemande le geste, au
  // lieu de déclencher en cascade autant d'explosions que de clics de carte.
  const [armedFor, setArmedFor] = useState<string | null>(null)
  const armed = armedFor === poste

  const win = useMemo(
    () => checkWindow(gran, monthKeys, weekKeys, startIso),
    [gran, monthKeys, weekKeys, startIso]
  )

  const url = armed
    ? `${route('material.plan')}?from=${win.from}&to=${win.to}&gran=${win.gran}&ligne=${encodeURIComponent(poste)}`
    : null
  const { data, loading, error } = useTimedFetch<ApproPayload>(url)

  const manques = useMemo(() => {
    const rows = data?.rows ?? []
    return rows
      .filter((r) => r.ruptureAt >= 0)
      .sort((a, b) => a.ruptureAt - b.ruptureAt || manqueTotal(b) - manqueTotal(a))
  }, [data])

  const planUrl = `${route('approvisionnement.index')}?ligne=${encodeURIComponent(poste)}&from=${win.from}&to=${win.to}&gran=${win.gran}`

  return (
    <div className="mt-3 flex-none rounded-lg border border-rule bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-sans text-[13px] font-semibold">Matières</span>
        <span className="font-sans text-[11px] text-muted-foreground">
          {win.periodes} période{win.periodes > 1 ? 's' : ''} ·{' '}
          {win.gran === 'mois' ? 'mois' : 'semaines'}
          {win.tronquee && ` (sur ${weekKeys.length} — plafond de lisibilité du plan matières)`}
        </span>
        {view === 'of' && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 px-2 py-0.5 font-sans text-[10px] font-semibold text-amber-600"
            title="Les heures affichées viennent des OF ; les besoins matières sont explosés depuis les commandes et prévisions clients. Les deux ne portent pas sur la même population."
          >
            <TriangleAlert className="size-3" aria-hidden />
            Besoins issus de la demande, pas des OF
          </span>
        )}
        <a
          href={planUrl}
          className="ml-auto inline-flex items-center gap-1 font-sans text-[11px] font-semibold text-brand hover:underline"
        >
          Plan complet
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {!armed && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setArmedFor(poste)}
            className="rounded-full border border-rule bg-card px-3 py-1.5 font-sans text-[11px] font-semibold transition-colors hover:bg-secondary"
          >
            Vérifier les composants de {poste}
          </button>
          <span className="font-sans text-[11px] text-muted-foreground">
            Explosion de nomenclature + lecture X3 — quelques secondes.
          </span>
        </div>
      )}

      {armed && loading && !data && (
        <div className="mt-2 flex items-center gap-2 font-sans text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Descente du plan de {poste} dans la nomenclature…
        </div>
      )}

      {armed && error && (
        <div className="mt-2 font-sans text-[11px] text-destructive">
          Contrôle indisponible : {error.message}
        </div>
      )}

      {armed && data && manques.length === 0 && (
        <div className="mt-2 inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold text-emerald-600">
          <PackageCheck className="size-3.5" aria-hidden />
          Aucun manque projeté sur la fenêtre — {data.rows.length} composants appelés, tous couverts
          par le stock projeté et les réceptions attendues.
        </div>
      )}

      {armed && data && manques.length > 0 && (
        <div className="mt-2">
          <div className="mb-1.5 inline-flex items-center gap-1.5 font-sans text-[11px] font-semibold text-destructive">
            <TriangleAlert className="size-3.5" aria-hidden />
            {manques.length} composant{manques.length > 1 ? 's' : ''} en manque sur{' '}
            {data.rows.length} appelés
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-rule bg-card">
            <table className="w-full border-collapse font-sans text-[11px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-rule text-left text-muted-foreground">
                  <th className="px-2 py-1 font-medium">Composant</th>
                  <th className="px-2 py-1 font-medium">Désignation</th>
                  <th className="px-2 py-1 text-right font-medium">Stock</th>
                  <th className="px-2 py-1 text-right font-medium">Arrivées</th>
                  <th className="px-2 py-1 font-medium">Rupture</th>
                  <th className="px-2 py-1 text-right font-medium">Manque</th>
                </tr>
              </thead>
              <tbody>
                {manques.slice(0, 60).map((r) => (
                  <tr key={r.article} className="border-b border-rule/60 last:border-0">
                    <td className="px-2 py-1 font-mono font-semibold">{r.article}</td>
                    <td className="max-w-[280px] truncate px-2 py-1 text-muted-foreground">
                      {r.description}
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {fr.format(r.stock)}
                    </td>
                    <td
                      className={cn(
                        'px-2 py-1 text-right font-mono tabular-nums',
                        r.arriveesRetard > 0 && 'text-amber-600'
                      )}
                      title={
                        r.arriveesRetard > 0
                          ? `${fr.format(r.arriveesRetard)} déjà en retard, repliés sur la première période`
                          : undefined
                      }
                    >
                      {fr.format(r.arrivees.reduce((s, v) => s + v, 0))}
                      {r.arriveesRetard > 0 && ' ⚠'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 font-semibold text-destructive">
                      {data.buckets[r.ruptureAt]?.label ?? '—'}
                    </td>
                    <td className="px-2 py-1 text-right font-mono font-semibold tabular-nums text-destructive">
                      {fr.format(manqueTotal(r))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {manques.length > 60 && (
            <div className="mt-1 font-sans text-[10px] text-muted-foreground">
              60 premiers affichés (les plus tôt en rupture) — la liste entière est dans le plan
              complet.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
