/**
 * DataStatus — état de chargement des données de la page, affiché dans le
 * masthead (présent sur toutes les pages, y compris les vues denses qui
 * masquent le footer). Trois informations demandées sur chaque page :
 *
 *   1. temps de chargement — chrono live pendant le chargement ; la durée du
 *      dernier chargement (fetch JSON minutés + navigation Inertia, via le
 *      store data-status) passe au survol ;
 *   2. fraîcheur — heure de la dernière mise à jour des données de la page +
 *      ÂGE DE LA DONNÉE quand le endpoint le porte (`computedAt`, tampon posé
 *      dans le cache côté serveur) + date de la dernière extraction X3 (tables
 *      statiques, shared prop `x3LastSync`), la pastille passant au rouge
 *      quand l'extraction vieillit ;
 *   3. rechargement — le bouton ⟳ re-déclenche les fetch minutés (nonce du
 *      store) ET un `router.reload()` (pages dont les données sont en props).
 *
 * Forme : cluster nu, pas de pilule encadrée — dans le header, une boîte se
 * lit comme un bouton qui n'en est pas un ; seul le ⟳ est cliquable. Le
 * spinner est logé DANS le bouton (le ⟳ devient ◌), pas ajouté à côté.
 *
 * S'y ajoute (issue #186) le RÉCAP du diff produit par ce rechargement —
 * « n changements · n nouvelles · n sorties ». Il compte les lignes du payload
 * entier, y compris celles qu'un filtre ou une pagination cache : le flash ne
 * montre que ce qui est à l'écran, ce compteur dit combien a bougé en tout.
 */
import { useEffect, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { LoaderCircle, RefreshCw } from 'lucide-react'

import { useDataStatusStore, totalDiff } from '@r/lib/data-status-store'
import { EXIT_MS, FLASH_MS } from '@r/lib/diff-flash'
import { cn } from '@r/lib/utils'

const pad2 = (n: number) => String(n).padStart(2, '0')

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`)

/** « à l'instant », « il y a 3 min », « il y a 2 h », « il y a 4 j » — l'âge
 *  affiché est celui de la DONNÉE (tampon serveur computedAt), pas celui de sa
 *  réception : recharger une page servie du cache ne rajeunit pas la donnée. */
const fmtAge = (ageMs: number) => {
  const min = Math.floor(ageMs / 60_000)
  if (min < 1) return 'à l’instant'
  if (min < 90) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 48) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

/** Seuils d'âge : les caches de réponse font 2 à 5 min — vert jusque-là ;
 *  au-delà la page est restée ouverte (ou grace SWR) : ambre, puis rouge
 *  passé 30 min, où un rechargement devient le geste évident. */
const ageCls = (ageMs: number) =>
  ageMs < 5 * 60_000 ? 'text-ferme' : ageMs < 30 * 60_000 ? 'text-amber-600' : 'text-destructive'

/** 14:32 le jour même, sinon 02/09 14:32 — une page laissée ouverte ne doit
 *  pas suggérer une fraîcheur trompeuse. */
const fmtMaj = (ts: number) => {
  const d = new Date(ts)
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  return d.toDateString() === new Date().toDateString()
    ? hm
    : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${hm}`
}

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
  // Le store survit aux navigations Inertia (module, pas composant) : sans
  // cette mémoire de l'URL, le récap de diff d'une page suivrait l'utilisateur
  // sur la suivante. On l'efface au changement d'URL — et à lui seul, car un
  // `router.reload()` émet lui aussi `navigate`, sur la MÊME URL.
  let lastUrl = typeof window !== 'undefined' ? window.location.pathname : ''
  router.on('start', () => {
    visitT0 = Date.now()
    useDataStatusStore.getState().begin()
  })
  router.on('finish', () => {
    if (visitT0 === null) return
    useDataStatusStore.getState().end(Date.now() - visitT0)
    visitT0 = null
  })
  router.on('navigate', () => {
    const url = window.location.pathname
    if (url === lastUrl) return
    lastUrl = url
    useDataStatusStore.getState().clearDiff()
    useDataStatusStore.getState().resetDataAge()
  })
}

/**
 * Recopie les durées du flash sur `:root` pour que les keyframes d'app.css les
 * suivent. C'est ce qui fait de lib/diff-flash.ts LA source unique : les
 * valeurs écrites en dur dans la feuille de style ne sont que des replis, à
 * garder identiques. Posé ici parce que <DataStatus /> est sur toutes les
 * pages — et parce que le moteur de diff, lui, doit rester sans DOM.
 */
