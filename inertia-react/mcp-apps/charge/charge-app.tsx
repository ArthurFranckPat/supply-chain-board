/**
 * App MCP « charge vs capacité » — issue #89, lot 1.
 *
 * Elle ne connaît que le protocole : le résultat du tool `getCharge` arrive par
 * `ui/notifications/tool-result` (champ `structuredContent`), et un clic sur un
 * poste rappelle `getCharge` filtré via `tools/call`. Aucun accès réseau, aucune
 * dépendance à l'app supply-board — d'où son affichage identique dans /copilote
 * et dans Claude Desktop.
 *
 * Deux vues, décidées par la donnée elle-même :
 *  - annuaire (pas de `semaines`) : un poste par ligne, charge face à capacité ;
 *  - détail (avec `semaines`) : histogramme hebdomadaire + seuil de capacité.
 * C'est le contrat de `getCharge` (primitives_extra.ts) : le détail hebdo n'existe
 * qu'en mode filtré, par budget de contexte.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react'
import { APP_CSS } from './styles'

interface SemaineCharge {
  semaine: string
  charge: number
  capacite: number
  sature: boolean
}

interface PosteCharge {
  poste: string
  libelle: string
  atelier: string | null
  totalHeures: number
  totalCapacite: number
  semainesSaturees: number
  semaines?: SemaineCharge[]
}

interface ChargePayload {
  vue?: 'of' | 'commandes'
  horizon?: string
  /** Fenêtre bornée, en semaines — à renvoyer pour tout rappel du tool. */
  semainesCount?: number | null
  postesCount?: number
  x3Error?: string | null
  postes?: PosteCharge[]
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtH = (h: number) => `${nf.format(Math.round(h))} h`

/** Taux de charge d'un poste, borné pour l'affichage. `null` = capacité inconnue. */
function taux(charge: number, capacite: number): number | null {
  if (!capacite || capacite <= 0) return null
  return charge / capacite
}

function isChargePayload(value: unknown): value is ChargePayload {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as ChargePayload).postes)
  )
}

export function ChargeApp() {
  const [payload, setPayload] = useState<ChargePayload | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [callError, setCallError] = useState<string | null>(null)
  /** Mode d'affichage accordé par l'hôte : en plein écran, le graphe prend la place. */
  const [plein, setPlein] = useState(false)

  const { app, isConnected, error } = useApp({
    appInfo: { name: 'supply-board-charge', version: '1.0.0' },
    capabilities: {},
    // Le listener doit être posé AVANT la connexion : l'hôte envoie
    // `tool-result` dès la fin du handshake, un abonnement en useEffect
    // arriverait après et l'app resterait vide.
    onAppCreated: (created) => {
      created.addEventListener('toolresult', (params) => {
        if (isChargePayload(params.structuredContent)) {
          setPayload(params.structuredContent)
          setPending(null)
          setCallError(null)
        }
      })
      // Les params SONT le contexte (mise à jour partielle), pas `{ hostContext }`.
      created.addEventListener('hostcontextchanged', (params) => {
        if (params.displayMode) setPlein(params.displayMode === 'fullscreen')
      })
    },
  })

  useHostStyles(app)

  // Mode initial : l'hôte peut déjà être en plein écran au moment du handshake.
  useEffect(() => {
    if (app) setPlein(app.getHostContext()?.displayMode === 'fullscreen')
  }, [app])

  // Fenêtre en cours, rejouée sur chaque rappel du tool : sans elle, ouvrir un
  // poste depuis une vue « 2 semaines » ramènerait un détail sur 6 mois.
  const semaines = payload?.semainesCount ?? null

  const ouvrirPoste = useCallback(
    async (code: string) => {
      if (!app) return
      setPending(code)
      setCallError(null)
      try {
        const result = await app.callServerTool({
          name: 'getCharge',
          arguments: {
            poste: code,
            vue: payload?.vue ?? 'of',
            ...(semaines ? { semaines } : {}),
          },
        })
        if (isChargePayload(result.structuredContent)) {
          setPayload(result.structuredContent as ChargePayload)
        } else {
          setCallError(`Réponse inattendue pour le poste ${code}`)
        }
      } catch (err) {
        setCallError(err instanceof Error ? err.message : String(err))
      } finally {
        setPending(null)
      }
    },
    [app, payload?.vue, semaines]
  )

  // Retour à l'annuaire : même tool, sans filtre.
  const retourAnnuaire = useCallback(async () => {
    if (!app) return
    setPending('*')
    setCallError(null)
    try {
      const result = await app.callServerTool({
        name: 'getCharge',
        arguments: { vue: payload?.vue ?? 'of', ...(semaines ? { semaines } : {}) },
      })
      if (isChargePayload(result.structuredContent)) setPayload(result.structuredContent)
    } catch (err) {
      setCallError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(null)
    }
  }, [app, payload?.vue, semaines])

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
        <p className="muted">En attente du résultat de getCharge…</p>
      </Shell>
    )

  const postes = payload.postes ?? []
  const detail = postes.length === 1 && Array.isArray(postes[0]?.semaines)

  return (
    <Shell plein={plein}>
      <header className="head">
        <div>
          <h1>Charge vs capacité</h1>
          <p className="muted">
            {payload.horizon ?? 'horizon inconnu'} · vue{' '}
            {payload.vue === 'commandes' ? 'commandes (besoin explosé)' : 'OF du plan'} ·{' '}
            {payload.postesCount ?? postes.length} poste
            {(payload.postesCount ?? postes.length) > 1 ? 's' : ''}
          </p>
        </div>
        {detail && (
          <button type="button" onClick={retourAnnuaire} disabled={pending !== null}>
            ← tous les postes
          </button>
        )}
      </header>

      {payload.x3Error && <p className="warn">X3 : {payload.x3Error}</p>}
      {callError && <p className="err">{callError}</p>}

      {detail ? (
        <DetailPoste poste={postes[0]} />
      ) : (
        <Annuaire postes={postes} pending={pending} onOuvrir={ouvrirPoste} />
      )}
    </Shell>
  )
}

