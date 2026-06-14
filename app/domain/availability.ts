import type { Flow } from './models/flow.js'

export function currentStock(flows: Flow[], article: string): number {
  return flows
    .filter((f) => f.article === article && f.date === null)
    .reduce((sum, f) => sum + (f.direction === 'supply' ? f.quantity : -f.quantity), 0)
}

export function availableAt(
  flows: Flow[],
  article: string,
  date: Date,
  useReceptions: boolean = true,
  stockState?: { getAvailable(article: string): number },
): number {
  if (!useReceptions && stockState) {
    return stockState.getAvailable(article)
  }
  return flows
    .filter((f) => f.article === article)
    .filter((f) => f.date === null || f.date <= date)
    .filter((f) => useReceptions || f.date === null)
    .reduce((sum, f) => sum + (f.direction === 'supply' ? f.quantity : -f.quantity), 0)
}

export function shortageAt(
  flows: Flow[],
  article: string,
  quantityNeeded: number,
  date: Date,
  reservedQuantity: number = 0,
): number {
  return Math.max(0, quantityNeeded - reservedQuantity - availableAt(flows, article, date))
}


export function firstCoverageDate(
  flows: Flow[],
  article: string,
  quantityNeeded: number,
): Date | null {
  const sorted = flows
    .filter((f) => f.article === article)
    .sort((a, b) => {
      if (a.date === null && b.date !== null) return -1
      if (a.date !== null && b.date === null) return 1
      if (a.date === null && b.date === null) return 0
      return a.date!.getTime() - b.date!.getTime()
    })

  let cumulative = 0
  for (const flow of sorted) {
    cumulative += flow.direction === 'supply' ? flow.quantity : -flow.quantity
    if (cumulative >= quantityNeeded) return flow.date
  }
  return null
}

export interface AllocationResult {
  allocated: number
  remaining: number
  details: Array<{ flowIndex: number; taken: number }>
}

export function allocateFromSupply(
  flows: Flow[],
  article: string,
  quantityNeeded: number,
  upToDate?: Date,
): AllocationResult {
  const candidates = flows
    .map((f, i) => ({ flow: f, index: i }))
    .filter(
      ({ flow }) =>
        flow.article === article &&
        flow.direction === 'supply' &&
        flow.quantity > 0 &&
        (upToDate === undefined || flow.date === null || flow.date <= upToDate),
    )
    .sort((a, b) => {
      if (a.flow.date === null && b.flow.date !== null) return -1
      if (a.flow.date !== null && b.flow.date === null) return 1
      if (a.flow.date === null && b.flow.date === null) return 0
      return a.flow.date!.getTime() - b.flow.date!.getTime()
    })

  let remaining = quantityNeeded
  const details: AllocationResult['details'] = []

  for (const { flow, index } of candidates) {
    if (remaining <= 0) break
    const taken = Math.min(remaining, flow.quantity)
    details.push({ flowIndex: index, taken })
    remaining -= taken
  }

  return { allocated: quantityNeeded - remaining, remaining, details }
}

export interface AvailabilitySnapshot {
  article: string
  currentStock: number
  receptionsUntilDate: number
  availableAtDate: number
  earliestReception: Date | null
  shortage: number
}

export function snapshot(
  flows: Flow[],
  article: string,
  date: Date,
  quantityNeeded?: number,
  useReceptions: boolean = true,
): AvailabilitySnapshot {
  const stock = currentStock(flows, article)
  const recvQty = useReceptions
    ? flows
      .filter(
        (f) =>
          f.article === article &&
          f.direction === 'supply' &&
          f.date !== null &&
          f.date <= date &&
          f.origin.type === 'reception',
      )
      .reduce((s, f) => s + f.quantity, 0)
    : 0

  const earliest = flows
    .filter(
      (f) =>
        f.article === article &&
        f.direction === 'supply' &&
        f.date !== null &&
        f.origin.type === 'reception' &&
        f.quantity > 0,
    )
    .sort((a, b) => (a.date as Date).getTime() - (b.date as Date).getTime())

  const available = availableAt(flows, article, date, useReceptions)

  return {
    article,
    currentStock: stock,
    receptionsUntilDate: recvQty,
    availableAtDate: available,
    earliestReception: earliest[0]?.date ?? null,
    shortage: quantityNeeded ? Math.max(0, quantityNeeded - available) : 0,
  }
}
