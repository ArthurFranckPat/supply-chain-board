import * as React from "react"
import { Skeleton as AstryxSkeleton } from "@astryxdesign/core/Skeleton"
import { cn } from "@r/lib/utils"

// Skeleton — Lot 2 (issue #90). Base wrap sur Astryx Skeleton (était <div>
// natif avec animate-pulse). Les composés (SkeletonCard/Row/Badge/Chart)
// restent des layouts maison qui consomment ce Skeleton.

function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <AstryxSkeleton
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-md bg-muted/70 dark:bg-muted/40",
        className
      )}
      {...props}
    />
  )
}

function SkeletonCard({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton-card"
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-xs",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-full" />
        </>
      )}
    </div>
  )
}

function SkeletonRow({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      ))}
    </div>
  )
}

function SkeletonBadge({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-14 rounded-full", className)} />
}

function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-card p-5", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20 rounded-md" />
      </div>
      <div className="flex h-36 items-end gap-2 pt-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full rounded-t-sm"
            style={{ height: `${Math.floor(20 + Math.random() * 75)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonRow, SkeletonBadge, SkeletonChart }