function Shell({ children, plein }: { children: ReactNode; plein?: boolean }) {
  return (
    <>
      <style>{APP_CSS}</style>
      {/* `plein` = l'hôte a accordé le plein écran : le graphe prend la hauteur
          disponible au lieu de rester sur ses 190 px de vignette. */}
      <main className={plein ? 'app plein' : 'app'}>{children}</main>
    </>
  )
}

/** Annuaire : une barre par poste, capacité en repère. */
function Annuaire({
  postes,
  pending,
  onOuvrir,
}: {
  postes: PosteCharge[]
  pending: string | null
  onOuvrir: (code: string) => void
}) {
  if (postes.length === 0) {
    return (
      <p className="muted">
        Aucun poste ne correspond. Le filtre teste une sous-chaîne du code et du libellé — un
        fragment plus court suffit souvent.
      </p>
    )
  }

  // Échelle commune à tous les postes : c'est ce qui rend la comparaison honnête.
  const max = Math.max(...postes.map((p) => Math.max(p.totalHeures, p.totalCapacite)), 1)

  return (
    <ul className="postes">
      {postes.map((p) => {
        const t = taux(p.totalHeures, p.totalCapacite)
        return (
          <li key={p.poste}>
            <button
              type="button"
              className="poste"
              onClick={() => onOuvrir(p.poste)}
              disabled={pending !== null}
              aria-busy={pending === p.poste}
            >
              <span className="poste-id">
                <strong>{p.poste}</strong>
                <span className="muted">
                  {p.libelle}
                  {p.atelier ? ` · ${p.atelier}` : ''}
                </span>
              </span>

              <span
                className="jauge"
                role="img"
                aria-label={`${fmtH(p.totalHeures)} sur ${fmtH(p.totalCapacite)}`}
              >
                <span
                  className={t !== null && t > 1 ? 'barre sature' : 'barre'}
                  style={{ width: `${(p.totalHeures / max) * 100}%` }}
                />
                {p.totalCapacite > 0 && (
                  <span className="seuil" style={{ left: `${(p.totalCapacite / max) * 100}%` }} />
                )}
              </span>

              <span className="chiffres">
                <span className="taux">{t === null ? '—' : `${Math.round(t * 100)} %`}</span>
                <span className="muted">
                  {fmtH(p.totalHeures)} / {fmtH(p.totalCapacite)}
                </span>
                {p.semainesSaturees > 0 && (
                  <span className="badge">
                    {p.semainesSaturees} sem. saturée{p.semainesSaturees > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Détail hebdomadaire d'un poste : histogramme + seuil de capacité par semaine. */
function DetailPoste({ poste }: { poste: PosteCharge }) {
  const semaines = poste.semaines ?? []
  const [survol, setSurvol] = useState<number | null>(null)

  // Une seule échelle pour charge ET capacité : le seuil doit rester comparable
  // à la barre qu'il juge (leçon de l'issue #88 sur les doubles échelles).
  const max = Math.max(...semaines.map((s) => Math.max(s.charge, s.capacite)), 1)
  const totalCharge = semaines.reduce((a, s) => a + s.charge, 0)
  const totalCapacite = semaines.reduce((a, s) => a + s.capacite, 0)
  const t = taux(totalCharge, totalCapacite)

  return (
    <section className="detail">
      <h2>
        {poste.poste} <span className="muted">{poste.libelle}</span>
      </h2>
      <p className="muted">
        {fmtH(totalCharge)} de charge pour {fmtH(totalCapacite)} de capacité
        {t !== null ? ` (${Math.round(t * 100)} %)` : ''} · {poste.semainesSaturees} semaine
        {poste.semainesSaturees > 1 ? 's' : ''} saturée
        {poste.semainesSaturees > 1 ? 's' : ''}
      </p>

      <div className="chart">
        {semaines.map((s, i) => {
          const hCharge = (s.charge / max) * 100
          const hCap = (s.capacite / max) * 100
          return (
            <div
              key={`${s.semaine}-${i}`}
              className="col"
              onMouseEnter={() => setSurvol(i)}
              onMouseLeave={() => setSurvol((cur) => (cur === i ? null : cur))}
            >
              <div className="plot">
                <div
                  className={s.sature ? 'bar sature' : 'bar'}
                  // Plancher visible : une barre absente doit vouloir dire zéro,
                  // jamais « trop petit pour être tracé » (issue #88).
                  style={{ height: s.charge > 0 ? `max(${hCharge}%, 2px)` : '0' }}
                />
                {s.capacite > 0 && <div className="cap" style={{ bottom: `${hCap}%` }} />}
                {survol === i && (
                  <div className="tip">
                    <strong>{s.semaine}</strong>
                    <span>charge {fmtH(s.charge)}</span>
                    <span>capacité {fmtH(s.capacite)}</span>
                    {s.sature && <span className="tip-sature">saturé</span>}
                  </div>
                )}
              </div>
              <span className="xlabel">{s.semaine}</span>
            </div>
          )
        })}
      </div>
      <p className="legend">
        <span className="key bar-key" /> charge <span className="key cap-key" /> capacité
        <span className="key sature-key" /> semaine saturée
      </p>
    </section>
  )
}

export default ChargeApp
