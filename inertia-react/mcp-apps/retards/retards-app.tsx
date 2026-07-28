/**
 * App MCP « retards prévus » — issue #89, lot 4.
 *
 * Elle ne connaît que le protocole : le résultat de `listerRetardsPrevus` arrive
 * par `ui/notifications/tool-result` (`structuredContent`). Aucun accès réseau —
 * rendu identique dans /copilote et Claude Desktop.
 *
 * ── Ce que le graphe doit dire ──
 *  - Une demande INFEASIBLE (promesse jamais tenable) n'est PAS un retard de N
 *    jours : le moteur renvoie 9999 comme sentinelle, mais l'afficher à l'échelle
 *    des retards chiffrés l'écraserait. Elle est donc isolée, marquée « jamais »,
 *    et capée visuellement — sans quoi une demande irréalisable deviendrait
 *    invisible à côté d'un retard de 5 jours.
 *  - Le retard se lit en valeur absolue, classé décroissant : la demande la plus
 *    en retard en tête, c'est elle qui décide.
 *  - La cause (`limitingArticle` / `limitingReason`) est volontairement reléguée
 *    en détail : le tool l'ignore sciemment au niveau agrégé, l'app fait de même
 *    pour ne pas suggérer une causalité que le CTP isolé ne prouve pas.
 *
 * L'app ne rappelle aucun tool : `listerRetardsPrevus` rend déjà tout ce qu'elle
 * affiche, causes comprises.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { APP_CSS } from './styles'

interface Retard {
  orderId: string
  ligne: string | null
  article: string
  customer: string
  nature: string
  quantity: number
  dateBesoin: string
  promiseEngageante: string | null
  retardJours: number
  limitingArticle: string | null
  limitingReason: string | null
  infeasible: boolean
}

interface RetardsPayload {
  _source?: string
  horizon?: { from?: string; to?: string; days?: number }
  demandsScanned?: number
  demandsEvaluated?: number
  truncated?: boolean
  retardsCount?: number
  retards?: Retard[]
  error?: string
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function isRetardsPayload(value: unknown): value is RetardsPayload {
  return typeof value === 'object' && value !== null && '_source' in value
}

function natureLabel(n: string): string {
  switch (n) {
    case 'PREVISION':
      return 'prévision'
    case 'FERME':
      return 'ferme'
    default:
      return n.toLowerCase()
  }
}

export function RetardsApp() {
  const [payload, setPayload] = useState<RetardsPayload | null>(null)
  const [plein, setPlein] = useState(false)

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'supply-board-retards', version: '1.0.0' },
    capabilities: {},
    // Listener posé AVANT la connexion : l'hôte envoie `tool-result` dès la fin
    // du handshake, un abonnement en useEffect arriverait trop tard.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        if (isRetardsPayload(params.structuredContent)) setPayload(params.structuredContent)
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
        <p className="muted">En attente du résultat de listerRetardsPrevus…</p>
      </Shell>
    )
  if (payload.error)
    return (
      <Shell plein={plein}>
        <p className="err">{payload.error}</p>
      </Shell>
    )

  const retards = payload.retards ?? []

  return (
    <Shell plein={plein}>
      <header className="head">
        <div>
          <h1>Retards prévus</h1>
          <p className="muted">
            {payload.horizon?.from ? fmtDateFr(payload.horizon.from) : '—'} →{' '}
            {payload.horizon?.to ? fmtDateFr(payload.horizon.to) : '—'}
            {payload.horizon?.days ? ` · ${payload.horizon.days} j` : ''}
          </p>
        </div>
      </header>

      <Kpis retards={retards} />

      <Classement retards={retards} plein={plein} />

      {payload.truncated && (
        <p className="muted small">
          {payload.demandsEvaluated ?? retards.length} demandes évaluées (plafond 40) sur{' '}
          {payload.demandsScanned ?? '?'} scannées.
        </p>
      )}
      {!payload.truncated && payload.demandsScanned !== undefined && (
        <p className="muted small">
          {payload.demandsScanned} demande(s) scannée(s), {payload.demandsEvaluated ?? retards.length}{' '}
          évaluée(s).
        </p>
      )}

      {plein && <DetailRetards retards={retards} />}
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

/** Trois indicateurs : l'ampleur du dérapage en un coup d'œil. */
function Kpis({ retards }: { retards: Retard[] }) {
  const infeasibles = retards.filter((r) => r.infeasible).length
  const chiffres = retards.filter((r) => !r.infeasible)
  const retardMoy =
    chiffres.length > 0 ? chiffres.reduce((s, r) => s + r.retardJours, 0) / chiffres.length : 0
  const retardMax = chiffres.length > 0 ? Math.max(...chiffres.map((r) => r.retardJours)) : 0

  return (
    <section className="kpis">
      <div className={`kpi${retards.length > 0 ? ' alerte' : ''}`}>
        <span className="k-label">Demandes en retard</span>
        <span className="k-value">{nf.format(retards.length)}</span>
        <span className="k-note">promesse engageante &gt; date besoin</span>
      </div>
      <div className={`kpi${infeasibles > 0 ? ' alerte' : ''}`}>
        <span className="k-label">Irréalisables</span>
        <span className="k-value">{nf.format(infeasibles)}</span>
        <span className="k-note">{infeasibles > 0 ? 'aucune promesse tenable' : 'aucune'}</span>
      </div>
      <div className="kpi">
        <span className="k-label">Retard moyen</span>
        <span className="k-value">{chiffres.length > 0 ? `${nf1.format(retardMoy)} j` : '—'}</span>
        <span className="k-note">
          {chiffres.length > 0 ? `max ${nf.format(retardMax)} j (hors irréalisables)` : 'hors irréalisables'}
        </span>
      </div>
    </section>
  )
}

