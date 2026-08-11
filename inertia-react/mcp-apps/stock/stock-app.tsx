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

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { CourbeProjection } from '../../components/ui/chart'
import { fmtPeriode } from '../../lib/charts/theme'
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
        <span className="k-value">{logi?.stockSecurite ? nf.format(logi.stockSecurite) : '—'}</span>
        <span className="k-note">
          {ind.cmj !== null ? `CMJ ${nf1.format(ind.cmj)}/j` : 'aucune sortie sur 12 mois'}
          {ind.couvertureJours !== null
            ? ` · ${nf1.format(ind.couvertureJours)} j au régime passé`
            : ''}
        </span>
      </div>
    </section>
  )
}

/** Courbe unique passé + projection, seuil de sécurité, semaine de rupture —
 *  CourbeProjection (@tanstack/charts). Le passé est plein, le futur pointillé,
 *  le seuil une règle, la charnière « aujourd'hui » un repère vertical. */
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
  const points = useMemo(
    () => [
      ...historique.map((p) => ({
        cle: p.periode,
        label: fmtPeriode(p.periode),
        valeur: p.qte,
        projete: false,
      })),
      ...projection.map((p) => ({
        cle: p.periode,
        label: fmtPeriode(p.periode),
        valeur: p.stockQte,
        projete: true,
      })),
    ],
    [historique, projection]
  )

  /** Flux du point (entrées/ressources, sorties/besoins) — enrichit le tooltip. */
  const flux = useMemo(() => {
    const m = new Map<string, { entree: number; sortie: number }>()
    for (const p of historique) m.set(p.periode, { entree: p.entreeQte, sortie: p.sortieQte })
    for (const p of projection) m.set(p.periode, { entree: p.ressourceQte, sortie: p.besoinQte })
    return (cle: string) => m.get(cle) ?? null
  }, [historique, projection])

  if (points.length === 0) return <p className="muted">Aucune série à afficher.</p>

  const seuil = stockSecurite !== null && stockSecurite > 0 ? stockSecurite : null
  const charniere =
    projection.length > 0 && historique.length > 0
      ? historique[historique.length - 1].periode
      : null
  // La rupture est cherchée côté projection uniquement : les clés de semaine
  // ISO peuvent se répéter entre passé et prévision.
  const ruptureCle =
    ruptureSemaine !== null && projection.some((p) => p.periode === ruptureSemaine)
      ? ruptureSemaine
      : null

  return (
    <div className="chart-wrap">
      <CourbeProjection
        points={points}
        seuil={seuil}
        charniere={charniere}
        regleX={ruptureCle}
        flux={flux}
        hauteur={plein ? 340 : 200}
        largeurInitiale={700}
        ariaLabel={`Stock hebdomadaire : ${historique.length} semaines passées puis ${projection.length} projetées`}
      />

      <p className="legend">
        <span className="key passe" /> stock mesuré
        <span className="key futur" /> projeté
        {seuil !== null ? <span className="key secu" /> : null}
        {seuil !== null ? 'stock de sécurité' : null}
        {ruptureCle !== null ? <span className="key rupt" /> : null}
        {ruptureCle !== null ? 'rupture prévue' : null}
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
    [
      'Rotation (12 mois)',
      ind?.rotation !== null && ind?.rotation !== undefined ? nf1.format(ind.rotation) : '—',
    ],
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
