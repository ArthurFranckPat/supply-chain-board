import type { ReactNode } from 'react'
import { CircleCheck, RefreshCw, TriangleAlert, Waves } from 'lucide-react'
import { cn } from '@r/lib/utils'
import {
  cleLigne,
  sommeHeures,
  type DeplacementsSemaine,
  type PlanLissagePoste,
} from '@r/lib/load/lissage'

/**
 * Bandeau de lissage de la semaine ouverte, dans le panneau de détail de charge.
 *
 * Ce bandeau ne redessine PAS le profil de la semaine : la table qu'il coiffe
 * porte déjà une en-tête par jour, avec sa capacité et sa barre —
 * un second graphique des mêmes cinq jours prendrait de la place sans apporter
 * de décision. Le bandeau porte ce que la table ne peut pas porter : le total
 * de ce que le plan gagne, ce qui sort de la semaine et ce qui y entre, et les
 * raisons pour lesquelles une ligne n'a pas pu être avancée.
 *
 * La proposition ligne par ligne, elle, se lit DANS la table, sur la ligne
 * concernée — c'est là que le planificateur a déjà l'article, le client et les
 * heures sous les yeux.
 *
 * ── Le lissage ne se calcule pas à l'ouverture du panneau ───────────────────
 * Il explose la nomenclature de toute la demande de la fenêtre pour borner
 * l'avance par la matière. Le déclencher sur chaque clic de barre ferait payer
 * ce calcul à qui vient seulement lire une composition de charge.
 */

const fmtH = (h: number) => (Math.round(h * 10) / 10).toFixed(1).replace('.', ',')
const fmtQ = (q: number) => Math.round(q).toLocaleString('fr-FR')

export interface ChargeLissagePanelProps {
  /** Libellé de la semaine ouverte, tel que le bandeau d'identité l'affiche. */
  semaineLabel: string
  plan: PlanLissagePoste | null
  loading: boolean
  error: string | null
  /** Déplacements triés vis-à-vis de la semaine ouverte (null tant qu'aucun plan). */
  repartition: DeplacementsSemaine | null
  /** Lignes appliquées depuis ce bandeau (clé `numCommande#ligne`). */
  appliquees: ReadonlySet<string>
  /** Clé en cours d'écriture, `'lot'` pendant un « tout appliquer ». */
  busy: string | null
  actionError: string | null
  onCharger: () => void
  onRecalculer: () => void
  onMasquer: () => void
  onToutAppliquer: () => void
}

const BTN =
  'flex-none rounded-sm border border-border px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-45'