function applyFlashDurations() {
  const root = document.documentElement.style
  root.setProperty('--flash-ms', `${FLASH_MS}ms`)
  root.setProperty('--flash-exit-ms', `${EXIT_MS}ms`)
}

/** « 12 changements · 3 nouvelles · 1 sortie » — les zéros sont tus. */
const fmtDiff = (d: { changed: number; entered: number; exited: number }) =>
  [
    d.changed > 0 && `${d.changed} changement${d.changed > 1 ? 's' : ''}`,
    d.entered > 0 && `${d.entered} nouvelle${d.entered > 1 ? 's' : ''}`,
    d.exited > 0 && `${d.exited} sortie${d.exited > 1 ? 's' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')

export function DataStatus() {
  const { active, t0, ms, loadedAt, dataAt, error, bump, diffBySource } = useDataStatusStore()
  const loading = active > 0
  const diff = totalDiff(diffBySource)
  const page = usePage<{ x3LastSync?: number | null }>()
  const x3LastSync = page.props.x3LastSync

  // Chrono live pendant le chargement (re-render à 200 ms) ; au repos, l'âge
  // de la donnée vieillit seul — un tick de 10 s suffit à le faire avancer.
  const [, setNow] = useState(0)
  useEffect(() => {
    const period = loading ? 200 : dataAt !== null ? 10_000 : 0
    if (!period) return
    const tick = setInterval(() => setNow((n) => n + 1), period)
    return () => clearInterval(tick)
  }, [loading, dataAt])

  // Chargement initial du document : aucun événement Inertia ne circule, la
  // durée connue côté client est le temps écoulé depuis la navigation. Les
  // pages à fetch JSON le remplaceront par la durée réelle du calcul.
  useEffect(() => {
    bindInertiaTiming()
    applyFlashDurations()
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
    dataAt !== null && `Données calculées : ${fmtComplet(dataAt)} (cache serveur inclus)`,
    x3LastSync
      ? `Extraction X3 (tables statiques) : ${fmtComplet(x3LastSync)}`
      : 'Extraction X3 : jamais synchronisée',
    diff && `Depuis le rechargement : ${fmtDiff(diff)}`,
    error && `Erreur : ${error}`,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div
      className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground"
      title={tooltip}
      data-data-status
    >
      {/* Fraîcheur de l'extraction X3 (tables statiques) — la pastille encode
          l'âge (vert < 24 h, orange < 7 j, rouge au-delà ou jamais
          synchronisée) ; la date complète vit dans le title du cluster. */}
      <span
        className={cn('size-[7px] shrink-0 rounded-full', dotCls(x3LastSync))}
        aria-hidden="true"
      />
      <span className="whitespace-nowrap">
        {loading
          ? `Chargement ${elapsed !== null ? (elapsed / 1000).toFixed(1) : '0.0'} s`
          : loadedAt !== null
            ? `maj ${fmtMaj(loadedAt)}`
            : 'données non chargées'}
        {/* Âge de la DONNÉE (tampon serveur) — pas celui de sa réception : une
            page servie du cache affiche son vrai âge même rechargée à
            l'instant. C'est la réponse à « remise à jour ou cache servi ? ». */}
        {!loading && dataAt !== null && (
          <span className={cn('font-semibold', ageCls(Date.now() - dataAt))}>
            {' · '}
            {fmtAge(Date.now() - dataAt)}
          </span>
        )}
      </span>
      {/* Récap du diff du dernier rechargement (issue #186) — porte les
          changements HORS écran (autres pages de tri, lignes filtrées), que le
          flash des cellules ne peut par construction pas montrer. Chip ambrée :
          c'est un événement, pas du régime permanent. Disparaît au
          rechargement suivant (bump) ou au changement de page. */}
      {!loading && diff && (
        <span className="whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--flash-change)_14%,transparent)] px-2 py-[2px] font-semibold text-[var(--flash-change)]">
          {fmtDiff(diff)}
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        aria-label="Recharger les données"
        title="Recharger les données (fragments + props de la page)"
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {loading ? (
          <LoaderCircle size={13} strokeWidth={2} className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

export default DataStatus
