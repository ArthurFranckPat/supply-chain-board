/**
 * App MCP « trajectoire de stock » — issue #89, lot 4.
 *
 * Elle ne connaît que le protocole : le résultat de `projeterStock` arrive par
 * `ui/notifications/tool-result` (`structuredContent`). Aucun accès réseau,
 * aucune dépendance à l'app supply-board — d'où un rendu identique dans
 * /copilote et dans Claude Desktop.
 *
 * ── Ce que la courbe doit dire, et ce qu'elle ne doit pas laisser croire ──
 *  - **Une seule échelle** pour l'historique et la projection : ce sont les
 *    mêmes unités, et deux échelles rendraient une chute invisible (leçon #88).
 *  - **Zéro sur l'axe**, toujours : un stock tronqué en bas d'axe dramatise
 *    n'importe quelle variation.
 *  - Le passé et le futur ne se lisent pas pareil — trait plein mesuré d'un
 *    côté, trait accentué de l'autre, séparés par le repère « aujourd'hui ».
 *    Une courbe continue d'une seule couleur ferait passer une prévision pour
 *    un fait.
 *  - Le stock de sécurité est un SEUIL, pas une série : ligne tiretée, jamais
 *    une deuxième courbe.
 *
 * L'app ne rappelle aucun tool : `projeterStock` rend déjà tout ce qu'elle
 * affiche. Un aller-retour par interaction coûterait un appel modèle pour une
 * donnée déjà en main.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { APP_CSS } from './styles'

interface PointHistorique {
  periode: string
  label: string
  qte: number
  entreeQte: number
  sortieQte: number
}

interface PointProjection {
  periode: string
  label: string
  besoinQte: number
  ressourceQte: number
  stockQte: number
}

interface Logistique {
  famille: string | null
  delaiReapproJours: number | null
  lotTechnique: number | null
  lotEconomique: number | null
  stockSecurite: number | null
  fournisseurCode: string | null
  fournisseurNom: string | null
}

interface Indicateurs {
  cmj: number | null
  couvertureJours: number | null
  rotation: number | null
  couvertureProspectiveJours: number | null
  ruptureSemaine: string | null
  ruptureDateIso: string | null
  ratioProspectifDelai: number | null
}

interface StockPayload {
  article?: string
  designation?: string
  trouve?: boolean
  note?: string
  stock?: { total: number; statutA: number; statutQ: number; pmp: number; valeur: number }
  logistique?: Logistique
  indicateurs?: Indicateurs
  historique?: PointHistorique[]
  projection?: PointProjection[]
  x3Error?: string | null
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Dates à l'écran en jj/mm/aaaa — jamais d'ISO brut. */
function fmtDateFr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : null
}

function isStockPayload(value: unknown): value is StockPayload {
  return typeof value === 'object' && value !== null && '_source' in value
}

