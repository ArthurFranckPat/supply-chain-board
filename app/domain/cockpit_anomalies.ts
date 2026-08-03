/**
 * Anomalies du cockpit poste (#119, lot 5) — domaine pur, aucune I/O.
 *
 * Quatre familles, toutes à l'échelle d'UN poste (égalité stricte) :
 *
 * 1. **Lancé, jamais pointé** — l'OF est en cours depuis plus de N jours et
 *    n'a aucun pointage sur le poste. Détecte les lancements « fantômes » :
 *    l'OF est annoncé en production mais l'atelier n'a rien déclaré ici.
 * 2. **Silence** — l'OF a déjà pointé sur le poste mais plus rien depuis N
 *    jours alors qu'il est toujours en cours.
 * 3. **Déclaré sans heures** (ou heures anormalement faibles) — une quantité est
 *    déclarée sur l'OF mais les pointages du poste ne portent pas (ou trop peu
 *    de) temps, comparé au temps théorique de gamme.
 * 4. **Déclarations en double** — plusieurs pointages mêmes (OF, opération,
 *    jour). Signalé pour vérification : la saisie en double existe, mais deux
 *    déclarations PARTIELLES le même jour sont légitimes — l'interprétation X3
 *    (champ SEQUENCE éventuel) reste à valider (#119, hors périmètre MCP).
 *
 * Les seuils sont des CONSTANTES à caler sur la donnée réelle (cf. chacun) ;
 * l'issue demande explicitement ce calage, il se fera sous supervision X3.
 */

import type { PointageTrk } from '#app/domain/production_realisee'

/** Détecteur 1 — jours de lancement sans aucun pointage avant signalement.
 *  À CALER sur la distribution réelle des délais lancement → premier pointage
 *  (#119) : trop court = bruit, trop long = détection tardive. */
export const SEUIL_PREMIER_POINTAGE_JOURS = 5

/** Détecteur 2 — jours de silence après le dernier pointage. Configurable (#119). */
export const SEUIL_SILENCE_JOURS = 5

/** Détecteur 3 — en dessous de cette fraction du temps théorique de gamme, les
 *  heures pointées sont jugées anormalement faibles. À VALIDER métier. */
export const RATIO_HEURES_FAIBLES = 0.5

const JOUR_MS = 86_400_000

function joursEntre(avantIso: string, apresIso: string): number {
  const a = new Date(`${avantIso}T00:00:00`).getTime()
  const b = new Date(`${apresIso}T00:00:00`).getTime()
  return Math.round((b - a) / JOUR_MS)
}

export type AnomalieKind =
  | 'jamais_pointe'
  | 'silence'
  | 'sans_heures'
  | 'heures_faibles'
  | 'doublon_declaration'
  | 'ecart_declaration'
  | 'of_a_solder'

/** Une anomalie portant sur un OF du poste. Les champs non pertinents pour la
 *  famille sont null — la vue décide de ce qu'elle affiche par famille. */
export interface AnomaliePoste {
  kind: AnomalieKind
  numOf: string
  article: string
  designation: string | null
  dateDebutIso: string | null
  dernierPointageIso: string | null
  /** Jours depuis le lancement (dét. 1) ou depuis le dernier pointage (dét. 2). */
  jours: number | null
  qtyDeclaree: number | null
  heuresPointees: number | null
  heuresTheoriques: number | null
}

/** Déclarations en double : mêmes (OF, opération, jour), N fois. */
export interface DoublonDeclaration {
  numOf: string
  openum: number
  iptdat: string
  nombre: number
}

export interface AnomaliesPosteResultat {
  jamaisPointes: AnomaliePoste[]
  silences: AnomaliePoste[]
  heures: AnomaliePoste[]
  doublons: DoublonDeclaration[]
  /** Écarts de déclaration (#95) filtrés sur le poste. */
  ecartsDeclaration: AnomaliePoste[]
  /** OF à solder / fantômes filtrés sur le poste. */
  ofsASolder: AnomaliePoste[]
}

export interface OfEnCoursPoste {
  numOf: string
  article: string
  designation: string | null
  /** STRDAT — lancement. Null = inconnu : les détecteurs datés l'ignorent. */
  dateDebutIso: string | null
  /** Quantité déclarée sur les opérations de l'OF (MFGOPE CPLQTY sommée). */
  qtyDeclaree: number
}

