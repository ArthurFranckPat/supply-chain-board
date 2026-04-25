import { useState, useMemo, useCallback } from 'react'

export type SortDir = 'asc' | 'desc'

interface UseTableSortFilterOptions<T> {
  data: T[]
  filterFn?: (item: T, search: string) => boolean
  sortFn?: (a: T, b: T, key: string, dir: SortDir) => number
  pageSize?: number
}

export function useTableSortFilter<T>(options: UseTableSortFilterOptions<T>) {
  const { data, filterFn, sortFn, pageSize } = options

  const [sortKey, setSortKey] = useState<string>('')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSort = useCallback((key: string) => {
    setSortDir((prevDir) => {
      const nextDir = sortKey === key && prevDir === 'desc' ? 'asc' : 'desc'
      return nextDir
    })
    setSortKey(key)
    setPage(1)
  }, [sortKey])

  const filtered = useMemo(() => {
    let items = [...data]
    if (search && filterFn) {
      items = items.filter((item) => filterFn(item, search))
    }
    if (sortKey && sortFn) {
      items.sort((a, b) => sortFn(a, b, sortKey, sortDir))
    }
    return items
  }, [data, search, filterFn, sortKey, sortDir, sortFn])

  const paginated = useMemo(() => {
    if (!pageSize) return filtered
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  const totalPages = pageSize ? Math.ceil(filtered.length / pageSize) : 1

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      if (prev.size === ids.length) return new Set()
      return new Set(ids)
    })
  }, [])

  const clearSelected = useCallback(() => setSelected(new Set()), [])

  return {
    sortKey,
    sortDir,
    search,
    setSearch,
    page,
    setPage,
    selected,
    toggleOne,
    toggleAll,
    clearSelected,
    toggleSort,
    filtered,
    paginated,
    totalPages,
    totalItems: filtered.length,
  }
}
