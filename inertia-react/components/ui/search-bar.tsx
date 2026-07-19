import * as React from "react"

import { cn } from "@r/lib/utils"

// SearchBar — alignée sur Airbnb DESIGN.md `search-bar-pill` + `search-orb`.
// Pill 64px de haut, rounded-full, divisée par hairlines verticales en
// segments (Where / When / Who par défaut), terminée à droite par l'orbe
// Rausch 48px (search-orb).
//
// Stub volontairement minimaliste : ne couvre pas le cas mobile (overlay
// full-screen cf. DESIGN.md Responsive Behavior), ni les segments
// avancés (date picker, guest stepper). Sert de socle pour la page
// d'accueil / le hero / le dashboard.

interface SearchSegment {
  /** Label uppercase au-dessus du champ (ex. "Where"). */
  label: string
  /** Placeholder (ex. "Search destinations"). */
  placeholder?: string
  /** Valeur contrôlée optionnelle. */
  value?: string
  /** Handler de changement optionnel. */
  onChange?: (value: string) => void
  /** Pour surcharger le segment par un trigger custom (date picker, etc.). */
  render?: React.ReactNode
}

interface SearchBarProps extends React.ComponentProps<"div"> {
  segments: SearchSegment[]
  /** Handler quand l'utilisateur soumet (clic orbe ou Enter). */
  onSubmit?: () => void
  /** Libellé aria pour l'orbe. */
  submitLabel?: string
}

function SearchBar({
  className,
  segments,
  onSubmit,
  submitLabel = "Rechercher",
  ...props
}: SearchBarProps) {
  return (
    <div
      data-slot="search-bar"
      className={cn(
        // DESIGN.md search-bar-pill : 64px, rounded-full, 1px hairline,
        // shadow tier (le search bar a l'ombre au repos, contrairement aux cards).
        "flex h-16 w-full items-center rounded-full border border-border bg-card pl-8 pr-2",
        "shadow-[0_0_0_1px_rgb(0_0_0/0.02),0_2px_6px_rgb(0_0_0/0.04),0_4px_8px_rgb(0_0_0/0.10)]",
        "focus-within:border-foreground",
        className
      )}
      {...props}
    >
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            // Hairline verticale entre segments.
            <span
              aria-hidden="true"
              className="mx-2 h-8 w-px self-center bg-border"
            />
          )}
          <label className="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
            <span className="text-xs font-semibold leading-none">
              {seg.label}
            </span>
            {seg.render ?? (
              <input
                type="text"
                placeholder={seg.placeholder}
                value={seg.value}
                onChange={(e) => seg.onChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmit?.()
                }}
                className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            )}
          </label>
        </React.Fragment>
      ))}

      {/* Search orb — DESIGN.md search-orb : 48px, Rausch, rounded-full,
          icone loupe blanche centrée. */}
      <button
        type="button"
        onClick={onSubmit}
        aria-label={submitLabel}
        className={cn(
          "ml-2 flex size-12 shrink-0 items-center justify-center rounded-full",
          "bg-primary text-primary-foreground",
          "transition-colors hover:bg-[var(--color-rausch-active,#e00b41)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    </div>
  )
}

export { SearchBar }
export type { SearchBarProps, SearchSegment }
