/**
 * cx — join classNames conditionally.
 *
 * Remplace `cn()` (qui reposait sur clsx + tailwind-merge, deux deps shadcn).
 * Pas de tailwind-merge : on suppose que les consumers n'ont pas de conflits
 * de classes Tailwind nécessitant la résolution automatique. Si besoin, le
 * dernier argument gagne (ordre source).
 *
 * @example
 * cx('btn', isActive && 'btn-active', className)
 * cx('a', cond ? 'b' : 'c')
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  let out = ''
  for (const p of parts) {
    if (!p) continue
    out = out ? `${out} ${p}` : p
  }
  return out
}
