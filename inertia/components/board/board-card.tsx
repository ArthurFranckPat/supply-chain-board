import { Show, type Component, type JSX } from 'solid-js'
import { cx } from '@/libs/cva'
import { TYPO_META } from '@/lib/board/types'

/**
 * BoardCard « Papier » — carte unifiée du board.
 *
 * Un composant, deux variantes :
 *  • commande — board planification (numCommande·ligne, client, type MTS/MTO).
 *  • of       — board ordonnancement (OF, progression qty fait/lancé, poste,
 *               alerte rupture quand bloqué).
 *
 * Coquille partagée : ~176 px, liseré supérieur 3 px = ton du statut, badge
 * faisabilité au coin. cours → point terra pulsant ; terminé → coche muted +
 * carte atténuée ; bloqué → liseré rouge (+ ligne d'alerte côté OF).
 *
 * Statut → ton : ferme / planifié / suggéré / cours(terra) / terminé(muted) /
 * bloqué(destructive). Prototype : design/mockups/cards/board-card-prototypes.html
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
 * Type commande → couleur (MTS/MTO/NOR). Tons puisés dans le thème Papier :
 *  • MTS (Make To Stock)   → vert ferme   (production sur stock, stable)
 *  • MTO (Make To Order)   → terra        (production sur commande spécifique)
 *  • NOR (standard)        → bleu planifié (mode normal)
 * Type inconnu → pastille neutre (secondary) par défaut.
 */
