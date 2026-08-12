/**
 * Colonnes du séquenceur — API `ColumnDef` du DataTable maison (§6 du plan,
 * composant « DataTable » de la vitrine `/design-system`).
 *
 * La grille CSS faite à la main (12 colonnes en `grid-cols-[…]`, deux gabarits
 * selon qu'un poste est filtré) a disparu au profit d'une vraie `<table>` : tri
 * par en-tête, colonnes figées, virtualisation et sémantique de tableau
 * viennent du composant, plus de la page.
 *
 * Densité : cellules à deux lignes (valeur forte + qualificatif atténué), même
 * recette que les colonnes du Suivi — c'est ce qui permet de passer de 12
 * colonnes à 10 sans rien perdre.
 */
import { Badge } from '@r/components/ui/badge'
import type { ColumnDef } from '@r/components/ui/data-table'
import { X3Link } from '@r/components/x3-link'
import { cn } from '@r/lib/utils'
import { fmtDateFr, fmtH, fmtJ, urgencyColor, urgencyOf } from '@r/lib/board/engagement-format'
import type { FeasStatus } from '@r/lib/board/types'
import type { BatchItem } from '@r/components/sequenceur/sequenceur-firm-bar'
import { STATUS_BADGE, affirmable, feasBadge, type SequenceurRow } from './shared'

export interface SequenceurColumnsDeps {
  /** Vue tous postes : la colonne POSTE n'existe que là. */
  showPosteCol: boolean
  feasibility: Record<string, FeasStatus>
  /** Le calcul a tourné — avant, une colonne de « N/D » n'apprendrait rien. */
  feasDone: boolean
  selected: Set<string>
  batch: Record<string, BatchItem>
  batchRunning: boolean
  onToggleSelect: (numOf: string) => void
  onOpenOf: (numOf: string) => void
}

/** Micro-libellé d'appoint sous une valeur forte. */
const SUB = 'truncate text-2xs text-muted-foreground'