export function StockApp() {
  const [payload, setPayload] = useState<StockPayload | null>(null)
  const [plein, setPlein] = useState(false)

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'supply-board-stock', version: '1.0.0' },
    capabilities: {},
    // Listener posé AVANT la connexion : l'hôte envoie `tool-result` dès la fin
    // du handshake, un abonnement en useEffect arriverait trop tard.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        if (isStockPayload(params.structuredContent)) setPayload(params.structuredContent)
      })
      // Les params SONT le contexte (mise à jour partielle), pas `{ hostContext }`.
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
        <p className="muted">En attente du résultat de projeterStock…</p>
      </Shell>
    )
  if (payload.trouve === false)
    return (
      <Shell plein={plein}>
        <p className="muted">{payload.note ?? `Article ${payload.article} inconnu au stock.`}</p>
      </Shell>
    )

  const stock = payload.stock
  const ind = payload.indicateurs
  const logi = payload.logistique
  const rupture = fmtDateFr(ind?.ruptureDateIso)

  return (
    <Shell plein={plein}>
      <header className="head">
        <div>
          <div className="ref">
            <h1>{payload.article}</h1>
            {stock && stock.statutQ > 0 && (
              <span className="badge qc">{nf.format(stock.statutQ)} en contrôle (Q)</span>
            )}
          </div>
          <p className="muted">{payload.designation}</p>
        </div>
        {stock && (
          <p className="muted">
            {nf.format(stock.total)} en stock · {nf.format(stock.valeur)} €
          </p>
        )}
      </header>

      {payload.x3Error && <p className="warn">X3 : {payload.x3Error}</p>}

      {ind && <Kpis ind={ind} logi={logi} rupture={rupture} />}

      <Courbe
        historique={payload.historique ?? []}
        projection={payload.projection ?? []}
        stockSecurite={logi?.stockSecurite ?? null}
        ruptureSemaine={ind?.ruptureSemaine ?? null}
        plein={plein}
      />

      {plein && logi && <Logi logi={logi} ind={ind} />}
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

/**
 * Trois indicateurs, choisis pour porter une décision.
 *
 * `couvertureJours` (CMJ, régime moyen passé) est volontairement RELÉGUÉE en
 * note : affichée au même rang que la couverture prospective, elle la
 * contredirait dès que la demande n'est pas plate, et c'est la prospective qui
 * décide.
 */
function Kpis({
  ind,
  logi,
  rupture,
}: {
  ind: Indicateurs
  logi?: Logistique
  rupture: string | null
}) {
  const ratio = ind.ratioProspectifDelai
  // < 1 : commander aujourd'hui n'arrive plus à temps. C'est LE signal.
  const enRetardDeCommande = ratio !== null && ratio < 1

  return (
    <section className="kpis">
      <div className={`kpi${ind.couvertureProspectiveJours !== null ? ' alerte' : ''}`}>
        <span className="k-label">Couverture prospective</span>
        <span className="k-value">
          {ind.couvertureProspectiveJours === null
            ? '> horizon'
            : `${nf1.format(ind.couvertureProspectiveJours)} j`}
        </span>
        <span className="k-note">
          {ind.couvertureProspectiveJours === null
            ? 'aucune rupture sur 52 semaines'
            : `rupture ${rupture ?? ind.ruptureSemaine} · réceptions exclues`}
        </span>
      </div>

      <div className={`kpi${enRetardDeCommande ? ' alerte' : ''}`}>
        <span className="k-label">Couverture ÷ délai</span>
        <span className="k-value">{ratio === null ? '—' : nf1.format(ratio)}</span>
        <span className="k-note">
          {logi?.delaiReapproJours ? `délai ${logi.delaiReapproJours} j · ` : ''}
          {enRetardDeCommande ? 'commander maintenant n’arrive plus à temps' : 'marge suffisante'}
        </span>
      </div>

      <div className="kpi">
        <span className="k-label">Stock de sécurité</span>
        <span className="k-value">
          {logi?.stockSecurite ? nf.format(logi.stockSecurite) : '—'}
        </span>
        <span className="k-note">
          {ind.cmj !== null ? `CMJ ${nf1.format(ind.cmj)}/j` : 'aucune sortie sur 12 mois'}
          {ind.couvertureJours !== null ? ` · ${nf1.format(ind.couvertureJours)} j au régime passé` : ''}
        </span>
      </div>
    </section>
  )
}

const W = 1000
const PAD_L = 46
const PAD_R = 10
const PAD_T = 8
const PAD_B = 18

/** Courbe unique passé + projection, seuil de sécurité, semaine de rupture. */
function Courbe({
  historique,
  projection,
  stockSecurite,
  ruptureSemaine,
  plein,
}: {
  historique: PointHistorique[]
  projection: PointProjection[]
  stockSecurite: number | null
  ruptureSemaine: string | null
  plein: boolean
}) {
  const [survol, setSurvol] = useState<number | null>(null)
  const H = plein ? 340 : 200

  const points = useMemo(
    () => [
      ...historique.map((p) => ({
        periode: p.periode,
        label: p.label,
        qte: p.qte,
        futur: false,
        entree: p.entreeQte,
        sortie: p.sortieQte,
      })),
      ...projection.map((p) => ({
        periode: p.periode,
        label: p.label,
        qte: p.stockQte,
        futur: true,
        entree: p.ressourceQte,
        sortie: p.besoinQte,
      })),
    ],
    [historique, projection]
  )

  const idxAujourdhui = historique.length - 1

  // Échelle commune, ancrée à zéro : le seuil de sécurité entre dedans, sinon
  // une ligne hors cadre laisserait croire qu'il n'y en a pas.
  const maxY = Math.max(...points.map((p) => p.qte), stockSecurite ?? 0, 1)

  const x = useCallback(
    (i: number) => PAD_L + (i / Math.max(1, points.length - 1)) * (W - PAD_L - PAD_R),
    [points.length]
  )
  const y = useCallback((v: number) => PAD_T + (1 - v / maxY) * (H - PAD_T - PAD_B), [maxY, H])

  if (points.length === 0) return <p className="muted">Aucune série à afficher.</p>

  const ligne = (from: number, to: number) =>
    points
      .slice(from, to)
      .map((p, k) => `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(1)},${y(p.qte).toFixed(1)}`)
      .join(' ')

  const aire = (from: number, to: number) => {
    const base = y(0).toFixed(1)
    return `M${x(from).toFixed(1)},${base} ${points
      .slice(from, to)
      .map((p, k) => `L${x(from + k).toFixed(1)},${y(p.qte).toFixed(1)}`)
      .join(' ')} L${x(to - 1).toFixed(1)},${base} Z`
  }

  // La projection reprend au dernier point mesuré : sans ce recouvrement, le
  // trait futur démarrerait une semaine plus loin et créerait un faux trou.
  const debutFutur = Math.max(0, idxAujourdhui)
  const idxRupture = ruptureSemaine ? points.findIndex((p) => p.periode === ruptureSemaine) : -1

  const graduations = [0, 0.5, 1].map((f) => ({ v: maxY * f, yy: y(maxY * f) }))
  const pas = Math.max(1, Math.round(points.length / 8))
  const ticks = points.map((p, i) => ({ p, i })).filter(({ i }) => i % pas === 0)
  const survolPoint = survol !== null ? points[survol] : null

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Stock hebdomadaire : ${historique.length} semaines passées puis ${projection.length} projetées`}
        onMouseLeave={() => setSurvol(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          const px = ratio * W
          const i = Math.round(
            ((px - PAD_L) / (W - PAD_L - PAD_R)) * Math.max(1, points.length - 1)
          )
          setSurvol(Math.min(points.length - 1, Math.max(0, i)))
        }}
      >
        {graduations.map((g) => (
          <g key={g.v}>
            <line className="grid" x1={PAD_L} x2={W - PAD_R} y1={g.yy} y2={g.yy} />
            <text className="tick" x={PAD_L - 5} y={g.yy + 3} textAnchor="end">
              {nf.format(g.v)}
            </text>
          </g>
        ))}

        <path className="aire-passe" d={aire(0, idxAujourdhui + 1)} />
        <path className="aire-futur" d={aire(debutFutur, points.length)} />
        <path className="trace-passe" d={ligne(0, idxAujourdhui + 1)} />
        <path className="trace-futur" d={ligne(debutFutur, points.length)} />

        {stockSecurite !== null && stockSecurite > 0 && (
          <>
            <line
              className="secu"
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(stockSecurite)}
              y2={y(stockSecurite)}
            />
            <text className="tick" x={W - PAD_R} y={y(stockSecurite) - 3} textAnchor="end">
              sécurité {nf.format(stockSecurite)}
            </text>
          </>
        )}

        <line className="aujourdhui" x1={x(idxAujourdhui)} x2={x(idxAujourdhui)} y1={PAD_T} y2={H - PAD_B} />
        <text className="tick" x={x(idxAujourdhui) + 3} y={PAD_T + 8}>
          aujourd’hui
        </text>

        {idxRupture >= 0 && (
          <line className="rupture" x1={x(idxRupture)} x2={x(idxRupture)} y1={PAD_T} y2={H - PAD_B} />
        )}

        <line className="axis" x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} />

        {ticks.map(({ p, i }) => (
          <text key={p.periode} className="tick" x={x(i)} y={H - 5} textAnchor="middle">
            {p.periode.slice(2)}
          </text>
        ))}

        {survol !== null && survolPoint && (
          <>
            <line className="curseur" x1={x(survol)} x2={x(survol)} y1={PAD_T} y2={H - PAD_B} />
            <circle className="point" cx={x(survol)} cy={y(survolPoint.qte)} r={3} />
          </>
        )}
      </svg>

      {survol !== null && survolPoint && (
        <div
          className="tip"
          style={{ left: `${(x(survol) / W) * 100}%`, top: `${(y(survolPoint.qte) / H) * 100}%` }}
        >
          <strong>
            {survolPoint.periode} {survolPoint.futur ? '(projeté)' : ''}
          </strong>
          <span>stock {nf.format(survolPoint.qte)}</span>
          <span>
            {survolPoint.futur ? 'besoin' : 'sorties'} {nf.format(survolPoint.sortie)}
          </span>
          <span>
            {survolPoint.futur ? 'ressources' : 'entrées'} {nf.format(survolPoint.entree)}
          </span>
        </div>
      )}

      <p className="legend">
        <span className="key passe" /> stock mesuré
        <span className="key futur" /> projeté
        {stockSecurite ? <span className="key secu" /> : null}
        {stockSecurite ? 'stock de sécurité' : null}
        {idxRupture >= 0 ? <span className="key rupt" /> : null}
        {idxRupture >= 0 ? 'rupture prévue' : null}
      </p>
    </div>
  )
}

/** Paramètres logistiques — utiles pour décider, encombrants en vignette. */
function Logi({ logi, ind }: { logi: Logistique; ind?: Indicateurs }) {
  const lignes: Array<[string, string]> = [
    ['Famille', logi.famille ?? '—'],
    ['Délai de réappro', logi.delaiReapproJours ? `${logi.delaiReapproJours} j` : '—'],
    ['Lot technique', logi.lotTechnique ? nf.format(logi.lotTechnique) : '—'],
    ['Lot économique', logi.lotEconomique ? nf.format(logi.lotEconomique) : '—'],
    ['Stock de sécurité', logi.stockSecurite ? nf.format(logi.stockSecurite) : '—'],
    ['Fournisseur', logi.fournisseurNom ?? logi.fournisseurCode ?? '—'],
    ['Rotation (12 mois)', ind?.rotation !== null && ind?.rotation !== undefined ? nf1.format(ind.rotation) : '—'],
  ]

  return (
    <section className="logi">
      {lignes.map(([k, v]) => (
        <div key={k}>
          <span className="muted">{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </section>
  )
}

export default StockApp
