/**
 * App MCP « réceptions fournisseurs » — issue #89, lot 4.
 *
 * Elle ne connaît que le protocole : le résultat de `listerReceptions` arrive par
 * `ui/notifications/tool-result` (`structuredContent`). Aucun accès réseau, aucune
 * dépendance à l'app supply-board — rendu identique dans /copilote et Claude Desktop.
 *
 * ── Ce que le graphe doit dire ──
 *  - La charge du QUAI se lit par jour : un histogramme palette/jour, le pic
 *    surligné. C'est la vue « arrivages » que ni ruptures ni stock n'offrent.
 *  - Échelle ancrée à zéro : les palettes sont additives, une troncature en bas
 *    d'axe ferait passer un pic pour un creux.
 *  - Les agrégats (`statsFenetre`, `chargeParJourFenetre`) couvrent la FENÊTRE
 *    ENTIÈRE et ignorent les filtres fournisseur/article (contrat du tool) :
 *    l'app le rappelle, sinon on prête au fournisseur filtré la charge de tous.
 *  - `palettesFiabilite` qualifie le chiffre palette : un coef estimé ou absent
 *    fait de la charge un minorant — à annoncer, jamais à taire.
 *
 * L'app ne rappelle aucun tool : `listerReceptions` rend déjà tout ce qu'elle
 * affiche, fenêtre agrégée + lignes détail comprises.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { APP_CSS } from './styles'

interface ChargeJour {
  jour: string
  palettes: number
  lignes: number
  fournisseurs: number
}

interface StatsFenetre {
  totalPalettes: number
  totalLignes: number
  totalFournisseurs: number
  picPalettes: number
  picJour: string | null
  lignesEstimees: number
  lignesSansCoef: number
}

interface CriticiteLigne {
  niveau: string
  joursMarge: number
  overdue: boolean
  ofs: unknown[]
}

interface LigneReception {
  noCommande: string
  article: string
  designation: string | null
  fournisseur: string
  fournisseurNom: string | null
  qteUs: number
  date: string
  nbPalettes: number | null
  palettesFiabilite: 'coef_x3' | 'estime' | 'non_calculable'
  coefSource: string | null
  criticite: CriticiteLigne | null
}

interface ReceptionsPayload {
  _source?: string
  note?: string
  filtres?: { from?: string; to?: string; horizonDays?: number; fournisseur?: string | null; article?: string | null; criticite?: boolean }
  totalMatching?: number
  truncated?: boolean
  criticiteError?: string | null
  statsFenetre?: StatsFenetre
  chargeParJourFenetre?: ChargeJour[]
  lignes?: LigneReception[]
  error?: string
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** jj/mm/aaaa depuis ISO YYYY-MM-DD. */
function fmtDateFr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('T')[0].split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** jj/mm court pour l'axe d'un histogramme quotidien. */
function fmtCourt(iso: string): string {
  const [, m, d] = iso.split('T')[0].split('-')
  return m && d ? `${d}/${m}` : iso
}

function isReceptionsPayload(value: unknown): value is ReceptionsPayload {
  return typeof value === 'object' && value !== null && '_source' in value
}

export function ReceptionsApp() {
  const [payload, setPayload] = useState<ReceptionsPayload | null>(null)
  const [plein, setPlein] = useState(false)

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'supply-board-receptions', version: '1.0.0' },
    capabilities: {},
    // Listener posé AVANT la connexion : l'hôte envoie `tool-result` dès la fin
    // du handshake, un abonnement en useEffect arriverait trop tard.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        if (isReceptionsPayload(params.structuredContent)) setPayload(params.structuredContent)
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
        <p className="muted">En attente du résultat de listerReceptions…</p>
      </Shell>
    )
  if (payload.error)
    return (
      <Shell plein={plein}>
        <p className="err">{payload.error}</p>
      </Shell>
    )

  const stats = payload.statsFenetre
  const charge = payload.chargeParJourFenetre ?? []
  const lignes = payload.lignes ?? []

  return (
    <Shell plein={plein}>
      <header className="head">
        <div>
          <h1>Réceptions attendues</h1>
          <p className="muted">
            {payload.filtres?.from ? fmtDateFr(payload.filtres.from) : '—'} →{' '}
            {payload.filtres?.to ? fmtDateFr(payload.filtres.to) : '—'}
            {payload.filtres?.horizonDays ? ` · ${payload.filtres.horizonDays} j` : ''}
            {payload.filtres?.fournisseur ? ` · ${payload.filtres.fournisseur}` : ''}
          </p>
        </div>
      </header>

      {payload.note && <p className="muted small">{payload.note}</p>}

      {stats && <Kpis stats={stats} />}

      <Histogramme charge={charge} picJour={stats?.picJour ?? null} plein={plein} />

      {payload.criticiteError && <p className="warn">Criticité indisponible : {payload.criticiteError}</p>}

      {payload.truncated && (
        <p className="muted small">
          Détail tronqué à {lignes.length} lignes sur {payload.totalMatching ?? lignes.length} —
          agrège plus de détails hors app si nécessaire.
        </p>
      )}

      <p className="muted small">
        Agrégats (palettes/jour, pic, totaux) sur la fenêtre entière — ils ignorent les filtres
        fournisseur et article.
      </p>

      {plein && <DetailLignes lignes={lignes} />}
    </Shell>
  )
}

