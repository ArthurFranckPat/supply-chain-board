import { Pencil, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { TYPO_META } from '@/lib/board/types'
import { DynamicIcon } from '../ui/dynamic-icon'

/**
 * BoardCard « Papier » — carte unifiée du board.
 *
 * Un composant, deux variantes :
 *  • commande — board planification (numCommande·ligne, client, type MTS/MTO).
 *  • of       — board ordonnancement (OF, progression qty fait/lancé, poste,
 *               alerte rupture quand bloqué).
 *
 * La variante OF est une carte « Listing » (grammaire Airbnb, validée 2026-07-20) :
 * bande de statut en dégradé doux tenant lieu de « photo », motif code produit,
 * n° OF en ancre, heure de charge au pied, flottement au survol. La variante
 * commande garde la coquille historique (liseré 3 px). Badge faisabilité au coin,
 * cours → point pulsant, terminé → atténuée, bloqué → rouge + alerte rupture.
 *
 * Statut → ton : ferme / planifié / suggéré / cours(brand) / terminé(muted) /
 * bloqué(destructive). Maquette : design/showcase/airbnb-composants.html (§03).
 */

export type CardStatus = 'ferme' | 'planifie' | 'suggere' | 'cours' | 'termine' | 'bloque'

/** Liseré supérieur (3 px) = ton du statut. */
const TONE_BORDER: Record<CardStatus, string> = {
  ferme: 'border-t-ferme',
  planifie: 'border-t-planifie',
  suggere: 'border-t-suggere',
  cours: 'border-t-brand',
  termine: 'border-t-muted-foreground',
  bloque: 'border-t-destructive',
}
/** Remplissage (barre de progression, point poste) = ton du statut. */
const TONE_FILL: Record<CardStatus, string> = {
  ferme: 'bg-ferme',
  planifie: 'bg-planifie',
  suggere: 'bg-suggere',
  cours: 'bg-brand',
  termine: 'bg-muted-foreground',
  bloque: 'bg-destructive',
}
/**
 * Ton CSS du bandeau « Listing » (variante OF) — décliné en dégradé doux via
 * color-mix dans OfListingCard. Le bandeau remplace le liseré 3 px : c'est la
 * « photo » de la carte, façon annonce Airbnb.
 */
const BAND_TONE: Record<CardStatus, string> = {
  ferme: 'var(--ferme, #008049)',
  planifie: 'var(--planifie, #00a699)',
  suggere: 'var(--suggere, #fc642d)',
  cours: 'var(--color-brand, #ff385c)',
  termine: 'var(--color-muted-foreground, #717171)',
  bloque: 'var(--color-destructive, #ff385c)',
}
/** Libellé d'état du ruban de bandeau (signal fort, lisible en colonne dense). */
const STATUS_LABEL: Record<CardStatus, string> = {
  ferme: 'FERME',
  planifie: 'PLANIFIÉ',
  suggere: 'SUGGÉRÉ',
  cours: 'EN COURS',
  termine: 'TERMINÉ',
  bloque: 'BLOQUÉ',
}

/**
 * Type commande → couleur (MTS/MTO/NOR). Tokens de statut sémantiques
 * (retargetés par thème ; sous Airbnb = brand book ferme/suggere/planifie),
 * avec fallback hex pour les thèmes qui ne définiraient pas la variable :
 *  • MTS (Make To Stock)   → ferme    (production sur stock, stable)
 *  • MTO (Make To Order)   → suggere  (production sur commande spécifique)
 *  • NOR (standard)        → planifie (mode normal)
 * Type inconnu → pastille neutre (secondary) par défaut.
 */
const TYPE_META: Record<string, { background: string; color: string }> = {
  MTS: { background: 'var(--ferme, #008049)', color: '#ffffff' },
  MTO: { background: 'var(--suggere, #fc642d)', color: '#ffffff' },
  NOR: { background: 'var(--planifie, #00a699)', color: '#ffffff' },
}

type Common = {
  status: CardStatus
  /** En-tête mono (numOf ou code article). */
  article: string
  /** Désignation. */
  title: string
  /** Charge (heures), à droite du pied. */
  hours: string
  /** Badge faisabilité au coin (✓ réalisable / ! rupture). */
  feas?: 'ok' | 'bad'
  className?: string
}

export type CommandeCardProps = Common & {
  variant: 'commande'
  /** Réf. commande·ligne (ex. AR24518·L2). */
  ord?: string
  /** Client (ligne italique). */
  client?: string
  /** Type MTS/MTO/NOR (pastille terra). */
  type?: string
  /** Flag « modifié » (override local). */
  mod?: boolean
  /** Article dont la nomenclature contient un composant BDH (issue #28). */
  consommeBouche?: boolean
  /** Typologie X3 (TSICOD_4) du PF (issue #42). */
  typologie?: string
  /** Quantité (reste à livrer) — footer. */
  qty?: number
  /** Carte induite (besoin brut depth-1) : ghost hachuré, non-draggable. */
  induit?: boolean
  /** Alerte rupture (composants manquants des OF rattachés, agrégés côté store). */
  alert?: string
}

export type OfCardProps = Common & {
  variant: 'of'
  /** Réf. article PF (code article, sous le n° d'OF). */
  articleRef?: string
  /** Poste de charge (pied gauche, point = ton). */
  poste?: string
  /** Progression qty fait/lancé (barre). */
  progress?: { done: number; total: number }
  /** Alerte rupture (ligne, statut bloqué). */
  alert?: string
  /** OF dont la nomenclature contient un composant BDH (issue #28). */
  consommeBouche?: boolean
  /** Typologie fine X3 (TSICOD_4) du PF — ex: ESH10, ESH30 (issue #42). */
  typologie?: string
  /** Forme produit : KIT vs GPE (issue #42). */
  kitGpe?: 'KIT' | 'GPE'
  /** Issue #23 : écart (jours) au besoin de la commande — badge « +N j » si > 0 (retard).
   *  null/undefined = pas de verdict (OF sans lien / donnée manquante). */
  retardJours?: number | null
}

export type BoardCardProps = CommandeCardProps | OfCardProps

export function BoardCard(props: BoardCardProps) {
  // Variante OF = carte « Listing » (grammaire Airbnb, validée 2026-07-20 —
  // variante A de la maquette design/showcase/airbnb-composants.html). La
  // variante commande garde la coquille historique (non touchée).
  return props.variant === 'of' ? <OfListingCard {...props} /> : <CommandeCard {...props} />
}

/* ── Coquille historique (variante commande) ── */
function CommandeCard(props: CommandeCardProps) {
  // commande modifiée (override local) → liseré terra autour de la carte
  const ring = props.mod
  // carte induite (ghost) → fond hachuré terra
  const ghost = props.induit

  return (
    <div
      className={cn(
        'relative w-full rounded-md border border-border border-t-[3px] bg-card px-3 pb-2 pt-2.5 shadow-[0_1px_2px_rgba(0,0,0,.05)]',
        TONE_BORDER[props.status],
        props.status === 'termine' && 'opacity-60',
        props.className
      )}
      style={
        ring
          ? { boxShadow: '0 0 0 1.5px var(--color-brand), 0 1px 2px rgba(0,0,0,.05)' }
          : ghost
            ? {
                backgroundColor: 'rgba(0,0,0,.07)',
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(0,0,0,.12) 0 2px, transparent 2px 8px)',
              }
            : undefined
      }
    >
      {/* coin haut-droit : faisabilité, ou coche terminé */}
      {props.feas === 'ok' && <CornerBadge cls="bg-ferme" icon="check" />}
      {props.feas === 'bad' && <CornerBadge cls="bg-destructive" icon="priority_high" />}
      {!props.feas && props.status === 'termine' && <CornerBadge cls="bg-muted-foreground" icon="check" />}
      {/* cours : point terra pulsant (intérieur) */}
      {props.status === 'cours' && (
        <span className="absolute right-2.5 top-2.5 size-[7px] animate-pulse rounded-full bg-brand" />
      )}
      <CommandeBody
        article={props.article}
        title={props.title}
        ord={props.ord}
        client={props.client}
        type={props.type}
        mod={props.mod}
        hours={props.hours}
        consommeBouche={props.consommeBouche}
        typologie={props.typologie}
        qty={props.qty}
        induit={props.induit}
        alert={props.alert}
      />
    </div>
  )
}

