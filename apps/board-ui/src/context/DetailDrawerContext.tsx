import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { DetailItem } from '@/types/api'

interface DetailDrawerContextValue {
  item: DetailItem | null
  open: (item: DetailItem) => void
  close: () => void
}

const DetailDrawerContext = createContext<DetailDrawerContextValue | null>(null)

export function DetailDrawerProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<DetailItem | null>(null)

  const open = useCallback((newItem: DetailItem) => {
    setItem(newItem)
  }, [])

  const close = useCallback(() => {
    setItem(null)
  }, [])

  return (
    <DetailDrawerContext.Provider value={{ item, open, close }}>
      {children}
    </DetailDrawerContext.Provider>
  )
}

export function useDetailDrawer(): DetailDrawerContextValue {
  const ctx = useContext(DetailDrawerContext)
  if (!ctx) {
    throw new Error('useDetailDrawer must be used inside DetailDrawerProvider')
  }
  return ctx
}