// Une erreur loader X3 remonte sous `{ error }` (payload d'erreur), déjà traitée
// plus haut par la branche `payload.error` — pas de champ `x3Error` sur le succès.

function Shell({ children, plein }: { children: ReactNode; plein?: boolean }) {
  return (
    <>
      <style>{APP_CSS}</style>
      <main className={plein ? 'app plein' : 'app'}>{children}</main>
    </>
  )
}

/** Quatre indicateurs : la charge du quai en un coup d'œil. */
function Kpis({ stats }: { stats: StatsFenetre }) {
  const fiabilite = stats.lignesEstimees + stats.lignesSansCoef > 0
  return (
    <section className="kpis">
      <div className="kpi">
        <span className="k-label">Total palettes</span>
        <span className="k-value">{nf.format(stats.totalPalettes)}</span>
        <span className="k-note">{nf.format(stats.totalLignes)} lignes attendues</span>
      </div>
      <div className="kpi">
        <span className="k-label">Pic de déchargement</span>
        <span className="k-value">{nf.format(stats.picPalettes)}</span>
        <span className="k-note">
          {stats.picJour ? `le ${fmtDateFr(stats.picJour)}` : 'aucun pic'}
        </span>
      </div>
      <div className="kpi">
        <span className="k-label">Fournisseurs</span>
        <span className="k-value">{nf.format(stats.totalFournisseurs)}</span>
        <span className="k-note">
          {fiabilite
            ? `${stats.lignesEstimees} palette(s) estimée(s) · ${stats.lignesSansCoef} sans coef → charge minorante`
            : 'coefs palette fiables (X3)'}
        </span>
      </div>
    </section>
  )
}

/**
 * Histogramme palette/jour. Une barre par jour, pic surligné, repère « aujourd’hui ».
 * Ancré à zéro : les palettes s'additionnent, une base tronquée mentirait sur le pic.
 */