/* ── Variante commande ── */
interface CommandeBodyProps {
  article: string
  title: string
  ord?: string
  client?: string
  type?: string
  mod?: boolean
  hours: string
  consommeBouche?: boolean
  typologie?: string
  qty?: number
  induit?: boolean
  alert?: string
}

function CommandeBody(p: CommandeBodyProps) {
  const typo = p.typologie ? TYPO_META[p.typologie] : undefined
  const typeMeta = p.type ? TYPE_META[p.type.toUpperCase()] : undefined
  // p.article au format « numCommande·Ligne » (fmtRef) → on sépare pour bolder le n°.
  const refParts = p.article.split('·')
  const cmd = refParts[0] ?? p.article
  const ligne = refParts[1]

  return (
    <>
      {/* Type (MTS/MTO/NOR) à gauche + n° commande en gras + ligne plus claire.
          Pleine largeur (le tampon BDH est sur la ligne de l'article, pas ici). */}
      <div className="flex items-center gap-1.5 overflow-hidden" title={p.article}>
        {p.type && (
          <span
            className="shrink-0 rounded px-1 py-0.5 font-mono text-3xs font-bold uppercase tracking-wider"
            style={
              typeMeta ?? {
                background: 'var(--color-secondary)',
                color: 'var(--color-secondary-foreground)',
              }
            }
          >
            {p.type}
          </span>
        )}
        <span className="shrink-0 whitespace-nowrap font-mono text-xs font-bold leading-tight text-foreground">
          {cmd}
        </span>
        {ligne && (
          <span className="shrink-0 font-mono text-2xs font-medium leading-tight text-muted-foreground">
            ·{ligne}
          </span>
        )}
      </div>
      {/* Article (PF) + tampon « BDH » (consomme bouche, issue #42) sur la même ligne. */}
      {(p.ord || p.consommeBouche) && (
        <div className="mt-1 flex items-center justify-between gap-1.5">
          <div
            className="truncate font-mono text-xs font-semibold leading-tight text-brand"
            title={p.ord}
          >
            {p.ord}
          </div>
          {p.consommeBouche && (
            <span
              className="shrink-0 rotate-[-7deg] rounded border bg-card px-1.5 py-0.5 font-mono text-xs font-black uppercase tracking-wider opacity-70"
              style={{
                color: 'var(--color-brand)',
                borderColor: 'var(--color-brand)',
                textShadow: '0 0 1px rgba(0,0,0,.35)',
              }}
            >
              BDH
            </span>
          )}
        </div>
      )}
      <div className="truncate text-xs font-medium leading-tight text-muted-foreground" title={p.title}>
        {p.title}
      </div>
      {p.client && (
        <div className="mt-0.5 truncate font-fraunces text-xs italic text-muted-foreground">
          {p.client}
        </div>
      )}
      {p.alert && (
        <div className="mt-1.5 flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-[3px] font-mono text-2xs font-bold text-destructive">
          <TriangleAlert size={12} strokeWidth={1.75} />
          {p.alert}
        </div>
      )}
      {/* Footer V1 (issue #42) : pastille typo pleine + type (gauche), qté mise en
          avant + heures (droite). flex-wrap pour éviter l'overflow horizontal. */}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-rule-soft pt-1.5">
        {p.mod && (
          <span className="inline-flex items-center gap-0.5 font-mono text-3xs font-semibold uppercase tracking-wider text-suggere">
            <Pencil size={12} strokeWidth={1.75} />
          </span>
        )}
        {typo && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider"
            style={{ background: typo.color, color: typo.text }}
          >
            {typo.label}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-1">
          {p.qty !== undefined && (
            <span className="font-fraunces text-base font-bold leading-none tabular-nums text-foreground">
              {p.qty}
            </span>
          )}
          <span className="text-2xs font-medium tabular-nums text-muted-foreground">{p.hours}h</span>
        </span>
      </div>
    </>
  )
}

/* ── Variante OF — carte « Listing » (grammaire Airbnb, variante A) ──
 *
 * Bande de statut en guise de « photo » (dégradé doux du ton, motif = code
 * produit/poste en mono translucide), puis hiérarchie claire : n° OF en gras,
 * désignation, progression, alerte, et l'heure de charge en ancre au pied.
 * Survol = léger flottement (comportement annonce Airbnb). Tous les signaux
 * existants sont préservés : faisabilité, point cours, badge retard, tampon
 * BDH, typologie, progression, alerte rupture.
 */
function OfListingCard(p: OfCardProps) {
  const typo = p.typologie ? TYPO_META[p.typologie] : undefined
  const tone = BAND_TONE[p.status]
  const pct =
    p.progress && p.progress.total > 0
      ? Math.min(100, Math.round((p.progress.done / p.progress.total) * 100))
      : 0

  return (
    <div
      className={cn(
        'relative w-full rounded-lg border border-border bg-card',
        'shadow-[0_1px_2px_rgba(0,0,0,.08)] transition-all duration-150',
        'hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,.14)]',
        p.status === 'termine' && 'opacity-60',
        p.className
      )}
    >
      {/* Ruban de statut — teinte douce + pastille + mot d'état saturé : signal
          fort, lisible même en colonne dense (remplace l'ancien liseré 3 px).
          Le « code fantôme » de la maquette est volontairement omis : en colonne
          de ~120 px il se tronquait et doublonnait le code article. overflow-hidden
          + coins arrondis SUR le ruban pour ne pas rogner les badges saillants. */}
      <div
        className="relative flex h-7 items-center gap-1.5 overflow-hidden rounded-t-[7px] px-2.5"
        style={{
          background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 16%, var(--card)), color-mix(in srgb, ${tone} 30%, var(--card)))`,
        }}
      >
        <span className="size-[7px] shrink-0 rounded-full" style={{ background: tone }} />
        <span
          className="shrink-0 font-mono text-[10px] font-extrabold uppercase leading-none tracking-[0.08em]"
          style={{ color: tone }}
        >
          {STATUS_LABEL[p.status]}
        </span>
        {/* cours : point Rausch pulsant à droite du ruban */}
        {p.status === 'cours' && (
          <span className="absolute right-2.5 top-1/2 size-[7px] -translate-y-1/2 animate-pulse rounded-full bg-brand" />
        )}
      </div>

      {/* Badges saillants, positionnés sur la bande (inchangés). */}
      {p.feas === 'ok' && <CornerBadge cls="bg-ferme" icon="check" />}
      {p.feas === 'bad' && <CornerBadge cls="bg-destructive" icon="priority_high" />}
      {!p.feas && p.status === 'termine' && <CornerBadge cls="bg-muted-foreground" icon="check" />}
      {/* Issue #23 : badge retard « +N j » (chevauche le haut de la bande). */}
      {(p.retardJours ?? null) !== null && p.retardJours! > 0 && (
        <span className="absolute -top-1.5 left-2 z-10 flex h-4 items-center justify-center rounded-full border-2 border-card bg-error px-1 font-mono text-3xs font-bold tabular-nums text-card">
          +{p.retardJours}j
        </span>
      )}

      {/* Corps */}
      <div className="relative px-2.5 pb-2 pt-1.5">
        {/* Tampon « BDH » (issue #42) — dans le corps, sous la bande. */}
        {p.consommeBouche && (
          <span
            className="absolute right-1.5 top-1 rotate-[-7deg] rounded border bg-card px-1.5 py-0.5 font-mono text-2xs font-black uppercase tracking-wider opacity-70"
            style={{
              color: 'var(--color-brand)',
              borderColor: 'var(--color-brand)',
              textShadow: '0 0 1px rgba(0,0,0,.35)',
            }}
          >
            BDH
          </span>
        )}
        {/* N° OF (ancre). Réserve à droite la place du tampon BDH si présent. */}
        <div
          className={cn(
            'truncate font-mono text-[13px] font-bold leading-tight text-foreground',
            p.consommeBouche && 'pr-9'
          )}
        >
          {p.article}
        </div>
        {/* Réf. article : mono gris discret (le rouge est réservé au danger/retard). */}
        {p.articleRef && (
          <div
            className={cn(
              'truncate font-mono text-xs font-medium leading-tight text-secondary-foreground',
              p.consommeBouche && 'pr-9'
            )}
          >
            {p.articleRef}
          </div>
        )}
        <div className="mt-0.5 truncate text-xs font-medium leading-tight text-muted-foreground" title={p.title}>
          {p.title}
        </div>
        {p.progress && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-rule-soft">
              <span
                className={cn('block h-full rounded-full', TONE_FILL[p.status])}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="font-mono text-3xs font-bold text-secondary-foreground">
              {p.progress.done}/{p.progress.total}
            </span>
          </div>
        )}
        {p.alert && (
          <div className="mt-1.5 flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-[3px] font-mono text-3xs font-bold text-destructive">
            <TriangleAlert size={12} strokeWidth={1.75} />
            {p.alert}
          </div>
        )}
        {/* Pied : typologie à gauche, heure de charge en ancre à droite (le
            « prix » de l'annonce). */}
        <div className="mt-1.5 flex items-baseline justify-between gap-1.5 border-t border-rule-soft pt-1">
          {typo ? (
            <span
              title={typo.label}
              className="inline-flex min-w-0 items-center gap-1 font-mono text-3xs font-bold uppercase text-secondary-foreground"
            >
              <span className="size-[8px] shrink-0 rounded-[2px]" style={{ background: typo.color }} />
              <span className="truncate">{typo.label}</span>
            </span>
          ) : (
            <span className="min-w-0" />
          )}
          <span className="shrink-0 font-fraunces text-base font-bold leading-none tabular-nums text-foreground">
            {p.hours}
            <span className="ml-0.5 text-2xs font-medium text-muted-foreground">h</span>
          </span>
        </div>
      </div>
    </div>
  )
}

interface CornerBadgeProps {
  cls: string
  icon: string
}

function CornerBadge(p: CornerBadgeProps) {
  return (
    <span
      className={cn(
        'absolute -top-1.5 right-2 flex size-4 items-center justify-center rounded-full border-2 border-card text-card',
        p.cls
      )}
    >
      <DynamicIcon name={p.icon} size={12} strokeWidth={1.75} />
    </span>
  )
}

export default BoardCard