/**
 * Barres horizontales de retard, classées décroissant.
 * Les infeasibles (9999 j) sont capées visuellement et marqués « jamais » :
 * à l'échelle des retards chiffrés, ils seraient écrasés et deviendraient invisibles.
 */
function Classement({ retards, plein }: { retards: Retard[]; plein: boolean }) {
  const tries = useMemo(() => {
    const copie = [...retards].sort((a, b) => {
      // Infeasibles en tête : ce sont les plus graves.
      if (a.infeasible !== b.infeasible) return a.infeasible ? -1 : 1
      return b.retardJours - a.retardJours
    })
    return copie
  }, [retards])

  // Échelle des retards CHIFFRÉS uniquement : un infeasible ne doit pas tirer
  // le max vers 9999 et aplatir toutes les autres barres.
  const maxChiffre = useMemo(
    () => Math.max(...tries.filter((r) => !r.infeasible).map((r) => r.retardJours), 1),
    [tries]
  )
  // Cap visuelle des infeasibles : pleine barre, mais signalée comme hors-échelle.
  const CAP_INFEASIBLE = maxChiffre

  const limite = plein ? tries.length : Math.min(12, tries.length)
  const affichees = tries.slice(0, limite)

  if (affichees.length === 0) {
    return <p className="muted">Aucune demande en retard sur l’horizon.</p>
  }

  return (
    <ul className="classement">
      {affichees.map((r) => {
        const largeur = r.infeasible ? CAP_INFEASIBLE : r.retardJours
        const pct = Math.min(100, (largeur / maxChiffre) * 100)
        return (
          <li
            key={`${r.orderId}-${r.ligne ?? ''}-${r.article}`}
            className={`rang ${r.infeasible ? 'infeasible' : 'retard'}`}
          >
            <span className="rang-id">
              <strong>{r.article}</strong>
              <span className="muted">
                {r.orderId}
                {r.customer ? ` · ${r.customer}` : ''}
                {r.ligne ? ` · L${r.ligne}` : ''}
              </span>
            </span>
            <span
              className="barre"
              role="img"
              aria-label={
                r.infeasible ? 'irréalisable' : `${nf.format(r.retardJours)} jours de retard`
              }
            >
              <span className="remplissage" style={{ width: `${pct}%` }} />
              <span className="qte">{r.infeasible ? 'jamais' : `${nf.format(r.retardJours)} j`}</span>
            </span>
            <span className="rang-meta">
              <span>besoin {fmtDateFr(r.dateBesoin)}</span>
              <span className="muted">
                promesse {r.infeasible ? '—' : fmtDateFr(r.promiseEngageante)}
              </span>
            </span>
          </li>
        )
      })}
      {!plein && tries.length > affichees.length && (
        <li className="rang-suite muted small">
          +{tries.length - affichees.length} autre(s) — agrandir pour le détail
        </li>
      )}
    </ul>
  )
}

/** Détail complet avec la cause limitante — réservé au plein écran. */
function DetailRetards({ retards }: { retards: Retard[] }) {
  const tries = useMemo(
    () =>
      [...retards].sort((a, b) => {
        if (a.infeasible !== b.infeasible) return a.infeasible ? -1 : 1
        return b.retardJours - a.retardJours
      }),
    [retards]
  )
  if (tries.length === 0) return null
  return (
    <section className="detail">
      <h2>Détail ({tries.length})</h2>
      <div className="table">
        {tries.map((r, i) => (
          <div
            className={`ligne ${r.infeasible ? 'infeasible' : ''}`}
            key={`${r.orderId}-${r.ligne ?? ''}-${i}`}
          >
            <div className="cell principal">
              <strong>{r.article}</strong>
              <span className="muted">
                {r.orderId}
                {r.ligne ? ` · L${r.ligne}` : ''}
              </span>
            </div>
            <div className="cell">
              <span className="muted">Client</span>
              <span>
                {r.customer || '—'} <span className="muted">({natureLabel(r.nature)})</span>
              </span>
            </div>
            <div className="cell num">
              <span className="muted">Quantité</span>
              <span>{nf.format(r.quantity)}</span>
            </div>
            <div className="cell">
              <span className="muted">Besoin</span>
              <span>{fmtDateFr(r.dateBesoin)}</span>
            </div>
            <div className="cell">
              <span className="muted">Promesse</span>
              <span>{r.infeasible ? <span className="danger">jamais</span> : fmtDateFr(r.promiseEngageante)}</span>
            </div>
            <div className="cell num">
              <span className="muted">Retard</span>
              <span className={r.infeasible ? 'danger' : ''}>
                {r.infeasible ? '—' : `${nf.format(r.retardJours)} j`}
              </span>
            </div>
            <div className="cell">
              <span className="muted">Cause limitante</span>
              <span>
                {r.limitingArticle ?? '—'}
                {r.limitingReason ? <span className="muted"> · {r.limitingReason}</span> : null}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
