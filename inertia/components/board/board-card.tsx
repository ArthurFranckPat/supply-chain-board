import { Show, type Component, type JSX } from 'solid-js'
import { cx } from '@/libs/cva'

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
  cours: 'border-t-terra',
  termine: 'border-t-muted-foreground',
  bloque: 'border-t-destructive',
}
/** Remplissage (barre de progression, point poste) = ton du statut. */
const TONE_FILL: Record<CardStatus, string> = {
  ferme: 'bg-ferme',
  planifie: 'bg-planifie',
  suggere: 'bg-suggere',
  cours: 'bg-terra',
  termine: 'bg-muted-foreground',
  bloque: 'bg-destructive',
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
}

export type OfCardProps = Common & {
  variant: 'of'
  /** Poste de charge (pied gauche, point = ton). */
  poste?: string
  /** Progression qty fait/lancé (barre). */
  progress?: { done: number; total: number }
  /** Alerte rupture (ligne, statut bloqué). */
  alert?: string
}

export type BoardCardProps = CommandeCardProps | OfCardProps

export const BoardCard: Component<BoardCardProps> = (props) => {
  // commande modifiée (override local) → liseré terra autour de la carte
  const ring = props.variant === 'commande' && props.mod
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
      />
    ) : (
      <OfBody
        status={props.status}
        article={props.article}
        title={props.title}
        poste={props.poste}
        progress={props.progress}
        alert={props.alert}
        hours={props.hours}
      />
    )

  return (
    <div
      class={cx(
        'relative w-full rounded-md border border-border border-t-[3px] bg-card px-3 pb-2 pt-2.5 shadow-[0_1px_2px_rgba(31,26,19,.05)]',
        TONE_BORDER[props.status],
        props.status === 'termine' && 'opacity-60',
        props.class,
      )}
      style={
        ring
          ? { 'box-shadow': '0 0 0 1.5px var(--color-terra), 0 1px 2px rgba(31,26,19,.05)' }
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
        <span class="absolute right-2.5 top-2.5 size-[7px] animate-pulse rounded-full bg-terra" />
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
}> = (p) => (
  <>
    <div class="font-mono text-[12px] font-semibold leading-tight">{p.article}</div>
    <div class="mt-0.5 text-[11px] font-semibold leading-snug">
      {p.ord && <span class="text-foreground">{p.ord} </span>}
      <span class="font-normal text-muted-foreground">· {p.title}</span>
    </div>
    <Show when={p.client}>
      <div class="mt-0.5 truncate font-fraunces text-[11px] italic text-muted-foreground">
        {p.client}
      </div>
    </Show>
    <div class="mt-2 flex items-center gap-2 border-t border-rule-soft pt-1.5">
      <Show when={p.mod}>
        <span class="inline-flex items-center gap-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-suggere">
          <span class="material-symbols-outlined text-[11px]">edit</span>Mod.
        </span>
      </Show>
      <Show when={p.type}>
        <span class="rounded bg-terra-soft px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-terra">
          {p.type}
        </span>
      </Show>
      <span class="ml-auto font-fraunces text-[14px] font-bold tabular-nums">{p.hours}</span>
    </div>
  </>
)

/* ── Variante OF (approche B : progression + alerte) ── */
const OfBody: Component<{
  status: CardStatus
  article: string
  title: string
  poste?: string
  progress?: { done: number; total: number }
  alert?: string
  hours: string
}> = (p) => {
  const pct = () =>
    p.progress && p.progress.total > 0
      ? Math.min(100, Math.round((p.progress.done / p.progress.total) * 100))
      : 0
  return (
    <>
      <div class="font-mono text-[12px] font-semibold leading-tight">{p.article}</div>
      <div class="mt-0.5 truncate text-[11px] font-semibold text-foreground">{p.title}</div>
      <Show when={p.progress}>
        <div class="mt-2 flex items-center gap-1.5">
          <span class="h-[5px] flex-1 overflow-hidden rounded-full bg-rule-soft">
            <span
              class={cx('block h-full rounded-full', TONE_FILL[p.status])}
              style={{ width: `${pct()}%` }}
            />
          </span>
          <span class="font-mono text-[9px] font-bold text-secondary-foreground">
            {p.progress!.done}/{p.progress!.total}
          </span>
        </div>
      </Show>
      <Show when={p.alert}>
        <div class="mt-1.5 flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-[3px] font-mono text-[9px] font-bold text-destructive">
          <span class="material-symbols-outlined text-[12px]">warning</span>
          {p.alert}
        </div>
      </Show>
      <div class="mt-2 flex items-center gap-2 border-t border-rule-soft pt-1.5">
        <Show when={p.poste}>
          <span class="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-secondary-foreground">
            <span class={cx('size-[7px] rounded-[2px]', TONE_FILL[p.status])} />
            {p.poste}
          </span>
        </Show>
        <span class="ml-auto font-fraunces text-[14px] font-bold tabular-nums">{p.hours}</span>
      </div>
    </>
  )
}

const CornerBadge: Component<{ cls: string; icon: string }> = (p) => (
  <span
    class={cx(
      'absolute -top-1.5 right-2 flex size-4 items-center justify-center rounded-full border-2 border-card text-card',
      p.cls,
    )}
  >
    <span class="material-symbols-outlined text-[12px] font-bold">{p.icon}</span>
  </span>
)

export default BoardCard
