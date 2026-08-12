import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@r/lib/utils'

/**
 * TableRow — grammaire canonique d'une rangée de tableau.
 *
 * Modèle : la table proactive de /suivi. Elle porte déjà les cinq décisions qui
 * font une rangée lisible, prises une par une et validées au navigateur :
 * séparation par filet (jamais par zébrure), gravité en barre à gauche (jamais
 * en fond de ligne), identité empilée sur deux lignes, nombres en chasse fixe
 * alignés à droite, verdict codé par une FORME avant une couleur.
 *
 * Ces décisions étaient recopiées à la main partout ailleurs, et elles avaient
 * dérivé :
 *
 *   • deux grammaires de rangée concurrentes — celle du DataTable
 *     (`border-b … hover:bg-muted/50`) et une chaîne recopiée telle quelle
 *     dans 11 fichiers (`border-t border-rule-soft … even:bg-foreground/[0.015]
 *     hover:bg-foreground/[0.07]`). Les deux s'empilent : `cn()` est un
 *     tailwind-merge, `border-t` et `border-b` ne sont pas le même groupe, donc
 *     ces rangées portaient un filet EN HAUT ET EN BAS — soit un double trait
 *     entre deux lignes voisines.
 *   • la zébrure, que la vitrine du design system interdit noir sur blanc
 *     depuis la section 14 (« Zébrer les lignes » / à éviter), appliquée sur
 *     11 tables de production.
 *   • quatre recettes d'en-tête (`font-mono 9px uppercase` / `font-sans 10px` /
 *     `text-xs font-medium` / `font-mono 10px uppercase`) et cinq paddings de
 *     cellule (`py-2`, `py-[9px]`, `py-[7px]`, `py-[5px]`, `py-1.5`).
 *
 * Ce module est la source unique. `ui/data-table` en dérive ses classes par
 * défaut : une table pilotée par colonnes n'a donc plus rien à redire sur sa
 * rangée. Les tables écrites à la main (`<table>` en dur) utilisent les
 * composants `TableRow` / `TableHead` / `TableCell` et obtiennent la même.
 */

/* ─── Ton de gravité ─────────────────────────────────────────────────────
   La gravité d'une ligne se lit sur son bord gauche, pas dans son fond. Un
   fond teinté sur toute la largeur entre en concurrence avec le survol et
   avec la sélection ; une barre de 3 px ne se dispute avec rien et reste
   lisible sur une table dense de 300 lignes. */

export type RowTone = 'critical' | 'warning' | 'info' | 'ok' | null

/** Couleur de texte associée à un ton — pour un verdict, un nombre, une preuve. */
export const TONE_TEXT: Record<Exclude<RowTone, null>, string> = {
  critical: 'text-destructive',
  warning: 'text-suggere',
  info: 'text-planifie',
  ok: 'text-ferme',
}

/**
 * Barre de gravité, à poser sur la PREMIÈRE cellule de la rangée (colonne
 * d'index en général).
 *
 * `box-shadow` et non `border-left` : en `border-collapse: collapse`, une
 * bordure de cellule est arbitrée avec celle de la voisine et disparaît une
 * fois sur deux. Une ombre interne n'entre dans aucun arbitrage.
 *
 * Les quatre classes sont écrites en toutes lettres, et le resteront : le
 * scanner Tailwind ne lit que des chaînes complètes dans les sources. Une
 * classe assemblée par interpolation n'est jamais générée — la règle n'existe
 * simplement pas dans la feuille produite, sans la moindre erreur au build.
 */
const SEVERITY_BAR: Record<Exclude<RowTone, null>, string> = {
  critical: '[box-shadow:inset_3px_0_var(--destructive)]',
  warning: '[box-shadow:inset_3px_0_var(--suggere)]',
  info: '[box-shadow:inset_3px_0_var(--planifie)]',
  ok: '[box-shadow:inset_3px_0_var(--ferme)]',
}

