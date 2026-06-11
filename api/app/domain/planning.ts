/**
 * Planning utilities -- calendar, capacity, charge calculation.
 *
 * Pure functions, no I/O. Calendar config and holidays injected as parameters.
 */

// -- Calendar --

export function isWeekend(d: Date): boolean {
  const day = d.getDay()
  return day === 0 || day === 6
}

export function isHoliday(d: Date, holidays: string[]): boolean {
  const iso = d.toISOString().slice(0, 10)
  return holidays.includes(iso)
}

export function isWorkday(d: Date, holidays: string[] = []): boolean {
  return !isWeekend(d) && !isHoliday(d, holidays)
}

export function nextWorkday(d: Date, holidays: string[] = []): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + 1)
  while (!isWorkday(next, holidays)) {
    next.setDate(next.getDate() + 1)
  }
  return next
}

export function generateWorkdays(from: Date, to: Date, holidays: string[] = []): Date[] {
  const days: Date[] = []
  const current = new Date(from)
  while (current <= to) {
    if (isWorkday(current, holidays)) {
      days.push(new Date(current))
    }
    current.setDate(current.getDate() + 1)
  }
  return days
}

// -- Charge --

export interface OperationRate {
  workstation: string
  rate: number
}

/**
 * Calcule les heures de charge par poste a partir d'une gamme et d'une quantite.
 */
export function chargeByWorkstation(
  operations: OperationRate[],
  quantity: number,
): Map<string, number> {
  const result = new Map<string, number>()
  for (const op of operations) {
    if (op.rate <= 0) {
      result.set(op.workstation, (result.get(op.workstation) ?? 0) + 0)
      continue
    }
    const hours = quantity / op.rate
    result.set(op.workstation, (result.get(op.workstation) ?? 0) + hours)
  }
  return result
}
