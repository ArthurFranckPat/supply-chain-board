/**
 * App MCP « ruptures composants » — issue #89, lot 4.
 *
 * Elle ne connaît que le protocole : le résultat de `listerRuptures` arrive par
 * `ui/notifications/tool-result` (`structuredContent`). Aucun accès réseau —
 * rendu identique dans /copilote et Claude Desktop.
 *
 * ── Ce que le classement doit dire ──
 *  - La gravité se lit d'abord au VERDICT : `sans_couverture` = composant sans
 *    réception couvrante, les SEULS à escalader aux achats. Ils passent en tête
 *    et en rouge, quoi que dise la quantité.
 *  - Ensuite la marge : un composant `overdue` (déjà en retard) précède un
 *    `a_risque`. La barre ∝ la quantité manquante donne l'ampleur, la couleur le
 *    verdict — jamais deux infos sur le même canal.
 *  - La réception couvrante est la moitié de la réponse : un composant manquant
 *    avec une date d'arrivée n'est pas géré pareil qu'un `sans_couverture`.
 *
 * L'app ne rappelle aucun tool : `listerRuptures` rend déjà tout ce qu'elle
 * affiche, verdicts et réceptions comprises.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { APP_CSS } from './styles'

type Verdict = 'couvert' | 'a_risque' | 'retard' | 'sans_couverture' | 'sous_ensemble'

interface Reception {
  commandeAchat: string
  fournisseur: string
  qty: number
  dateArrivee: string
}

interface Rupture {
  composant: string
  composantDesc: string | null
  qteManquante: number
  numOf: string | null
  articleParent: string | null
  numCommande: string | null
  client: string | null
  dateExpedition: string | null
  dateBesoin: string | null
  verdict: Verdict
  overdue: boolean
  joursMarge: number | null
  joursRetardReception: number | null
  reception: Reception | null
  sousEnsembleOfs: unknown[] | null
}

interface RupturesPayload {
  _source?: string
  window?: { from?: string; days?: number }
  stats?: { nbRuptures: number; nbCouvertes: number; nbSansCouverture: number }
  verdictCounts?: Partial<Record<Verdict, number>>
  totalMatching?: number
  truncated?: boolean
  x3Error?: string | null
  ruptures?: Rupture[]
  error?: string
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Sévérité de classement : sans_couverture > retard/overdue > a_risque > autres. */
function severite(r: Rupture): number {
  if (r.verdict === 'sans_couverture') return 0
  if (r.overdue || r.verdict === 'retard') return 1
  if (r.verdict === 'a_risque') return 2
  if (r.verdict === 'sous_ensemble') return 3
  return 4
}

function verdictLabel(v: Verdict): string {
  switch (v) {
    case 'sans_couverture':
      return 'sans couverture'
    case 'a_risque':
      return 'à risque'
    case 'retard':
      return 'retard'
    case 'sous_ensemble':
      return 'sous-ensemble'
    default:
      return 'couvert'
  }
}

function isRupturesPayload(value: unknown): value is RupturesPayload {
  return typeof value === 'object' && value !== null && '_source' in value
}