/** Idem, appliqué depuis la rangée à sa première cellule. */
const SEVERITY_BAR_ROW: Record<Exclude<RowTone, null>, string> = {
  critical: '[&>td:first-child]:[box-shadow:inset_3px_0_var(--destructive)]',
  warning: '[&>td:first-child]:[box-shadow:inset_3px_0_var(--suggere)]',
  info: '[&>td:first-child]:[box-shadow:inset_3px_0_var(--planifie)]',
  ok: '[&>td:first-child]:[box-shadow:inset_3px_0_var(--ferme)]',
}

/** Barre posée directement sur la cellule (colonne d'index d'un DataTable). */
export function severityBarClass(tone: RowTone): string {
  return tone ? SEVERITY_BAR[tone] : ''
}

/**
 * Barre posée depuis la rangée — la forme à rendre depuis un `getRowClass`,
 * où l'on tient la donnée mais pas la cellule.
 */
export function rowToneClass(tone: RowTone): string {
  return tone ? SEVERITY_BAR_ROW[tone] : ''
}

/* ─── Recettes de classes ────────────────────────────────────────────────
   Exportées en chaînes : `ui/data-table` les applique à ses propres `<tr>` /
   `<th>` / `<td>`, qu'il rend lui-même. Sans ça il faudrait dupliquer la
   grammaire entre le composant piloté par colonnes et les tables en dur. */

export interface TableRowOptions {
  /** Rangée sélectionnée (détail ouvert sur cette ligne). */
  selected?: boolean
  /** La rangée porte un `onClick` — change le curseur, rien d'autre. */
  clickable?: boolean
  /** Gravité, rendue en barre sur la première cellule. */
  tone?: RowTone
}

/**
 * Grammaire de la rangée.
 *
 * `group/row` est toujours posé, et il faut savoir ce qu'il est : un point
 * d'ancrage nommé pour que les cellules puissent réagir au survol de LEUR
 * rangée (`group-hover/row:`). Aucune ne l'utilise aujourd'hui — vérifié sur
 * tout l'arbre, y compris avant cette refonte : les 5 pages qui le déclaraient
 * ouvraient un groupe que personne ne consommait. Il est gardé parce qu'il ne
 * coûte rien (Tailwind n'émet aucune règle pour un marqueur de groupe) et que
 * le déclarer au cas par cas est précisément ce qui rendait ces révélations
 * indisponibles selon la page.
 */
export function tableRowClass({ selected, clickable, tone }: TableRowOptions = {}): string {
  return cn(
    'group/row border-b border-rule-soft transition-colors last:border-b-0 hover:bg-muted/50',
    clickable && 'cursor-pointer',
    // Sélection : fond très pâle + anneau interne. L'anneau seul se perd sur
    // une table dense, le fond seul se confond avec le survol.
    selected && 'bg-primary/[0.04] ring-2 ring-inset ring-primary/40',
    tone && SEVERITY_BAR_ROW[tone]
  )
}

/** Rangée d'en-tête : un filet plein (`border-rule`), plus marqué que l'inter-ligne. */
export const tableHeadRowClass = 'border-b border-rule'

/*
 * ATTENTION — sous `.theme-cursor`, une couche CSS (app.css, « DataTable
 * recipe table Cursor ») redéclare `table th` et `table td` en sélecteur
 * d'élément, avec des `!important` sur la couleur, la graisse, les bordures et
 * les fonds de rangée. Elle GAGNE sur les utilitaires ci-dessous.
 *
 * Les valeurs des deux recettes sont donc tenues identiques à la main : c'est
 * ce qui rend la géométrie du standard vraie sur les 5 pages en thème cursor
 * ET sur les 9 autres. Changer l'une sans l'autre fabrique un écran qui rend
 * autrement que ce que la vitrine annonce — et rien ne le signalera.
 *
 * Conséquence directe : `.theme-cursor table th` pose `text-align: left` à une
 * spécificité qu'une classe seule n'atteint pas. Un en-tête aligné à droite
 * s'écrit `text-right!` — pas par goût, par nécessité.
 */

