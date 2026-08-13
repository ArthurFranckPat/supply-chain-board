/**
 * App MCP « date promesse (CTP) » — issue #89, lot 4.
 *
 * Elle ne connaît que le protocole : le résultat de `getPromise` arrive par
 * `ui/notifications/tool-result` (`structuredContent`). Aucun accès réseau —
 * rendu identique dans /copilote et Claude Desktop.
 *
 * ── Ce que la frise doit dire ──
 *  - Le CHEMIN CRITIQUE est aplati racine → feuille limitante : c'est lui qui
 *    explique la date. Chaque maillon porte sa raison (`reason.kind`), qui dit
 *    POURQUOI on attend à cette étape — stock déjà là, réception attendue, OF du
 *    plan, réappro, fabrication, ou inatteignable.
 *  - Deux dates, jamais confondues : optimiste (au plus tôt, tout va bien) et
 *    engageante (tient compte des contraintes réelles). L'engageante est celle
 *    qu'on annonce ; l'optimiste n'engage à rien.
 *  - Le facteur limitant est marqué sur la frise : c'est le maillon qui contraint
 *    toute la chaîne.
 *  - Une raison `stock` signifie seulement que le moteur a trouvé du stock et
 *    s'est arrêté là : elle ne renseigne pas les réceptions en cours et ne
 *    contredit pas une rupture constatée ailleurs (contrat du tool). L'app le
 *    rappelle, sinon on croirait la promesse acquise.
 *
 * L'app ne rappelle aucun tool : `getPromise` rend déjà tout le chemin critique.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { APP_CSS } from './styles'

type ReasonKind = 'stock' | 'reception' | 'of' | 'appro' | 'fabrication' | 'infeasible'

interface PromiseReason {
  kind: ReasonKind
  [k: string]: unknown
}

interface CheminNoeud {
  article: string
  quantity: number
  availableDate: string
  reason: PromiseReason
  leadTimeUsed: number
  onCriticalPath: boolean
}

interface FacteurLimitant {
  article: string
  reason: PromiseReason
  date: string | null
  leadTime: number
}

interface Branche {
  promiseDate: string | null
  mode: string | null
  infeasible: boolean
  truncated: boolean
  limitingFactor: FacteurLimitant
  criticalPath: CheminNoeud[]
}

interface PromessePayload {
  _source?: string
  article?: string
  quantity?: number
  from?: string | null
  optimiste?: Branche
  engageante?: Branche
  error?: string
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function reasonLabel(r: PromiseReason): string {
  switch (r.kind) {
    case 'stock':
      return 'stock disponible'
    case 'reception':
      return 'réception achat'
    case 'of':
      return 'OF du plan'
    case 'appro':
      return `réappro (${nf1.format(r.leadTime as number)} j)`
    case 'fabrication':
      return 'fabrication'
    case 'infeasible':
      return 'inatteignable'
    default:
      return r.kind
  }
}

function reasonIcone(r: PromiseReason): string {
  switch (r.kind) {
    case 'stock':
      return '◆'
    case 'reception':
      return '↓'
    case 'of':
      return '⚙'
    case 'appro':
      return '↻'
    case 'fabrication':
      return '✦'
    case 'infeasible':
      return '✕'
    default:
      return '•'
  }
}

function isPromessePayload(value: unknown): value is PromessePayload {
  return typeof value === 'object' && value !== null && '_source' in value
}

export function PromesseApp() {
  const [payload, setPayload] = useState<PromessePayload | null>(null)
  const [plein, setPlein] = useState(false)

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'supply-board-promesse', version: '1.0.0' },
    capabilities: {},
    // Listener posé AVANT la connexion : l'hôte envoie `tool-result` dès la fin
    // du handshake, un abonnement en useEffect arriverait trop tard.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        if (isPromessePayload(params.structuredContent)) setPayload(params.structuredContent)
      })
      created.addEventListener('hostcontextchanged', (params) => {
        if (params.displayMode) setPlein(params.displayMode === 'fullscreen')
      })
    },
  })

  useHostStyles(app)

  useEffect(() => {
    if (app) setPlein(app.getHostContext()?.displayMode === 'fullscreen')
  }, [app])

  if (error)
    return (
      <Shell plein={plein}>
        <p className="err">Connexion à l’hôte impossible : {error.message}</p>
      </Shell>
    )
  if (!isConnected)
    return (
      <Shell plein={plein}>
        <p className="muted">Connexion…</p>
      </Shell>
    )
  if (!payload)
    return (
      <Shell plein={plein}>
        <p className="muted">En attente du résultat de getPromise…</p>
      </Shell>
    )
  if (payload.error)
    return (
      <Shell plein={plein}>
        <p className="err">{payload.error}</p>
      </Shell>
    )

  const eng = payload.engageante
  const opt = payload.optimiste

  return (
    <Shell plein={plein}>
      <header className="head">
        <div>
          <h1>Date promesse</h1>
          <p className="muted">
            {payload.article ?? '—'} · {nf.format(payload.quantity ?? 0)} pièces
            {payload.from ? ` · dès le ${fmtDateFr(payload.from)}` : ''}
          </p>
        </div>
      </header>

      <Dates opt={opt} eng={eng} />

      {eng?.infeasible && (
        <p className="warn">
          Aucune promesse tenable pour cette quantité (contrainte insurmontable).
        </p>
      )}

      {eng && <Frise branche={eng} plein={plein} />}

      {eng?.limitingFactor.reason.kind === 'stock' && (
        <p className="muted small">
          Le facteur limitant est un <strong>stock</strong> : le moteur a trouvé du stock et s’est
          arrêté là. Cela ne renseigne pas les réceptions en cours et ne contredit pas une rupture
          constatée par ailleurs.
        </p>
      )}
      {eng?.truncated && (
        <p className="muted small">Chemin critique tronqué (profondeur BOM atteinte).</p>
      )}
    </Shell>
  )
}

function Shell({ children, plein }: { children: ReactNode; plein?: boolean }) {
  return (
    <>
      <style>{APP_CSS}</style>
      <main className={plein ? 'app plein' : 'app'}>{children}</main>
    </>
  )
}

/** Les deux dates, en regard — l'engageante domine. */
function Dates({ opt, eng }: { opt?: Branche; eng?: Branche }) {
  return (
    <section className="kpis">
      <div className={`kpi principale${eng?.infeasible ? ' alerte' : ''}`}>
        <span className="k-label">Promesse engageante</span>
        <span className="k-value">{eng?.infeasible ? 'jamais' : fmtDateFr(eng?.promiseDate)}</span>
        <span className="k-note">
          {eng?.infeasible
            ? 'inatteignable'
            : eng?.limitingFactor
              ? `limité par ${eng.limitingFactor.article}`
              : ''}
        </span>
      </div>
      <div className="kpi">
        <span className="k-label">Date optimiste</span>
        <span className="k-value">{opt?.infeasible ? 'jamais' : fmtDateFr(opt?.promiseDate)}</span>
        <span className="k-note">au plus tôt, sans marge</span>
      </div>
      <div className="kpi">
        <span className="k-label">Facteur limitant</span>
        <span className="k-value small-v">
          {eng?.limitingFactor.article ?? '—'}
        </span>
        <span className="k-note">
          {eng?.limitingFactor ? reasonLabel(eng.limitingFactor.reason) : ''}
          {eng?.limitingFactor.date ? ` · ${fmtDateFr(eng.limitingFactor.date)}` : ''}
        </span>
      </div>
    </section>
  )
}