function Histogramme({
  charge,
  picJour,
  plein,
}: {
  charge: ChargeJour[]
  picJour: string | null
  plein: boolean
}) {
  const [survol, setSurvol] = useState<number | null>(null)

  if (charge.length === 0) {
    return <p className="muted">Aucune réception attendue sur la fenêtre.</p>
  }

  const max = Math.max(...charge.map((c) => c.palettes), 1)
  const aujourdhui = new Date().toISOString().split('T')[0]
  const H = plein ? 300 : 190
  const W = 1000
  const PAD_L = 38
  const PAD_R = 8
  const PAD_T = 8
  const PAD_B = 22

  const x = (i: number) => PAD_L + (i / Math.max(1, charge.length - 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B)
  const bw = Math.max(2, ((W - PAD_L - PAD_R) / Math.max(1, charge.length - 1)) * 0.62)

  const idxPic = picJour ? charge.findIndex((c) => c.jour.split('T')[0] === picJour.split('T')[0]) : -1
  const idxAujourdhui = charge.findIndex((c) => c.jour.split('T')[0] >= aujourdhui)

  const grad = [0, 0.5, 1].map((f) => ({ v: max * f, yy: y(max * f) }))
  const pas = Math.max(1, Math.round(charge.length / 8))
  const ticks = charge.map((c, i) => ({ c, i })).filter(({ i }) => i % pas === 0)
  const survolJour = survol !== null ? charge[survol] : null

  return (
    <div className="chart-wrap">
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Charge palettes par jour sur ${charge.length} jours`}
        onMouseLeave={() => setSurvol(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          const px = ratio * W
          const i = Math.round(((px - PAD_L) / (W - PAD_L - PAD_R)) * Math.max(1, charge.length - 1))
          setSurvol(Math.min(charge.length - 1, Math.max(0, i)))
        }}
      >
        {grad.map((g) => (
          <g key={g.v}>
            <line className="grid" x1={PAD_L} x2={W - PAD_R} y1={g.yy} y2={g.yy} />
            <text className="tick" x={PAD_L - 4} y={g.yy + 3} textAnchor="end">
              {nf.format(g.v)}
            </text>
          </g>
        ))}

        {charge.map((c, i) => {
          const isPic = i === idxPic
          return (
            <rect
              key={`${c.jour}-${i}`}
              className={isPic ? 'bar pic' : 'bar'}
              x={x(i) - bw / 2}
              y={y(c.palettes)}
              width={bw}
              height={Math.max(0, y(0) - y(c.palettes))}
            />
          )
        })}

        {idxAujourdhui >= 0 && (
          <line
            className="aujourdhui"
            x1={x(idxAujourdhui)}
            x2={x(idxAujourdhui)}
            y1={PAD_T}
            y2={H - PAD_B}
          />
        )}

        <line className="axis" x1={PAD_L} x2={W - PAD_R} y1={y(0)} y2={y(0)} />

        {ticks.map(({ c, i }) => (
          <text key={`${c.jour}-${i}`} className="tick" x={x(i)} y={H - 6} textAnchor="middle">
            {fmtCourt(c.jour)}
          </text>
        ))}

        {survol !== null && survolJour && (
          <>
            <line
              className="curseur"
              x1={x(survol)}
              x2={x(survol)}
              y1={PAD_T}
              y2={H - PAD_B}
            />
            <rect
              className="curseur-bar"
              x={x(survol) - bw / 2}
              y={y(survolJour.palettes)}
              width={bw}
              height={Math.max(0, y(0) - y(survolJour.palettes))}
            />
          </>
        )}
      </svg>

      {survol !== null && survolJour && (
        <div
          className="tip"
          style={{
            left: `${(x(survol) / W) * 100}%`,
            top: `${(y(survolJour.palettes) / H) * 100}%`,
          }}
        >
          <strong>{fmtDateFr(survolJour.jour)}</strong>
          <span>{nf1.format(survolJour.palettes)} pal.</span>
          <span>{survolJour.lignes} ligne(s) · {survolJour.fournisseurs} four.</span>
        </div>
      )}

      <p className="legend">
        <span className="key bar-key" /> palettes / jour
        {idxPic >= 0 ? <span className="key pic-key" /> : null}
        {idxPic >= 0 ? 'pic' : null}
        {idxAujourdhui >= 0 ? <span className="key auj-key" /> : null}
        {idxAujourdhui >= 0 ? "aujourd’hui" : null}
      </p>
    </div>
  )
}

/** Détail commande par commande — encombrant, réservé au plein écran. */
function DetailLignes({ lignes }: { lignes: LigneReception[] }) {
  if (lignes.length === 0) return <p className="muted">Aucune ligne de détail.</p>
  return (
    <section className="lignes">
      <h2>Détail ({lignes.length} lignes)</h2>
      <div className="table">
        {lignes.map((l, i) => (
          <div className="ligne" key={`${l.noCommande}-${l.article}-${i}`}>
            <div className="cell principal">
              <strong>{l.article}</strong>
              <span className="muted">{l.designation ?? '—'}</span>
            </div>
            <div className="cell">
              <span className="muted">Commande</span>
              <span>{l.noCommande}</span>
            </div>
            <div className="cell">
              <span className="muted">Fournisseur</span>
              <span>{l.fournisseurNom ?? l.fournisseur}</span>
            </div>
            <div className="cell num">
              <span className="muted">Qté US</span>
              <span>{nf.format(l.qteUs)}</span>
            </div>
            <div className="cell">
              <span className="muted">Date</span>
              <span>{fmtDateFr(l.date)}</span>
            </div>
            <div className="cell num">
              <span className="muted">Palettes</span>
              <span>
                {l.nbPalettes !== null ? nf1.format(l.nbPalettes) : '—'}
                {l.palettesFiabilite !== 'coef_x3' && (
                  <span className="badge fiab">{palettesLabel(l.palettesFiabilite)}</span>
                )}
              </span>
            </div>
            {l.criticite && (
              <div className={`cell num crit ${criticiteClasse(l.criticite)}`}>
                <span className="muted">Criticité</span>
                <span>
                  {l.criticite.niveau}
                  {l.criticite.joursMarge !== 0 ? ` · ${nf1.format(l.criticite.joursMarge)} j` : ''}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function palettesLabel(fiab: LigneReception['palettesFiabilite']): string {
  switch (fiab) {
    case 'estime':
      return 'estimé'
    case 'non_calculable':
      return 'n/c'
    default:
      return ''
  }
}

function criticiteClasse(c: CriticiteLigne): string {
  if (c.overdue) return 'danger'
  if (c.niveau === 'retard') return 'warning'
  return ''
}