/**
 * Cellule d'en-tête. Pas de capitales : les libellés métier sont des groupes
 * nominaux (« Commande · Client », « Composants en rupture ») que les capitales
 * rendent illisibles à 10 px.
 */
export function tableHeadClass(align: 'left' | 'right' | 'center' = 'left'): string {
  return cn(
    'px-4 py-3 align-middle font-sans text-xs font-normal tracking-wider text-muted-foreground',
    align === 'left' && 'text-left',
    align === 'right' && 'text-right',
    align === 'center' && 'text-center'
  )
}

/**
 * Cellule de corps. Un seul padding : `px-4 py-3`, et `align-top` — une rangée
 * proactive empile jusqu'à quatre composants avec leur descente BOM, un
 * alignement centré ferait flotter les colonnes courtes au milieu du vide.
 */
export function tableCellClass(align: 'left' | 'right' | 'center' = 'left'): string {
  return cn(
    'px-4 py-3 align-top',
    align === 'right' && 'whitespace-nowrap text-right',
    align === 'center' && 'text-center'
  )
}

/* ─── Éléments de table ──────────────────────────────────────────────────
   Pour les `<table>` écrites à la main. Une table pilotée par colonnes passe
   par `ui/data-table`, qui applique les mêmes recettes sans passer par ici. */

export function TableRow({
  selected,
  clickable,
  tone,
  className,
  ...props
}: ComponentProps<'tr'> & TableRowOptions) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      className={cn(tableRowClass({ selected, clickable, tone }), className)}
      {...props}
    />
  )
}

export function TableHeadRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr data-slot="table-head-row" className={cn(tableHeadRowClass, className)} {...props} />
}

export function TableHead({
  align = 'left',
  className,
  ...props
}: Omit<ComponentProps<'th'>, 'align'> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      data-slot="table-head"
      className={cn(tableHeadClass(align), className)}
      {...props}
    />
  )
}

export function TableCell({
  align = 'left',
  className,
  ...props
}: Omit<ComponentProps<'td'>, 'align'> & { align?: 'left' | 'right' | 'center' }) {
  return <td data-slot="table-cell" className={cn(tableCellClass(align), className)} {...props} />
}

/* ─── Contenus de cellule ────────────────────────────────────────────────
   Les quatre formes qui composent une rangée métier. Elles ne connaissent
   aucun alphabet de statut : les tons arrivent du domaine (VERDICT_TEXT,
   LATE_TONE…), la forme vit ici. */

/**
 * Identité sur deux lignes : un code en chasse fixe qui ne se tronque JAMAIS,
 * un libellé secondaire qui se tronque toujours.
 *
 * C'est la décision qui a supprimé les troncatures en plein milieu d'un code
 * article. Sur une seule ligne, `code · libellé` fait perdre les deux : le
 * navigateur coupe où il peut, c'est-à-dire dans le code.
 */
export function CellStack({
  code,
  label,
  labelTitle,
  action,
  className,
}: {
  /** Ligne 1 — code métier (commande, article, OF). Jamais tronqué. */
  code: ReactNode
  /** Ligne 2 — désignation, client, fournisseur. Tronqué à la largeur. */
  label?: ReactNode
  /** Titre au survol quand le libellé est tronqué. */
  labelTitle?: string
  /** Affordance posée à droite du code (lien X3, badge…). */
  action?: ReactNode
  className?: string
}) {
  return (
    <span className={cn('flex min-w-0 flex-col gap-px', className)}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="shrink-0 font-mono text-xs font-bold tracking-tight text-foreground">
          {code}
        </span>
        {action}
      </span>
      {label !== undefined && (
        <span className="truncate text-2xs text-muted-foreground" title={labelTitle}>
          {label || '—'}
        </span>
      )}
    </span>
  )
}

