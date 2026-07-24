import type { ComponentProps } from 'solid-js'
import { splitProps } from 'solid-js'

export const Skeleton = (props: ComponentProps<'div'>) => {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <div
      data-slot="skeleton"
      class={`animate-pulse rounded-md bg-muted/70 dark:bg-muted/40 ${local.class || ''}`}
      {...rest}
    />
  )
}

export const SkeletonCard = (props: ComponentProps<'div'>) => {
  const [local, rest] = splitProps(props, ['class', 'children'])
  return (
    <div
      data-slot="skeleton-card"
      class={`flex flex-col gap-3 rounded-lg border bg-card p-5 shadow-xs ${local.class || ''}`}
      {...rest}
    >
      {local.children || (
        <>
          <div class="flex items-center justify-between">
            <Skeleton class="h-4 w-1/3" />
            <Skeleton class="h-4 w-12 rounded-full" />
          </div>
          <Skeleton class="h-8 w-2/3" />
          <Skeleton class="h-3 w-full" />
        </>
      )}
    </div>
  )
}