export function createSequenceurColumns(deps: SequenceurColumnsDeps): ColumnDef<SequenceurRow>[] {
  const cols: ColumnDef<SequenceurRow>[] = []

  /* ── Sélection ─────────────────────────────────────────────────────── */
  cols.push({
    id: 'select',
    header: () => <span className="sr-only">Sélection</span>,
    enableSorting: false,
    cell: ({ row }) => {
      const r = row.original
      if (!affirmable(r.status)) {
        // Un OF ferme est déjà lancé : pas de case grisée qui laisse croire
        // qu'un réglage manque, rien du tout.
        return <span aria-hidden="true" />
      }
      return (
        <label className="flex cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            className="size-3.5"
            style={{ accentColor: 'var(--primary)' }}
            checked={deps.selected.has(r.numOf)}
            disabled={deps.batchRunning}
            onChange={() => deps.onToggleSelect(r.numOf)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Sélectionner ${r.numOf}`}
          />
        </label>
      )
    },
    meta: { thClass: 'w-8 px-2', tdClass: 'px-2' },
  })

  /* ── Poste (vue tous postes) ───────────────────────────────────────── */
  if (deps.showPosteCol) {
    cols.push({
      accessorKey: 'posteCode',
      id: 'poste',
      header: 'Poste',
      cell: ({ row }) => (
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-mono text-xs font-bold text-foreground">
            {row.original.posteCode}
          </span>
          <span className={SUB} title={row.original.posteLabel}>
            {row.original.posteLabel || '—'}
          </span>
        </span>
      ),
      meta: { thClass: 'w-[130px] text-left' },
    })
  }

  /* ── OF ────────────────────────────────────────────────────────────── */
  cols.push({
    accessorKey: 'numOf',
    id: 'numOf',
    header: 'OF',
    cell: ({ row }) => {
      const r = row.original
      const b = deps.batch[r.numOf]
      return (
        <span className="flex min-w-0 flex-col gap-px">
          <button
            type="button"
            className="truncate rounded text-left font-mono text-xs font-bold text-foreground outline-ring hover:text-foreground/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
            title={`Détail de l'OF ${r.numOf}`}
            onClick={(e) => {
              e.stopPropagation()
              deps.onOpenOf(r.numOf)
            }}
          >
            {r.numOf}
          </button>
          {/* Retour d'affermissement : le n° d'OF créé, ou le refus de X3 —
              là où l'opérateur regarde déjà, pas dans un toast déjà parti. */}
          {b?.st === 'ok' && (
            <span className="truncate font-mono text-2xs font-semibold text-ferme">→ {b.msg}</span>
          )}
          {b?.st === 'error' && (
            <span
              className="truncate font-mono text-2xs font-semibold text-destructive"
              title={b.msg}
            >
              {b.msg}
            </span>
          )}
          {b?.st === 'running' && <span className={SUB}>Affermissement…</span>}
        </span>
      )
    },
    meta: { thClass: 'w-[112px] text-left' },
  })

  /* ── Statut ────────────────────────────────────────────────────────── */
  cols.push({
    accessorKey: 'status',
    id: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const r = row.original
      const k = r.status
      // Un WIPSTA hors 1/2/3 (clos, par exemple) n'a pas de place ici : la page
      // ne prétend pas le qualifier.
      if (k !== 1 && k !== 2 && k !== 3) {
        return <span className="text-2xs text-muted-foreground">—</span>
      }
      return (
        <Badge variant={STATUS_BADGE[k]} className="font-mono text-2xs font-semibold">
          {r.statusLabel ?? '—'}
        </Badge>
      )
    },
    meta: { thClass: 'w-[96px] text-left' },
  })

  /* ── Article · Désignation ─────────────────────────────────────────── */
  cols.push({
    accessorKey: 'article',
    id: 'article',
    header: 'Article · Désignation',
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-mono text-xs font-bold text-foreground">
          {row.original.article}
        </span>
        <span className={SUB} title={row.original.designation ?? undefined}>
          {row.original.designation || '—'}
        </span>
      </span>
    ),
    meta: { thClass: 'w-[240px] text-left' },
  })

  /* ── Avancement ────────────────────────────────────────────────────── */
  cols.push({
    id: 'avancement',
    accessorFn: (r) => (r.launched > 0 ? r.done / r.launched : -1),
    header: 'Avancement',
    cell: ({ row }) => {
      const r = row.original
      const pct = r.launched > 0 ? Math.min(100, Math.round((r.done / r.launched) * 100)) : null
      return (
        <span className="flex min-w-0 flex-col items-end gap-px">
          <span className="font-mono text-cell-lg font-bold leading-none tabular-nums text-foreground">
            {r.done}
            <span className="ml-1 text-3xs font-medium text-muted-foreground">/ {r.launched}</span>
          </span>
          <span
            className={cn(
              'text-2xs tabular-nums',
              pct === 100 ? 'text-ferme' : 'text-muted-foreground'
            )}
          >
            {pct === null ? '—' : `${pct} %`}
          </span>
        </span>
      )
    },
    meta: { thClass: 'w-[100px] text-right!', tdClass: 'text-right' },
  })

  /* ── Faisabilité ───────────────────────────────────────────────────── */
  cols.push({
    id: 'faisabilite',
    accessorFn: (r) => deps.feasibility[r.numOf]?.st ?? '',
    header: 'Faisabilité',
    cell: ({ row }) => {
      const r = row.original
      const feas = deps.feasibility[r.numOf]
      // Tant que le calcul n'a pas tourné, une colonne entière de « N/D »
      // ferait croire à un verdict. Un tiret dit « pas encore demandé ».
      if (!feas && !deps.feasDone) {
        return <span className="text-2xs text-muted-foreground">—</span>
      }
      const badge = feasBadge(feas?.st ?? 'unknown', r.status)
      const Icon = badge.icon
      return (
        <Badge
          variant={badge.variant}
          className="gap-1 font-mono text-2xs font-semibold"
          title={
            feas?.st === 'blocked'
              ? `Rupture : ${feas.missing.join(', ') || 'composant(s)'}`
              : feas?.st === 'qc'
                ? 'Couverture dépendante du stock sous contrôle qualité'
                : undefined
          }
        >
          <Icon strokeWidth={2} aria-hidden="true" />
          {badge.label}
        </Badge>
      )
    },
    meta: { thClass: 'w-[112px] text-left' },
  })

  /* ── Commande(s) · Client ──────────────────────────────────────────── */
  cols.push({
    id: 'commande',
    accessorFn: (r) => r.commandes[0]?.numCommande ?? '',
    header: 'Commande(s) · Client',
    cell: ({ row }) => {
      const cmds = row.original.commandes
      if (cmds.length === 0) {
        return <span className="font-mono text-2xs text-muted-foreground">—</span>
      }
      return (
        <span className="flex min-w-0 flex-col gap-1">
          {cmds.map((c) => (
            <span key={c.numCommande + (c.ligne ?? '')} className="flex min-w-0 flex-col gap-px">
              <span className="flex items-center gap-1 overflow-hidden">
                <X3Link
                  fonction="GESSOH"
                  cle={c.numCommande}
                  title={`Ouvrir la commande ${c.numCommande} dans Sage X3`}
                  className="shrink-0 whitespace-nowrap font-mono text-xs font-bold text-foreground"
                >
                  {c.numCommande}
                </X3Link>
                {c.ligne && (
                  <span className="shrink-0 whitespace-nowrap font-mono text-2xs text-muted-foreground">
                    ·L{c.ligne}
                  </span>
                )}
              </span>
              {c.client && (
                <span className={SUB} title={c.client}>
                  {c.client}
                </span>
              )}
            </span>
          ))}
        </span>
      )
    },
    meta: { thClass: 'w-[180px] text-left' },
  })

  /* ── Livraison ─────────────────────────────────────────────────────── */
  cols.push({
    accessorKey: 'livraisonIso',
    id: 'livraison',
    header: 'Livraison',
    cell: ({ row }) => {
      const iso = row.original.livraisonIso
      const u = urgencyOf(iso)
      return (
        <span className={cn('font-mono text-1.5xs font-bold tabular-nums', urgencyColor(u))}>
          {iso ? fmtDateFr(iso) : '—'}
        </span>
      )
    },
    meta: { thClass: 'w-[96px] text-left' },
  })

  /* ── Heures · Jours ────────────────────────────────────────────────── */
  cols.push({
    accessorKey: 'hours',
    id: 'heures',
    header: 'Charge',
    cell: ({ row }) => (
      <span className="flex min-w-0 flex-col items-end gap-px">
        <span className="font-mono text-cell-lg font-bold leading-none tabular-nums text-foreground">
          {fmtH(row.original.hours)}
          <span className="ml-1 text-3xs font-medium text-muted-foreground">h</span>
        </span>
        <span className="text-2xs tabular-nums text-muted-foreground">
          {fmtJ(row.original.hours)} j
        </span>
      </span>
    ),
    meta: { thClass: 'w-[92px] text-right!', tdClass: 'text-right' },
  })

  return cols
}
