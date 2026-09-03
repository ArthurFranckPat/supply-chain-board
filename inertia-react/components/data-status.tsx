/**
 * DataStatus — état de chargement des données de la page, affiché dans le
 * masthead (présent sur toutes les pages, y compris les vues denses qui
 * masquent le footer). Trois informations demandées sur chaque page :
 *
 *   1. temps de chargement — chrono live pendant le chargement, puis durée du
 *      dernier chargement (fetch JSON minutés + navigation Inertia, via le
 *      store data-status) ;
 *   2. fraîcheur — heure de la dernière mise à jour des données de la page +
 *      date de la dernière extraction X3 (tables statiques, shared prop
 *      `x3LastSync`), la pastille passant au rouge quand l'extraction vieillit ;
 *   3. rechargement — le bouton ⟳ re-déclenche les fetch minutés (nonce du
 *      store) ET un `router.reload()` (pages dont les données sont en props).
 */
import { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

import { useDataStatusStore } from '@r/lib/data-status-store'
import { cn } from '@r/lib/utils'

const pad2 = (n: number) => String(n).padStart(2, '0')

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`)

/** 14:32 le jour même, sinon 02/09 14:32 — une page laissée ouverte ne doit
 *  pas suggérer une fraîcheur trompeuse. */
const fmtMaj = (ts: number) => {
  const d = new Date(ts)
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return d.toDateString() === new Date().toDateString()
    ? hm
    : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${hm}`
}

/** Extrait X3 : 06:12 aujourd'hui, 02/09 sinon (synchro nocturne habituelle). */
const fmtX3 = fmtMaj

const fmtComplet = (ts: number) => {
  const d = new Date(ts)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} à ${pad2(
    d.getHours()
  )}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** Couleur de la pastille d'extraction X3 selon son âge. */
const dotCls = (ts: number | null | undefined) => {
  if (!ts) return 'bg-muted-foreground/40'
  const age = Date.now() - ts
  if (age < 24 * 3600_000) return 'bg-ferme'
  if (age < 7 * 24 * 3600_000) return 'bg-amber-500'
  return 'bg-destructive'
}

/**
 * Chronométrage des visites Inertia (navigation entre pages + router.reload
 * déclenché par le bouton « recharger ») — les pages en props Inertia n'ont
 * pas d'autre signal de chargement. Souscrit UNE SEULE fois à vie d'onglet :
 * le masthead est démonté/remonté à chaque navigation, et un abonnement lié au
 * cycle du composant pourrait manquer le `finish` (émis après le `start` mais
 * potentiellement autour du swap de page).
 */
let inertiaTimingBound = false
function bindInertiaTiming() {
  if (inertiaTimingBound) return
  inertiaTimingBound = true
  let visitT0: number | null = null
  router.on('start', () => {
    visitT0 = Date.now()
    useDataStatusStore.getState().begin()
  })
  router.on('finish', () => {
    if (visitT0 === null) return
    useDataStatusStore.getState().end(Date.now() - visitT0)
    visitT0 = null
  })
}

export function DataStatus() {
  const { active, t0, ms, loadedAt, error, bump } = useDataStatusStore()
  const loading = active > 0
  const page = usePage<{ x3LastSync?: number | null }>()
  const x3LastSync = page.props.x3LastSync

  // Chrono live pendant le chargement (re-render à 200 ms).
  const [, setNow] = useState(0)
  useEffect(() => {
    if (!loading) return
    const tick = setInterval(() => setNow((n) => n + 1), 200)
    return () => clearInterval(tick)
  }, [loading])

  // Chargement initial du document : aucun événement Inertia ne circule, la
  // durée connue côté client est le temps écoulé depuis la navigation. Les
  // pages à fetch JSON le remplaceront par la durée réelle du calcul.
  useEffect(() => {
    bindInertiaTiming()
    useDataStatusStore.getState().seed(Math.round(performance.now()))
  }, [])

  const elapsed = t0 !== null ? Date.now() - t0 : null
  const refresh = () => {
    bump()
    router.reload()
  }

  const tooltip = [
    'Données de la page',
    loadedAt !== null &&
      `Mise à jour : ${fmtComplet(loadedAt)}${ms !== null ? ` (chargée en ${fmtMs(ms)})` : ''}`,
    x3LastSync
      ? `Extraction X3 (tables statiques) : ${fmtComplet(x3LastSync)}`
      : 'Extraction X3 : jamais synchronisée',
    error && `Erreur : ${error}`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className="flex items-center gap-1 rounded-full border border-rule bg-card py-[3px] pl-2.5 pr-1 font-mono text-[11px] tabular-nums text-muted-foreground"
      title={tooltip}
      data-data-status
    >
      {loading && (
        <LoaderCircle size={12} strokeWidth={2} className="animate-spin" aria-hidden="true" />
      )}
      <span className="whitespace-nowrap">
        {loading
          ? `Chargement ${elapsed !== null ? (elapsed / 1000).toFixed(1) : '0.0'} s`
          : loadedAt !== null
            ? `${ms !== null ? `${fmtMs(ms)} · ` : ''}maj ${fmtMaj(loadedAt)}`
            : 'données non chargées'}
      </span>
      {/* Fraîcheur de l'extraction X3 (tables statiques) — visible en clair,
          la date complète au survol ; la pastille encode l'âge (vert < 24 h,
          orange < 7 j, rouge au-delà ou jamais synchronisée). */}
      <span className="hidden items-center gap-1.5 whitespace-nowrap border-l border-rule pl-1.5 xl:flex">
        <span
          className={cn('size-[6px] rounded-full', dotCls(x3LastSync))}
          aria-hidden="true"
        />
        X3 {x3LastSync ? fmtX3(x3LastSync) : '—'}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        aria-label="Recharger les données"
        title="Recharger les données (fragments + props de la page)"
        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  )
}

export default DataStatus