export function ChargeLissagePanel(props: ChargeLissagePanelProps) {
  const { plan, repartition } = props

  if (props.loading) {
    return (
      <Bande>
        <RefreshCw size={13} className="flex-none animate-spin text-brand" />
        <span className="text-[11px] text-muted-foreground">
          Calcul du plan — explosion de nomenclature et borne matière sur trois semaines…
        </span>
      </Bande>
    )
  }

  if (props.error) {
    return (
      <Bande>
        <TriangleAlert size={13} className="flex-none text-destructive" />
        <span className="text-[11px] text-destructive">{props.error}</span>
        <span className="flex-1" />
        <button type="button" onClick={props.onCharger} className={cn(BTN, 'hover:bg-secondary')}>
          Réessayer
        </button>
      </Bande>
    )
  }

  if (!plan || !repartition) {
    return (
      <Bande>
        <Waves size={13} className="flex-none text-brand" />
        <span className="text-[11px] text-muted-foreground">
          Le CBN jalonne à capacité infinie : il ne regarde jamais combien d’ordres tombent le même
          jour. Le lissage propose de repositionner des dates de ligne de commande pour absorber les
          pics, sur trois semaines à partir de cette semaine.
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={props.onCharger}
          className={cn(BTN, 'border-brand/50 text-brand hover:bg-brand-soft')}
        >
          Lisser la semaine
        </button>
      </Bande>
    )
  }

  const { internes, sortantes, entrantes, horsSemaine } = repartition
  const concernes = [...internes, ...sortantes, ...entrantes]
  const restants = concernes.filter((d) => !props.appliquees.has(cleLigne(d.numCommande, d.ligne)))
  const gain = plan.plan.depassementAvantH - plan.plan.depassementApresH
  // Lignes que la matière a empêché d'avancer ET que le plan laisse en place :
  // c'est le cas où le pic ne se résorbe pas et où le levier est chez
  // l'approvisionneur, pas chez le commercial. Les autres ont bougé quand même.
  const bloquees = plan.borneMatiere.lignes.filter((l) => l.resteeSurPlace)

  return (
    <div className="flex-none border-b border-border bg-brand-soft/40">
      {/* Ligne de décision : ce que le plan gagne, ce qu'il coûte, et l'action. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2">
        <span className="flex flex-none items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand">
          <Waves size={12} />
          Lissage · {props.semaineLabel}
        </span>

        {/* Le chiffre qui justifie le geste : des heures au-dessus du plafond
            journalier, pas un indice sans unité. */}
        <span
          className="font-mono text-[11px] tabular-nums"
          title="Somme, jour par jour, des heures posées au-dessus de la capacité du poste — sur les trois semaines de l’horizon"
        >
          <span className="text-muted-foreground">Heures au-dessus de la capacité </span>
          <span className="font-bold">{fmtH(plan.plan.depassementAvantH)} h</span>
          <span className="text-muted-foreground"> → </span>
          <span
            className="font-bold"
            style={{
              color:
                plan.plan.depassementApresH > 0.05
                  ? 'var(--color-destructive)'
                  : 'var(--color-ferme)',
            }}
          >
            {fmtH(plan.plan.depassementApresH)} h
          </span>
          {gain > 0.05 && <span className="text-muted-foreground"> (−{fmtH(gain)} h)</span>}
        </span>

        {concernes.length > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {concernes.length} ligne{concernes.length > 1 ? 's' : ''} à re-dater
            {sortantes.length > 0 && (
              <span
                title="Ces lignes quittent la semaine ouverte : leur destination est datée et située sur chaque ligne de la table"
                style={{ color: 'var(--color-planifie)' }}
              >
                {' '}
                · −{fmtH(sommeHeures(sortantes))} h sortent de la semaine
              </span>
            )}
            {entrantes.length > 0 && (
              <span
                title="Ces lignes viennent d’une autre semaine de l’horizon : elles apparaissent dans la table, à leur jour d’arrivée"
                style={{ color: 'var(--color-planifie)' }}
              >
                {' '}
                · +{fmtH(sommeHeures(entrantes))} h y entrent
              </span>
            )}
          </span>
        )}

        <span className="flex-1" />

        {restants.length > 0 && (
          <button
            type="button"
            disabled={props.busy !== null}
            onClick={props.onToutAppliquer}
            className={cn(BTN, 'border-brand/50 text-brand hover:bg-brand-soft')}
          >
            {props.busy === 'lot' ? 'Application…' : `Tout appliquer (${restants.length})`}
          </button>
        )}
        <button
          type="button"
          disabled={props.busy !== null}
          onClick={props.onRecalculer}
          className={cn(BTN, 'text-muted-foreground hover:bg-secondary')}
          title="Recalcule le plan sur l’état actuel des dates — les propositions déjà appliquées en sortiront"
        >
          Recalculer
        </button>
        <button
          type="button"
          onClick={props.onMasquer}
          className={cn(BTN, 'text-muted-foreground hover:bg-secondary')}
        >
          Masquer
        </button>
      </div>

      {props.actionError && (
        <Note ton="danger">
          <TriangleAlert size={12} className="mt-px flex-none" />
          <span>{props.actionError}</span>
        </Note>
      )}

      {plan.x3Error && (
        <Note ton="danger">
          <TriangleAlert size={12} className="mt-px flex-none" />
          <span>
            <b>Plan calculé sur des données partielles :</b>{' '}
            <span className="font-mono">{plan.x3Error}</span>
          </span>
        </Note>
      )}

      {/* Rien à proposer : le dire, et dire pourquoi. Une liste vide et muette
          laisserait croire que l'outil n'a pas tourné. */}
      {concernes.length === 0 && (
        <Note ton="neutre">
          <CircleCheck
            size={12}
            className="mt-px flex-none"
            style={{ color: 'var(--color-ferme)' }}
          />
          <span>
            <b>Aucun déplacement n’améliore cette semaine.</b>{' '}
            {plan.plan.depassementAvantH <= 0.05
              ? 'Aucun jour de l’horizon ne dépasse la capacité du poste, et l’égalisation ne gagnerait pas assez pour justifier d’appeler un client.'
              : bloquees.length > 0
                ? 'Les jours chargés le restent : les lignes qui pourraient les dégager sont bloquées par la matière (voir ci-dessous).'
                : 'Les lignes de ces jours sont sur date ferme, ou déjà au plus juste dans leur fenêtre de négociation.'}
          </span>
        </Note>
      )}

      {/* Un plan dont une partie reste invisible ne doit jamais se présenter
          comme entier : l'horizon fait trois semaines, l'écran en montre une. */}
      {horsSemaine.length > 0 && (
        <Note ton="neutre">
          <span className="mt-px flex-none font-mono font-bold">·</span>
          <span>
            {horsSemaine.length} déplacement{horsSemaine.length > 1 ? 's' : ''} du plan{' '}
            {horsSemaine.length > 1 ? 'concernent' : 'concerne'} d’autres semaines de l’horizon (
            {fmtH(sommeHeures(horsSemaine))} h). {horsSemaine.length > 1 ? 'Ils ne' : 'Il ne'}{' '}
            change{horsSemaine.length > 1 ? 'nt' : ''} rien au profil de cette semaine :{' '}
            {horsSemaine.length > 1
              ? 'ils ne sont ni affichés ni appliqués'
              : 'il n’est ni affiché ni appliqué'}{' '}
            ici. Ouvrir la semaine concernée pour les traiter.
          </span>
        </Note>
      )}

      {/* La matière est une information MÉTIER de première importance : elle dit
          que le pic ne se résorbera pas par la négociation commerciale seule. */}
      {bloquees.length > 0 && (
        <details className="border-t border-rule-soft px-5 py-1.5">
          <summary className="cursor-pointer font-mono text-[10px] font-semibold text-foreground marker:text-muted-foreground">
            <span style={{ color: 'var(--color-planifie)' }}>
              {bloquees.length} ligne{bloquees.length > 1 ? 's' : ''} n’
              {bloquees.length > 1 ? 'ont' : 'a'} pas pu être avancée
              {bloquees.length > 1 ? 's' : ''} — la matière ne suit pas
            </span>
            <span className="ml-2 font-normal text-muted-foreground">
              {fmtH(sommeHeures(bloquees))} h · le levier est chez l’approvisionneur
            </span>
          </summary>
          <ul className="mt-1 space-y-1 pb-1">
            {bloquees.map((l) => (
              <li key={cleLigne(l.numCommande, l.ligne)} className="text-[11px] leading-snug">
                <span className="font-mono font-bold">{l.article}</span>
                <span className="text-muted-foreground"> · {l.client ?? '—'}</span>
                <span className="text-muted-foreground"> · {fmtH(l.heures)} h</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {l.dateActuelle} — avançable au {l.auPlusTotSansMatiere} sans contrainte
                  matière, au {l.auPlusTot} avec ({l.joursOuvresPerdus} j ouvré
                  {l.joursOuvresPerdus > 1 ? 's' : ''} perdu
                  {l.joursOuvresPerdus > 1 ? 's' : ''})
                </span>
                {l.composants.length > 0 && (
                  <ul className="ml-4 mt-px">
                    {l.composants.map((c) => (
                      <li key={c.article} className="font-mono text-[10px] text-muted-foreground">
                        {c.article}
                        {c.designation ? ` — ${c.designation}` : ''} · {fmtQ(c.quantite)} u ·{' '}
                        {c.inconnu ? (
                          <span style={{ color: 'var(--color-destructive)' }}>
                            absent de la projection (on ne sait rien, donc on ne bouge pas)
                          </span>
                        ) : (
                          `disponible le ${c.disponibleLe}`
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Ruptures que le plan CRÉERAIT — distinctes de celles qui préexistent. */}
      {plan.borneMatiere.alertes.length > 0 && (
        <Note ton="danger">
          <TriangleAlert size={12} className="mt-px flex-none" />
          <span>
            <b>
              Le plan créerait {plan.borneMatiere.alertes.length} rupture
              {plan.borneMatiere.alertes.length > 1 ? 's' : ''}
            </b>{' '}
            (elles n’existent pas aujourd’hui — deux lignes avancées peuvent réserver deux fois la
            même marge) :{' '}
            {plan.borneMatiere.alertes.map((a, i) => (
              <span key={`${a.article}-${a.dateIso}`} className="font-mono">
                {i > 0 && ' · '}
                {a.article} le {a.date} · manque {fmtQ(a.manque)} u
              </span>
            ))}
          </span>
        </Note>
      )}

      {/* Limites de la borne, rédigées serveur — affichées telles quelles. */}
      {plan.borneMatiere.avertissements.length > 0 && (
        <details className="border-t border-rule-soft px-5 py-1.5">
          <summary className="cursor-pointer font-mono text-[10px] text-muted-foreground">
            Ce que la borne matière ne voit pas ({plan.borneMatiere.avertissements.length})
          </summary>
          <ul className="mt-1 space-y-px pb-1">
            {plan.borneMatiere.avertissements.map((a) => (
              <li key={a} className="text-[11px] leading-snug text-muted-foreground">
                — {a}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Bandeau d'une seule ligne — états sans plan (invite, calcul, erreur). */
function Bande({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-none items-center gap-2 border-b border-border bg-brand-soft/40 px-5 py-2">
      {children}
    </div>
  )
}

/** Note d'une ligne sous le bandeau — même gouttière que le reste du panneau. */
function Note({ ton, children }: { ton: 'danger' | 'neutre'; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-1.5 border-t border-rule-soft px-5 py-1.5 text-[11px] leading-snug',
        ton === 'danger' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {children}
    </div>
  )
}

/**
 * Proposition portée par UNE ligne de la table : la date visée, située quand
 * elle sort de la semaine ouverte, et le geste qui l'applique.
 *
 * Volontairement dans ce fichier plutôt que dans la table : c'est le même objet
 * métier que le bandeau ci-dessus, et les deux doivent dire la même chose d'une
 * même ligne.
 */
export function PropositionCell(props: {
  /** Déplacement proposé pour la ligne de commande de cette ligne de besoin. */
  deplacement: {
    dateProposeeIso: string
    dateProposee: string
    sens: 'avance' | 'retard'
    joursOuvres: number
    heures: number
  }
  /** Situation de la destination hors de la semaine ouverte, sinon `null`. */
  situation: string | null
  /** Date X3 d’origine (affichée au survol du bouton rétablir). */
  dateX3?: string | null
  applique: boolean
  /** Vrai si n’importe quelle action est en cours (désactive le bouton pour éviter les clics concurrents). */
  disabled?: boolean
  /** Vrai si CETTE ligne est en cours de traitement (affiche '…'). */
  busy: boolean
  onAppliquer: () => void
  onRetablir: () => void
}) {
  const { deplacement: d } = props
  const sens = d.sens === 'avance' ? 'avancée' : 'retardée'
  const isDisabled = props.disabled ?? props.busy
  return (
    <div className="flex items-center gap-1.5 truncate">
      <span
        className="flex-none font-mono text-[10px] font-bold tabular-nums"
        style={{ color: props.applique ? 'var(--color-ferme)' : 'var(--color-brand)' }}
        title={`${sens} de ${d.joursOuvres} jour${d.joursOuvres > 1 ? 's' : ''} ouvré${d.joursOuvres > 1 ? 's' : ''} — ${fmtH(d.heures)} h de charge suivent la ligne`}
      >
        → {d.dateProposee}
      </span>
      {/* Une destination hors de la semaine ouverte est datée ET située :
          sans ça, la ligne disparaîtrait de l'écran au rafraîchissement. */}
      {props.situation && (
        <span
          className="flex-none rounded-sm px-1 py-px font-mono text-[9px] font-semibold"
          style={{
            color: 'var(--color-planifie)',
            background: 'color-mix(in srgb, var(--color-planifie) 12%, transparent)',
          }}
          title="Cette ligne quitte la semaine affichée : elle se retrouvera dans cette semaine-là"
        >
          {props.situation}
        </span>
      )}
      {props.applique ? (
        <button
          type="button"
          disabled={isDisabled}
          onClick={props.onRetablir}
          className="flex-none font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:underline disabled:opacity-45"
          title={
            props.dateX3
              ? `Supprime la date locale et rend à la ligne sa date X3 d’origine (${props.dateX3})`
              : 'Supprime la date locale et rend à la ligne sa date X3 d’origine'
          }
        >
          {props.busy ? '…' : 'rétablir'}
        </button>
      ) : (
        <button
          type="button"
          disabled={isDisabled}
          onClick={props.onAppliquer}
          className="flex-none rounded-sm border border-brand/50 px-1.5 py-px font-mono text-[9px] font-bold uppercase tracking-wider text-brand hover:bg-brand-soft disabled:opacity-45"
        >
          {props.busy ? '…' : 'appliquer'}
        </button>
      )}
    </div>
  )
}