/**
 * Frise du chemin critique engageant : un jalon par maillon, racine à gauche,
 * feuille limitante à droite. La flèche du temps va des disponibilités les plus
 * tôt vers la date promise. Le facteur limitant est marqué.
 */
function Frise({ branche, plein }: { branche: Branche; plein: boolean }) {
  const chemin = branche.criticalPath ?? []
  if (chemin.length === 0) {
    return <p className="muted">Aucun chemin critique à afficher.</p>
  }

  // Le facteur limitant est le dernier maillon du chemin critique.
  const idxLimitant = chemin.length - 1

  return (
    <section className="frise">
      <h2>Chemin critique</h2>
      <ol className={`jalons${plein ? ' plein' : ''}`}>
        {chemin.map((n, i) => {
          const isLimitant = i === idxLimitant
          return (
            <li
              key={`${n.article}-${i}`}
              className={`jalon ${n.reason.kind}${isLimitant ? ' limitant' : ''}`}
            >
              <span className="pastille">{reasonIcone(n.reason)}</span>
              <span className="fil" />
              <div className="cartouche">
                <strong>{n.article}</strong>
                <span className="muted">{reasonLabel(n.reason)}</span>
                <span className="meta">
                  {nf.format(n.quantity)} dispo le {fmtDateFr(n.availableDate)}
                </span>
                {n.leadTimeUsed > 0 && (
                  <span className="meta muted">délai {nf.format(n.leadTimeUsed)} j</span>
                )}
                {isLimitant && (
                  <span className="tag limitant-tag">maillon limitant</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