/**
 * Valeur numérique. `tabular-nums` n'est pas cosmétique : sans lui les chiffres
 * n'ont pas la même chasse et une colonne de quantités ne se lit plus en
 * diagonale. À accompagner de `align="right"` sur la cellule.
 */
export function CellNumber({
  value,
  tone = null,
  emphasis = 'strong',
  title,
  className,
}: {
  value: ReactNode
  tone?: RowTone
  /** `strong` = valeur porteuse (13 px gras) ; `plain` = valeur de contexte. */
  emphasis?: 'strong' | 'plain'
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'font-mono tabular-nums',
        emphasis === 'strong'
          ? 'text-cell-lg font-bold leading-none tracking-tight'
          : 'text-1.5xs font-semibold',
        tone ? TONE_TEXT[tone] : 'text-foreground',
        className
      )}
    >
      {value}
    </span>
  )
}

/**
 * Date : la date absolue en jj/mm/aaaa, et sous elle son échéance relative.
 * Le relatif seul ment (« demain » ne dit pas quel jour), l'absolu seul oblige
 * à compter. Les deux ensemble se lisent sans effort.
 */
export function CellDate({
  date,
  relative,
  tone = null,
  className,
}: {
  /** Date affichée — jj/mm/aaaa. L'ISO reste côté machine. */
  date: ReactNode
  /** Échéance relative : « Retard 3 j », « Aujourd'hui », « Dans 5 j ». */
  relative?: ReactNode
  tone?: RowTone
  className?: string
}) {
  return (
    <div className={cn('leading-tight', className)}>
      <div className="font-mono text-1.5xs font-semibold text-foreground">{date || '—'}</div>
      {relative && (
        <div
          className={cn(
            'font-sans text-3xs font-semibold',
            tone ? TONE_TEXT[tone] : 'text-muted-foreground'
          )}
        >
          {relative}
        </div>
      )}
    </div>
  )
}

/**
 * Verdict. L'icône porte le sens par sa FORME — un octogone barré et une
 * horloge se distinguent sans couleur, deux pastilles rouge et ambre non. La
 * couleur double l'information, elle ne la porte pas seule.
 */
export function CellVerdict({
  icon: Icon,
  marker,
  label,
  tone,
  title,
  className,
}: {
  icon?: LucideIcon
  /**
   * Marqueur déjà rendu, quand l'alphabet du domaine ne parle pas lucide (icône
   * Material via `DynamicIcon`, par exemple). Prend la place de `icon`.
   */
  marker?: ReactNode
  label: ReactNode
  /** Classe de couleur venue de l'alphabet du domaine (`VERDICT_TEXT[…]`). */
  tone: string
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}
    >
      {(Icon || marker) && (
        <span className={cn('shrink-0', tone)} aria-hidden="true">
          {marker ?? (Icon ? <Icon size={14} strokeWidth={1.75} /> : null)}
        </span>
      )}
      <span className={cn('text-1.5xs font-semibold', tone)}>{label}</span>
    </span>
  )
}

/**
 * Ligne de preuve — le pourquoi sous la valeur : « Arrivée 14/08 · PO-4412 »,
 * « Bloqué par 80001 −12 », « 4 en statut Q ». Toujours sous la donnée qu'elle
 * explique, jamais dans une colonne à elle.
 */
export function CellEvidence({
  icon: Icon,
  tone = null,
  title,
  children,
  className,
}: {
  icon?: LucideIcon
  tone?: RowTone
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      title={title}
      className={cn(
        'flex items-center gap-1 font-mono text-3xs leading-snug',
        tone ? cn('font-bold', TONE_TEXT[tone]) : 'font-medium text-muted-foreground',
        className
      )}
    >
      {Icon && <Icon size={11} strokeWidth={1.75} className="shrink-0 leading-none opacity-80" />}
      <span className="min-w-0">{children}</span>
    </div>
  )
}