export function RupturesApp() {
  const [payload, setPayload] = useState<RupturesPayload | null>(null)
  const [plein, setPlein] = useState(false)

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'supply-board-ruptures', version: '1.0.0' },
    capabilities: {},
    // Listener posé AVANT la connexion : l'hôte envoie `tool-result` dès la fin
    // du handshake, un abonnement en useEffect arriverait trop tard.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        if (isRupturesPayload(params.structuredContent)) setPayload(params.structuredContent)
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
        <p className="muted">En attente du résultat de listerRuptures…</p>
      </Shell>
    )
  if (payload.error)
    return (
      <Shell plein={plein}>
        <p className="err">{payload.error}</p>
      </Shell>
    )
  if (payload.x3Error)
    return (
      <Shell plein={plein}>
        <p className="warn">X3 : {payload.x3Error}</p>
      </Shell>
    )

  const ruptures = payload.ruptures ?? []
  const counts = payload.verdictCounts ?? {}

  return (
    <Shell plein={plein}>
      <header className="head">
        <div>
          <h1>Ruptures composants</h1>
          <p className="muted">
            {payload.window?.from ? `du ${fmtDateFr(payload.window.from)}` : ''}
            {payload.window?.days ? ` · ${payload.window.days} j` : ''} · {ruptures.length} rupture
            {ruptures.length > 1 ? 's' : ''}
          </p>
        </div>
      </header>

      {counts && <Kpis counts={counts} nbSansCouverture={payload.stats?.nbSansCouverture ?? 0} />}

      <Classement ruptures={ruptures} plein={plein} />

      {payload.truncated && (
        <p className="muted small">
          Tronqué à {ruptures.length} lignes sur {payload.totalMatching ?? ruptures.length}.
        </p>
      )}

      {plein && <DetailRuptures ruptures={ruptures} />}
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

/** Pastilles de verdict — `sans_couverture` isolé comme le signal d'escalade. */
function Kpis({
  counts,
  nbSansCouverture,
}: {
  counts: Partial<Record<Verdict, number>>
  nbSansCouverture: number
}) {
  const ordre: Verdict[] = ['sans_couverture', 'retard', 'a_risque', 'sous_ensemble', 'couvert']
  const total = ordre.reduce((s, v) => s + (counts[v] ?? 0), 0)
  return (
    <section className="kpis">
      <div className={`kpi${nbSansCouverture > 0 ? ' alerte' : ''}`}>
        <span className="k-label">Sans couverture</span>
        <span className="k-value">{nf.format(nbSansCouverture)}</span>
        <span className="k-note">
          {nbSansCouverture > 0 ? 'à escalader aux achats' : 'aucune — toutes couvertes'}
        </span>
      </div>
      <div className="kpi">
        <span className="k-label">Total ruptures</span>
        <span className="k-value">{nf.format(total)}</span>
      </div>
      <div className="kpi verdicts">
        {ordre.map((v) => {
          const n = counts[v] ?? 0
          if (n === 0) return null
          return (
            <span key={v} className={`pastille ${v}`}>
              {verdictLabel(v)} <strong>{n}</strong>
            </span>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Barres horizontales classées par sévérité. Largeur ∝ quantité manquante,
 * couleur par verdict : deux canaux, deux infos.
 */
function Classement({ ruptures, plein }: { ruptures: Rupture[]; plein: boolean }) {
  const tries = useMemo(() => {
    const copie = [...ruptures]
    copie.sort((a, b) => {
      const sa = severite(a)
      const sb = severite(b)
      if (sa !== sb) return sa - sb
      // Même sévérité : quantité manquante décroissante.
      return b.qteManquante - a.qteManquante
    })
    return copie
  }, [ruptures])

  const max = useMemo(
    () => Math.max(...tries.map((r) => r.qteManquante), 1),
    [tries]
  )

  const limite = plein ? tries.length : Math.min(12, tries.length)
  const affichees = tries.slice(0, limite)

  if (affichees.length === 0) {
    return <p className="muted">Aucune rupture sur la fenêtre interrogée.</p>
  }

  return (
    <ul className="classement">
      {affichees.map((r) => (
        <li key={`${r.composant}-${r.numOf ?? ''}-${r.numCommande ?? ''}`} className={`rang ${r.verdict}`}>
          <span className="rang-id">
            <strong>{r.composant}</strong>
            <span className="muted">{r.composantDesc ?? ''}</span>
          </span>
          <span
            className="barre"
            role="img"
            aria-label={`${nf.format(r.qteManquante)} manquants · ${verdictLabel(r.verdict)}`}
          >
            <span
              className="remplissage"
              style={{ width: `${(r.qteManquante / max) * 100}%` }}
            />
            <span className="qte">{nf.format(r.qteManquante)}</span>
          </span>
          <span className="rang-meta">
            <span className={`tag ${r.verdict}`}>{verdictLabel(r.verdict)}</span>
            {r.reception ? (
              <span className="muted">couvert le {fmtDateFr(r.reception.dateArrivee)}</span>
            ) : r.verdict === 'sans_couverture' ? (
              <span className="danger">pas de réception</span>
            ) : (
              <span className="muted">—</span>
            )}
          </span>
        </li>
      ))}
      {!plein && tries.length > affichees.length && (
        <li className="rang-suite muted small">
          +{tries.length - affichees.length} autre(s) — agrandir pour le détail
        </li>
      )}
    </ul>
  )
}

/** Détail complet — réservé au plein écran. */
function DetailRuptures({ ruptures }: { ruptures: Rupture[] }) {
  const tries = useMemo(
    () =>
      [...ruptures].sort((a, b) => severite(a) - severite(b) || b.qteManquante - a.qteManquante),
    [ruptures]
  )
  if (tries.length === 0) return null
  return (
    <section className="detail">
      <h2>Détail ({tries.length})</h2>
      <div className="table">
        {tries.map((r, i) => (
          <div className="ligne" key={`${r.composant}-${r.numOf ?? ''}-${i}`}>
            <div className="cell principal">
              <strong>{r.composant}</strong>
              <span className="muted">{r.composantDesc ?? '—'}</span>
            </div>
            <div className="cell num">
              <span className="muted">Manquant</span>
              <span>{nf.format(r.qteManquante)}</span>
            </div>
            <div className="cell">
              <span className="muted">OF</span>
              <span>{r.numOf ?? '—'}</span>
            </div>
            <div className="cell">
              <span className="muted">Commande / client</span>
              <span>
                {r.numCommande ?? '—'}
                {r.client ? ` · ${r.client}` : ''}
              </span>
            </div>
            <div className="cell">
              <span className="muted">Besoin</span>
              <span>{fmtDateFr(r.dateBesoin)}</span>
            </div>
            <div className="cell">
              <span className="muted">Verdict</span>
              <span className={`tag ${r.verdict}`}>{verdictLabel(r.verdict)}</span>
            </div>
            <div className={`cell ${r.reception ? '' : 'danger'}`}>
              <span className="muted">Réception couvrante</span>
              {r.reception ? (
                <span>
                  {r.reception.commandeAchat} · {r.reception.fournisseur}
                  <br />
                  {nf.format(r.reception.qty)} · {fmtDateFr(r.reception.dateArrivee)}
                </span>
              ) : (
                <span>aucune — à escalader</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