const TYPE_META: Record<string, { background: string; color: string }> = {
  MTS: { background: '#5b7d4e', color: '#ffffff' },
  MTO: { background: '#a8431f', color: '#ffffff' },
  NOR: { background: '#2f4858', color: '#ffffff' },
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
  class?: string
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

export const BoardCard: Component<BoardCardProps> = (props) => {
  // commande modifiée (override local) → liseré terra autour de la carte
  const ring = props.variant === 'commande' && props.mod
  // carte induite (ghost) → fond hachuré terra
  const ghost = props.variant === 'commande' && props.induit
  // #23 : badge retard — accessor (pas une const figée) pour rester réactif au drag
  // live ; le narrowing de variant sur un Show inline ne passe pas le type union
  // BoardCardProps, d'où le detour par une fonction plutôt qu'un JSX inline direct.
  const retardJours = () => (props.variant === 'of' ? props.retardJours : undefined)
  const body: JSX.Element =
    props.variant === 'commande' ? (
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
    ) : (
      <OfBody
        status={props.status}
        article={props.article}
        articleRef={props.articleRef}
        title={props.title}
        poste={props.poste}
        progress={props.progress}
        alert={props.alert}
        hours={props.hours}
        consommeBouche={props.consommeBouche}
        typologie={props.typologie}
      />
    )

  return (
    <div
      class={cx(
        'relative w-full rounded-md border border-border border-t-[3px] bg-card px-3 pb-2 pt-2.5 shadow-[0_1px_2px_rgba(31,26,19,.05)]',
        TONE_BORDER[props.status],
        props.status === 'termine' && 'opacity-60',
        props.class
      )}
      style={
        ring
          ? { 'box-shadow': '0 0 0 1.5px var(--color-brand), 0 1px 2px rgba(31,26,19,.05)' }
          : ghost
            ? {
                'background-color': 'rgba(168,67,31,.07)',
                'background-image':
                  'repeating-linear-gradient(45deg, rgba(168,67,31,.12) 0 2px, transparent 2px 8px)',
              }
            : undefined
      }
    >
      {/* coin haut-droit : faisabilité, ou coche terminé */}
      <Show when={props.feas === 'ok'}>
        <CornerBadge cls="bg-ferme" icon="check" />
      </Show>
      <Show when={props.feas === 'bad'}>
        <CornerBadge cls="bg-destructive" icon="priority_high" />
      </Show>
      <Show when={!props.feas && props.status === 'termine'}>
        <CornerBadge cls="bg-muted-foreground" icon="check" />
      </Show>
      {/* cours : point terra pulsant (intérieur) */}
      <Show when={props.status === 'cours'}>
        <span class="absolute right-2.5 top-2.5 size-[7px] animate-pulse rounded-full bg-brand" />
      </Show>
      {/* Issue #23 : badge retard coin haut-gauche (« +N j ») — OF finissant après le
          besoin de sa commande. Disjoint du badge faisabilité (haut-droite) et de la
          sélection (haut-gauche, uniquement en selectMode). */}
      <Show when={(retardJours() ?? null) !== null && retardJours()! > 0}>
        <span class="absolute -top-1.5 left-2 flex h-4 items-center justify-center rounded-full border-2 border-card bg-error px-1 font-mono text-3xs font-bold tabular-nums text-card">
          +{retardJours()}j
        </span>
      </Show>
      {body}
    </div>
  )
}

/* ── Variante commande ── */
const CommandeBody: Component<{
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
}> = (p) => {
  const typo = () => (p.typologie ? TYPO_META[p.typologie] : undefined)
  const typeMeta = () => (p.type ? TYPE_META[p.type.toUpperCase()] : undefined)
  // p.article au format « numCommande·Ligne » (fmtRef) → on sépare pour bolder le n°.
  const refParts = () => p.article.split('·')
  const cmd = () => refParts()[0] ?? p.article
  const ligne = () => refParts()[1]
  return (
    <>
      {/* Type (MTS/MTO/NOR) à gauche + n° commande en gras + ligne plus claire.
          Pleine largeur (le tampon BDH est sur la ligne de l'article, pas ici). */}
      <div class="flex items-center gap-1.5 overflow-hidden" title={p.article}>
        <Show when={p.type}>
          <span
            class="shrink-0 rounded px-1 py-0.5 font-mono text-3xs font-bold uppercase tracking-wider"
            style={
              typeMeta() ?? {
                background: 'var(--color-secondary)',
                color: 'var(--color-secondary-foreground)',
              }
            }
          >
            {p.type}
          </span>
        </Show>
        <span class="shrink-0 whitespace-nowrap font-mono text-xs font-bold leading-tight text-foreground">
          {cmd()}
        </span>
        <Show when={ligne()}>
          <span class="shrink-0 font-mono text-2xs font-medium leading-tight text-muted-foreground">
            ·{ligne()}
          </span>
        </Show>
      </div>
      {/* Article (PF) + tampon « BDH » (consomme bouche, issue #42) sur la même ligne. */}
      <Show when={p.ord || p.consommeBouche}>
        <div class="mt-1 flex items-center justify-between gap-1.5">
          <div
            class="truncate font-mono text-xs font-semibold leading-tight text-brand"
            title={p.ord}
          >
            {p.ord}
          </div>
          <Show when={p.consommeBouche}>
            <span
              class="shrink-0 rotate-[-7deg] rounded border bg-card px-1.5 py-0.5 font-mono text-xs font-black uppercase tracking-wider opacity-70"
              style={{
                'color': 'var(--color-brand)',
                'border-color': 'var(--color-brand)',
                'text-shadow': '0 0 1px rgba(168,67,31,.35)',
              }}
            >
              BDH
            </span>
          </Show>
        </div>
      </Show>
      <div class="truncate text-xs font-medium leading-tight text-muted-foreground" title={p.title}>
        {p.title}
      </div>
      <Show when={p.client}>
        <div class="mt-0.5 truncate font-fraunces text-xs italic text-muted-foreground">
          {p.client}
        </div>
      </Show>
      <Show when={p.alert}>
        <div class="mt-1.5 flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-[3px] font-mono text-2xs font-bold text-destructive">
          <span class="material-symbols-outlined text-xs">warning</span>
          {p.alert}
        </div>
      </Show>
      {/* Footer V1 (issue #42) : pastille typo pleine + type (gauche), qté mise en
          avant + heures (droite). flex-wrap pour éviter l'overflow horizontal. */}
      <div class="mt-2 flex flex-wrap items-center gap-1 border-t border-rule-soft pt-1.5">
        <Show when={p.mod}>
          <span class="inline-flex items-center gap-0.5 font-mono text-3xs font-semibold uppercase tracking-wider text-suggere">
            <span class="material-symbols-outlined text-xs">edit</span>
          </span>
        </Show>
        <Show when={typo()}>
          {(t) => (
            <span
              class="rounded px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider"
              style={{ background: t().color, color: t().text }}
            >
              {t().label}
            </span>
          )}
        </Show>
        <span class="ml-auto flex items-baseline gap-1">
          <Show when={p.qty !== undefined}>
            <span class="font-fraunces text-base font-bold leading-none tabular-nums text-foreground">
              {p.qty}
            </span>
          </Show>
          <span class="text-2xs font-medium tabular-nums text-muted-foreground">{p.hours}h</span>
        </span>
      </div>
    </>
  )
}

/* ── Variante OF (approche B : progression + alerte) ── */
const OfBody: Component<{
  status: CardStatus
  article: string
  articleRef?: string
  title: string
  poste?: string
  progress?: { done: number; total: number }
  alert?: string
  hours: string
  consommeBouche?: boolean
  typologie?: string
}> = (p) => {
  const typo = () => (p.typologie ? TYPO_META[p.typologie] : undefined)
  const pct = () =>
    p.progress && p.progress.total > 0
      ? Math.min(100, Math.round((p.progress.done / p.progress.total) * 100))
      : 0
  return (
    <>
      {/* Tampon « BDH » = consomme une bouche (issue #42). Absolu, fond carte pour
          masquer proprement — le n° OF garde toute la largeur (pas de troncature). */}
      <Show when={p.consommeBouche}>
        <span
          class="absolute right-1.5 top-1.5 rotate-[-7deg] rounded border bg-card px-1.5 py-0.5 font-mono text-xs font-black uppercase tracking-wider opacity-70"
          style={{
            'color': 'var(--color-brand)',
            'border-color': 'var(--color-brand)',
            'text-shadow': '0 0 1px rgba(168,67,31,.35)',
          }}
        >
          BDH
        </span>
      </Show>
      {/* N° OF — pleine largeur (truncate seulement si réellement trop long). */}
      <div class="truncate font-mono text-xs font-bold leading-tight text-foreground">
        {p.article}
      </div>
      <Show when={p.articleRef}>
        <div class="truncate font-mono text-xs font-semibold leading-tight text-brand">
          {p.articleRef}
        </div>
      </Show>
      <div class="mt-1 truncate text-xs font-semibold text-foreground">{p.title}</div>
      <Show when={p.progress}>
        <div class="mt-2 flex items-center gap-1.5">
          <span class="h-[5px] flex-1 overflow-hidden rounded-full bg-rule-soft">
            <span
              class={cx('block h-full rounded-full', TONE_FILL[p.status])}
              style={{ width: `${pct()}%` }}
            />
          </span>
          <span class="font-mono text-2xs font-bold text-secondary-foreground">
            {p.progress!.done}/{p.progress!.total}
          </span>
        </div>
      </Show>
      <Show when={p.alert}>
        <div class="mt-1.5 flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-[3px] font-mono text-2xs font-bold text-destructive">
          <span class="material-symbols-outlined text-xs">warning</span>
          {p.alert}
        </div>
      </Show>
      {/* Footer mono-ligne (hauteur fixe) : point couleur typo + label · heures. */}
      <div class="mt-2 flex items-center gap-1.5 border-t border-rule-soft pt-1.5">
        <Show when={typo()}>
          {(t) => (
            <span class="inline-flex items-center gap-1 font-mono text-2xs font-bold uppercase tracking-wider text-secondary-foreground">
              <span class="size-[8px] rounded-[2px]" style={{ background: t().color }} />
              {t().label}
            </span>
          )}
        </Show>
        <span class="ml-auto font-fraunces text-sm font-bold tabular-nums">
          {p.hours}
          <span class="ml-0.5 text-2xs font-medium text-muted-foreground">h</span>
        </span>
      </div>
    </>
  )
}

const CornerBadge: Component<{ cls: string; icon: string }> = (p) => (
  <span
    class={cx(
      'absolute -top-1.5 right-2 flex size-4 items-center justify-center rounded-full border-2 border-card text-card',
      p.cls
    )}
  >
    <span class="material-symbols-outlined text-xs font-bold">{p.icon}</span>
  </span>
)

export default BoardCard
