/**
 * Charge -- resultat du calcul de charge par poste.
 */

export interface ChargeByWorkstation {
  workstation: string
  label: string
  weeklyHours: Map<string, number> // "S+1", "S+2", etc. → heures
}

export function totalHours(charge: ChargeByWorkstation): number {
  let sum = 0
  for (const h of charge.weeklyHours.values()) sum += h
  return sum
}
