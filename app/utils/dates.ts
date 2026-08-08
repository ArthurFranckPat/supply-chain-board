/** Millisecondes dans une journée civile. */
export const DAY_MS = 86_400_000

/** Tronque une date à minuit en heure locale (comparaisons jour à jour). */
export function atMidnight(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/**
 * Date locale → `YYYY-MM-DD`.
 * Préférer à `toISOString().slice(0, 10)` qui recule d'un jour à minuit en UTC+n.
 */
export function isoDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Échéance ISO (`YYYY-MM-DD`) → affichage jj/mm/aaaa. `—` si `null`.
 * Règle du projet : jamais d'ISO brut à l'écran ; l'ISO reste correct côté
 * machine (champs `echeance*` inchangés), seul le texte affiché passe par ici.
 * Partagé par `cbn_driver_diff.ts` et `appro_snapshot_diff.ts` (#148) : ne pas
 * dupliquer, les deux fichiers doivent consommer la même fonction.
 */
export const fmtFr = (iso: string | null): string => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Numéro de semaine ISO (calcul sur la date civile locale, convention usuelle). */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7)
}

/** Lundi de la semaine contenant `d` (minuit local, lundi = début de semaine). */
export function mondayOf(d: Date): Date {
  const x = atMidnight(d)
  const dow = (x.getDay() + 6) % 7 // 0 = lundi
  x.setDate(x.getDate() - dow)
  return x
}

/**
 * Une chaîne est-elle une date ISO `YYYY-MM-DD` qui existe RÉELLEMENT (rejette
 * `2026-02-30`, `2026-13-01`, etc.), pas seulement au bon format.
 *
 * Sert à valider les paramètres `avant`/`apres` des endpoints de diff (#143
 * défaut 6) : `whereBetween`/`where` sur `snapshot_date` sont paramétrés (pas
 * d'injection), mais une valeur absurde retombait silencieusement sur « moins
 * de deux photos » — un message qui décrit un état des DONNÉES alors que
 * c'est la REQUÊTE qui est mauvaise.
 */
export function estIsoDayValide(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m === null) return false
  const annee = Number(m[1])
  const mois = Number(m[2])
  const jour = Number(m[3])
  const d = new Date(annee, mois - 1, jour)
  // `Date` normalise les débordements (`2026-02-30` → `2026-03-02`) au lieu de
  // lever : la relecture des trois composantes est ce qui les détecte.
  return d.getFullYear() === annee && d.getMonth() === mois - 1 && d.getDate() === jour
}

/**
 * Écart en jours entiers entre deux dates ISO (`YYYY-MM-DD`). `null` si l'une
 * des deux manque ou est inparseable. Toujours calculé sur UTC minuit pour
 * l'indépendance du fuseau — l'appelant compare des jours, pas des instants.
 *
 * Maison unique pour `cbn_driver_diff`, `cbn_explanation`, `cbn_root_cause` :
 * les trois avaient chacun leur copie privée identique (revue PR #158 point 15).
 * Un futur passage remplacera les doublons par cet import.
 */
export const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / DAY_MS)
}
