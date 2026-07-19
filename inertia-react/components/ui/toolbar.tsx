import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@r/lib/utils"

// Toolbar — composant unifié pour les barres de filtrage au-dessus des pages
// métier (dashboard, suivi, ruptures, expeditions, receptions, etc.).
//
// Extrait du pattern dupliqué à 8 endroits dans le codebase :
//   <div className="flex flex-none flex-wrap items-center gap-2.5 border-b
//     border-rule px-7 py-2">…</div>
//
// À utiliser via la prop `toolbar` du AppLayout :
//   <AppLayout
//     toolbar={
//       <Toolbar>
//         <ToolbarSegment … />
//         <ToolbarSearch … />
//         <ToolbarRefresh … />
//       </Toolbar>
//     }
//   >
//
// Principes Airbnb :
// - pills rounded-full pour actions et toggles (DESIGN.md button-pill-rausch)
// - segmented control en pills compactes, fond muted, actif = card + ink
// - hairline border-rule (1px #dddddd) cohérent avec le design system
// - pas d'ombres sur la toolbar (uniquement sur les dropdowns / cards)

/* ─── Toolbar ────────────────────────────────────────────────────────────
   Conteneur. Flex-wrap, gap-2.5, border-bottom hairline. Aligne les
   enfants sur une seule rangée tant que la largeur le permet. */

interface ToolbarProps extends React.ComponentProps<"div"> {
  /** Gap entre les enfants. Défaut '2.5' (10px). */
  gap?: "2" | "2.5" | "3"
  /** Padding vertical. Défaut '2' (8px). */
  py?: "1.5" | "2" | "2.5"
}

function Toolbar({
  className,
  gap = "2.5",
  py = "2",
  ...props
}: ToolbarProps) {
  return (
    <div
      data-slot="toolbar"
      className={cn(
        "flex flex-none flex-wrap items-center border-b border-border bg-background",
        "px-7",
        gap === "2" && "gap-2",
        gap === "2.5" && "gap-2.5",
        gap === "3" && "gap-3",
        py === "1.5" && "py-1.5",
        py === "2" && "py-2",
        py === "2.5" && "py-2.5",
        className
      )}
      {...props}
    />
  )
}

/* ─── ToolbarGroup ───────────────────────────────────────────────────────
   Groupement logique d'éléments (ex. filtres verdict). */

function ToolbarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    />
  )
}

/* ─── ToolbarSegment ─────────────────────────────────────────────────────
   Segmented control — bouton groupé type iOS. 3+ choix exclusifs.
   DESIGN.md category-tab-active : transparent + ink text pour l'actif,
   muted pour l'inactif. Le conteneur `<ToolbarSegmented>` porte le fond
   muted et le border hairline. */

const segmentedItemVariants = cva(
  "rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors",
  {
    variants: {
      active: {
        true: "bg-primary text-primary-foreground",
        false: "text-muted-foreground hover:text-foreground",
      },
      // Variante soft (sobre) — actif sur fond brand-soft + ink au lieu de Rausch.
      // Utile pour les filtres secondaires.
      tone: {
        solid: "",
        soft: "",
      },
    },
    compoundVariants: [
      {
        active: true,
        tone: "soft",
        class: "bg-[var(--brand-soft,rgba(255,56,92,0.10))] text-primary",
      },
    ],
    defaultVariants: {
      tone: "solid",
    },
  }
)

interface ToolbarSegmentedProps extends React.ComponentProps<"div"> {
  tone?: VariantProps<typeof segmentedItemVariants>["tone"]
}

function ToolbarSegmented({
  className,
  tone = "solid",
  ...props
}: ToolbarSegmentedProps) {
  return (
    <div
      data-slot="toolbar-segmented"
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5",
        className
      )}
      {...props}
    />
  )
}

interface ToolbarSegmentProps
  extends Omit<React.ComponentProps<"button">, "tone"> {
  active?: boolean
  tone?: VariantProps<typeof segmentedItemVariants>["tone"]
}

function ToolbarSegment({
  className,
  active = false,
  tone = "solid",
  type,
  ...props
}: ToolbarSegmentProps) {
  return (
    <button
      type={type ?? "button"}
      data-slot="toolbar-segment"
      role="tab"
      aria-selected={active}
      className={cn(segmentedItemVariants({ active, tone }), className)}
      {...props}
    />
  )
}

/* ─── ToolbarSearch ──────────────────────────────────────────────────────
   Champ de recherche pill (DESIGN.md search-bar-pill, version compacte
   30px de haut pour la toolbar — vs 64px pour la search bar hero). */

interface ToolbarSearchProps
  extends Omit<React.ComponentProps<"input">, "onChange"> {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  icon?: string
}

function ToolbarSearch({
  className,
  value,
  onChange,
  placeholder = "Rechercher…",
  icon = "search",
  ...props
}: ToolbarSearchProps) {
  return (
    <div
      data-slot="toolbar-search"
      className={cn(
        "flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-card px-3",
        "transition-shadow focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25",
        className
      )}
    >
      <span className="material-symbols-outlined text-[17px] text-muted-foreground">
        {icon}
      </span>
      <input
        type="text"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        className="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground"
        {...props}
      />
    </div>
  )
}

/* ─── ToolbarRefresh ─────────────────────────────────────────────────────
   Bouton Actualiser avec spinner intégré. DESIGN.md button-pill-rausch
   sobriété : outline card par défaut, passe à ink primary au hover. */

interface ToolbarRefreshProps extends React.ComponentProps<"button"> {
  loading?: boolean
  /** Label textuel. Par défaut vide (l'icône refresh est explicite).
   *  Passer une chaîne pour afficher un label à côté de l'icône. */
  label?: string
}

function ToolbarRefresh({
  className,
  loading = false,
  label,
  disabled,
  type,
  ...props
}: ToolbarRefreshProps) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      title="Recharger les données X3"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-2",
        "text-foreground transition-colors",
        "hover:border-primary disabled:opacity-50",
        label && "px-3 py-1 text-[11px] font-semibold",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "material-symbols-outlined text-[14px] text-muted-foreground",
          loading && "animate-spin"
        )}
        aria-hidden="true"
      >
        refresh
      </span>
      {label}
    </button>
  )
}

/* ─── ToolbarSeparator ───────────────────────────────────────────────────
   Séparateur vertical entre groupes. */

function ToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden="true"
      className={cn("mx-1 h-5 w-px self-center bg-border", className)}
      {...props}
    />
  )
}

/* ─── ToolbarSpacer ──────────────────────────────────────────────────────
   Pousse les éléments suivants à droite. */

function ToolbarSpacer() {
  return <div className="ml-auto" aria-hidden="true" />
}

export {
  Toolbar,
  ToolbarGroup,
  ToolbarSegmented,
  ToolbarSegment,
  ToolbarSearch,
  ToolbarRefresh,
  ToolbarSeparator,
  ToolbarSpacer,
}
