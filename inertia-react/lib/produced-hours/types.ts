export interface DailyPoint {
  date: string
  hours: number
  allocated: number
  qty: number
  morningHours?: number
  afternoonHours?: number
}

export interface WorkstationProducedCard {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  operationHours: number
  setupHours: number
  totalHours: number
  allocatedOperationHours: number
  allocatedSetupHours: number
  totalAllocatedHours: number
  deltaHours: number
  efficiency: number
  quantity: number
  rejectQuantity: number
  rejectRate: number
  nbOfs: number
  nbTrackings: number
  weeklyCapacity: number
  timeline: DailyPoint[]
}

export interface ProducedHoursKPIs {
  totalHours: number
  totalOperationHours: number
  totalSetupHours: number
  totalAllocatedHours: number
  globalDeltaHours: number
  globalEfficiency: number
  totalQuantity: number
  totalRejects: number
  rejectRate: number
  activeWorkstationsCount: number
  totalWorkstationsCount: number
}

export interface ProducedHoursPayload {
  from: string
  to: string
  kpis: ProducedHoursKPIs
  workstations: WorkstationProducedCard[]
  ateliers: string[]
}

export interface EnrichedPosteTracking {
  trackingNum: string
  lineNum: number
  ofNum: string
  opeNum: number
  article: string
  designation: string
  date: string
  time?: string
  shift?: 'matin' | 'aprem'
  setupHours: number
  operationHours: number
  totalHours: number
  allocatedSetupHours: number
  allocatedOperationHours: number
  totalAllocatedHours: number
  deltaHours: number
  quantity: number
  rejectQuantity: number
  employee: string
}

export interface WorkstationDetailResponse {
  poste: string
  name: string
  atelier: string
  workCenter: string
  wstType: number
  from: string
  to: string
  kpis: {
    totalHours: number
    operationHours: number
    setupHours: number
    totalAllocatedHours: number
    deltaHours: number
    efficiency: number
    quantity: number
    rejectQuantity: number
    nbOfs: number
    nbTrackings: number
  }
  timeline: DailyPoint[]
  trackings: EnrichedPosteTracking[]
}

/** Formate une date ISO AAAA-MM-JJ en JJ/MM/AAAA */
export function formatDateFr(dateStr?: string | null): string {
  if (!dateStr) return ''
  const parts = dateStr.trim().split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return dateStr
}
