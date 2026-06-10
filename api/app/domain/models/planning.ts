/**
 * Planning Board -- modeles locaux (overrides SQLite, pas dans X3).
 */

export interface OfOverride {
  numOf: string
  dateDebut: string | null // ISO date, null = retour ERP
  dateFin: string | null
  status: 1 | 2 | 3 | null
  note: string | null
  updatedAt: string
}

export interface ScheduleEvent {
  id: number
  action: string
  numOf: string
  detail: string | null
  createdAt: string
}