export interface DetecterAnomaliesEntrees {
  /** OF EN COURS rattachés au poste (statuts 1/2/3) — jamais les soldés. */
  ofs: OfEnCoursPoste[]
  /** Pointages du poste sur la fenêtre répliquée (égalité stricte déjà faite). */
  pointages: PointageTrk[]
  /** Temps théorique de gamme pour une quantité déclarée — `hoursForQuantity`. */
  heuresTheoriquesPour: (article: string, qty: number) => number
  aujourdhuiIso: string
  seuilPremierPointageJours?: number
  seuilSilenceJours?: number
  ratioHeuresFaibles?: number
}

/**
 * Les quatre détecteurs. Chaque OF en cours apparaît dans au plus une des deux
 * premières familles (jamais pointé OU silence) : le silence suppose au moins
 * un pointage, le « jamais pointé » aucun.
 */
export function detecterAnomaliesPoste(e: DetecterAnomaliesEntrees): AnomaliesPosteResultat {
  const seuilPremier = e.seuilPremierPointageJours ?? SEUIL_PREMIER_POINTAGE_JOURS
  const seuilSilence = e.seuilSilenceJours ?? SEUIL_SILENCE_JOURS
  const ratio = e.ratioHeuresFaibles ?? RATIO_HEURES_FAIBLES

  // Index des pointages par OF : dernier jour + heures totales.
  const dernierPointage = new Map<string, string>()
  const heuresParOf = new Map<string, number>()
  for (const p of e.pointages) {
    const cur = dernierPointage.get(p.numOf)
    if (!cur || p.iptdat > cur) dernierPointage.set(p.numOf, p.iptdat)
    heuresParOf.set(p.numOf, (heuresParOf.get(p.numOf) ?? 0) + p.opetim + p.settim)
  }

  const jamaisPointes: AnomaliePoste[] = []
  const silences: AnomaliePoste[] = []
  const heures: AnomaliePoste[] = []

  for (const of of e.ofs) {
    const dernier = dernierPointage.get(of.numOf) ?? null
    const heuresPointees = Math.round((heuresParOf.get(of.numOf) ?? 0) * 100) / 100

    const base: AnomaliePoste = {
      kind: 'jamais_pointe',
      numOf: of.numOf,
      article: of.article,
      designation: of.designation,
      dateDebutIso: of.dateDebutIso,
      dernierPointageIso: dernier,
      jours: null,
      qtyDeclaree: of.qtyDeclaree > 0 ? of.qtyDeclaree : null,
      heuresPointees: heuresPointees > 0 ? heuresPointees : 0,
      heuresTheoriques: null,
    }

    // Détecteurs 1 & 2 — présence/absence de pointage, OF en cours.
    if (!of.dateDebutIso) {
      // Lancement inconnu : ni l'âge ni le silence ne sont démontrables.
    } else if (!dernier) {
      const jours = joursEntre(of.dateDebutIso, e.aujourdhuiIso)
      if (jours >= seuilPremier) jamaisPointes.push({ ...base, jours })
    } else {
      const jours = joursEntre(dernier, e.aujourdhuiIso)
      if (jours >= seuilSilence) silences.push({ ...base, kind: 'silence', jours })
    }

    // Détecteur 3 — déclaré mais pas (ou trop peu) pointé en heures.
    if (of.qtyDeclaree > 0) {
      const theo = Math.round(e.heuresTheoriquesPour(of.article, of.qtyDeclaree) * 100) / 100
      if (heuresPointees <= 0) {
        heures.push({ ...base, kind: 'sans_heures', heuresTheoriques: theo })
      } else if (theo > 0 && heuresPointees < ratio * theo) {
        heures.push({ ...base, kind: 'heures_faibles', heuresTheoriques: theo })
      }
    }
  }

  // Détecteur 4 — mêmes (OF, opération, jour) déclarés plusieurs fois.
  const parCle = new Map<string, DoublonDeclaration>()
  for (const p of e.pointages) {
    const cle = `${p.numOf}#${p.openum}#${p.iptdat}`
    const cur = parCle.get(cle)
    if (cur) cur.nombre += 1
    else parCle.set(cle, { numOf: p.numOf, openum: p.openum, iptdat: p.iptdat, nombre: 1 })
  }
  const doublons = [...parCle.values()]
    .filter((d) => d.nombre >= 2)
    .sort((a, b) => b.nombre - a.nombre || b.iptdat.localeCompare(a.iptdat))

  jamaisPointes.sort((a, b) => (b.jours ?? 0) - (a.jours ?? 0))
  silences.sort((a, b) => (b.jours ?? 0) - (a.jours ?? 0))
  heures.sort((a, b) => (a.heuresPointees ?? 0) - (b.heuresPointees ?? 0))

  return {
    jamaisPointes,
    silences,
    heures,
    doublons,
    ecartsDeclaration: [],
    ofsASolder: [],
  }
}
