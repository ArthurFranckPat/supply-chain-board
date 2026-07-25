import * as React from "react"
import { Badge as AstryxBadge, type BadgeVariant as AstryxBadgeVariant } from "@astryxdesign/core/Badge"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@r/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        // Variantes métier (portage Solid — BadgeVariant de lib/of/diagnostic-types)
        success: "bg-ferme/15 text-ferme",
        warning: "bg-suggere/15 text-suggere",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/** Map variant shadcn → variant Astryx (pour la couche sémantique native). */
const VARIANT_TO_ASTRYX: Record<
  NonNullable<VariantProps<typeof badgeVariants>["variant"]>,
  AstryxBadgeVariant
> = {
  default: "neutral",
  secondary: "neutral",
  destructive: "error",
  outline: "neutral",
  ghost: "neutral",
  link: "neutral",
  success: "success",
  warning: "warning",
}

type BadgeProps = Omit<React.ComponentProps<"span">, "color"> &
  VariantProps<typeof badgeVariants> & {
    /** Pattern Base UI render — remplacer l'élément racine. */
    render?: React.ReactElement
  }

function Badge({ className, variant = "default", render, children, ...props }: BadgeProps) {
  // Pattern Base UI `render` : on clone l'élément fourni en injectant les
  // classes cva + data-slot, sans passer par AstryxBadge (le consumer
  // pilote la racine, e.g. <Badge render={<Link to="…" />} />).
  if (render) {
    const renderProps = render.props as Record<string, unknown>
    return React.cloneElement(render, {
      "data-slot": "badge",
      className: cn(badgeVariants({ variant }), className, (renderProps.className as string | undefined) ?? ""),
      ...props,
    } as Record<string, unknown>)
  }

  return (
    <AstryxBadge
      data-slot="badge"
      label={children ?? ""}
      variant={variant ? VARIANT_TO_ASTRYX[variant] : "neutral"}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
export type { BadgeProps }
