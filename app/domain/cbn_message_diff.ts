import { TOLERANCE_ECHEANCE_JOURS } from '#app/domain/appro_decision'
import type { ApproMessageSnapshotRow } from '#app/domain/snapshot_rows'

/**
 * Diff pur des messages de replanification du CBN (#138 lot 1).
 *
 * Le CBN écrit les messages EN PLACE sur la ligne de `ORDERS` : la clé
 * `VCRNUM:VCRLIN:VCRSEQ` est stable d'un run à l'autre (#107, lot 0), au
 * contraire des suggestions recréées chaque nuit. Le diff porte donc sur
 * l'identité stable, pas sur le contenu apparié par échéance comme
 * `appro_snapshot_diff.ts`.
 *
 * Natures :
 * - `apparue`  — clé absente avant, présente après ;
 * - `disparue` — présente avant, absente après ;
 * - `intensifiee` — même clé, même code, |décalage| a grandi au-delà du seuil ;
 * - `attenuee`  — |décalage| a rétréci au-delà du seuil ;
 * - `modifiee`  — même clé, code `MRPMES_0` a changé (2→3, 2→6 …) ou
 *   date proposée apparue/disparue. Comptée à part pour ne pas noyer
 *   l'intensité sous un changement de nature.
 *
 * Le décalage = `MRPDAT - ENDDAT` (jours). Pour `inutile` (6) `MRPDAT` est
 * null → pas de décalage ; une transition vers/depuis `inutile` est donc
 * toujours `modifiee`.
 *
 * Pur, sans I/O.
 */

export type CbnMessageDiffNature = 'apparue' | 'disparue' | 'intensifiee' | 'attenuee' | 'modifiee'

export interface CbnMessageDiffEntry {
  nature: CbnMessageDiffNature
  vcrnum: string
  vcrlin: number
  vcrseq: string
  /** Clé stable textuelle, pratique pour l'UI / les tests. */
  cle: string
  article: string
  fournisseur: string | null
  /** Code avant / après. */
  mrpmesAvant: number | null
  mrpmesApres: number | null
  mrpdatAvant: string | null
  mrpdatApres: string | null
  enddatAvant: string | null
  enddatApres: string | null
  /** Décalage en jours (`MRPDAT - ENDDAT`), null si `MRPDAT` absent. */
  decalageAvant: number | null
  decalageApres: number | null
  detail: string
}

const cleMessage = (r: ApproMessageSnapshotRow): string => `${r.vcrnum}:${r.vcrlin}:${r.vcrseq}`

const joursEntre = (deIso: string | null, aIso: string | null): number | null => {
  if (deIso === null || aIso === null) return null
  const de = Date.parse(`${deIso}T00:00:00Z`)
  const a = Date.parse(`${aIso}T00:00:00Z`)
  if (!Number.isFinite(de) || !Number.isFinite(a)) return null
  return Math.round((a - de) / 86_400_000)
}

const decalage = (enddat: string | null, mrpdat: string | null): number | null =>
  joursEntre(enddat, mrpdat)

const libelle = (code: number): string => {
  if (code === 2) return 'avancer'
  if (code === 3) return 'retarder'
  if (code === 6) return 'inutile'
  return `code ${code}`
}

const fmtDecalage = (d: number | null): string => {
  if (d === null) return '—'
  const s = d > 0 ? `+${d}` : `${d}`
  return `${s} j`
}

/**
 * Diff pur entre deux photos de messages.
 * `avant` = plus ancienne, `apres` = plus récente.
 */
export function diffApproMessageSnapshots(
  avant: ApproMessageSnapshotRow[],
  apres: ApproMessageSnapshotRow[]
): CbnMessageDiffEntry[] {
  const out: CbnMessageDiffEntry[] = []

  const index = (rows: ApproMessageSnapshotRow[]): Map<string, ApproMessageSnapshotRow> => {
    const m = new Map<string, ApproMessageSnapshotRow>()
    for (const r of rows) m.set(cleMessage(r), r)
    return m
  }

  const mapAvant = index(avant)
  const mapApres = index(apres)
  const cles = new Set([...mapAvant.keys(), ...mapApres.keys()])

  for (const k of cles) {
    const a = mapAvant.get(k) ?? null
    const p = mapApres.get(k) ?? null

    if (a === null && p !== null) {
      const dec = decalage(p.enddat, p.mrpdat)
      out.push({
        nature: 'apparue',
        vcrnum: p.vcrnum,
        vcrlin: p.vcrlin,
        vcrseq: p.vcrseq,
        cle: k,
        article: p.itmref,
        fournisseur: p.fournisseur,
        mrpmesAvant: null,
        mrpmesApres: p.mrpmes,
        mrpdatAvant: null,
        mrpdatApres: p.mrpdat,
        enddatAvant: null,
        enddatApres: p.enddat,
        decalageAvant: null,
        decalageApres: dec,
        detail: `Message apparu : ${libelle(p.mrpmes)}${dec === null ? '' : ` (${fmtDecalage(dec)})`} — ${p.itmref}.`,
      })
      continue
    }

    if (a !== null && p === null) {
      const dec = decalage(a.enddat, a.mrpdat)
      out.push({
        nature: 'disparue',
        vcrnum: a.vcrnum,
        vcrlin: a.vcrlin,
        vcrseq: a.vcrseq,
        cle: k,
        article: a.itmref,
        fournisseur: a.fournisseur,
        mrpmesAvant: a.mrpmes,
        mrpmesApres: null,
        mrpdatAvant: a.mrpdat,
        mrpdatApres: null,
        enddatAvant: a.enddat,
        enddatApres: null,
        decalageAvant: dec,
        decalageApres: null,
        detail: `Message disparu : ${libelle(a.mrpmes)}${dec === null ? '' : ` (${fmtDecalage(dec)})`} — ${a.itmref}.`,
      })
      continue
    }

    // Les deux présents — comparer.
    if (a === null || p === null) continue
    const decA = decalage(a.enddat, a.mrpdat)
    const decP = decalage(p.enddat, p.mrpdat)

    // Code différent → modifiee (ne pas le noyer en intensité).
    if (a.mrpmes !== p.mrpmes) {
      out.push({
        nature: 'modifiee',
        vcrnum: p.vcrnum,
        vcrlin: p.vcrlin,
        vcrseq: p.vcrseq,
        cle: k,
        article: p.itmref,
        fournisseur: p.fournisseur,
        mrpmesAvant: a.mrpmes,
        mrpmesApres: p.mrpmes,
        mrpdatAvant: a.mrpdat,
        mrpdatApres: p.mrpdat,
        enddatAvant: a.enddat,
        enddatApres: p.enddat,
        decalageAvant: decA,
        decalageApres: decP,
        detail: `Message ${libelle(a.mrpmes)} → ${libelle(p.mrpmes)}${decA === null && decP === null ? '' : ` (${fmtDecalage(decA)} → ${fmtDecalage(decP)})`} — ${p.itmref}.`,
      })
      continue
    }

    // Même code, comparer les décalages. Un passage null↔date est aussi une
    // modification (ex: inutile sans date → retarder avec date) déjà capté par
    // le code, mais on le garde ici pour les cas code identique et date
    // apparue/disparue (théoriquement impossible avec RPLUPDQTY_2=1, mais
    // défensif).
    if ((decA === null) !== (decP === null)) {
      out.push({
        nature: 'modifiee',
        vcrnum: p.vcrnum,
        vcrlin: p.vcrlin,
        vcrseq: p.vcrseq,
        cle: k,
        article: p.itmref,
        fournisseur: p.fournisseur,
        mrpmesAvant: a.mrpmes,
        mrpmesApres: p.mrpmes,
        mrpdatAvant: a.mrpdat,
        mrpdatApres: p.mrpdat,
        enddatAvant: a.enddat,
        enddatApres: p.enddat,
        decalageAvant: decA,
        decalageApres: decP,
        detail: `Message ${libelle(p.mrpmes)} : date proposée ${decA === null ? 'apparue' : 'disparue'} (${fmtDecalage(decA)} → ${fmtDecalage(decP)}) — ${p.itmref}.`,
      })
      continue
    }

    if (decA === null && decP === null) continue

    // Les deux décalages présents — intensité = |decalage|.
    const magA = Math.abs(decA!)
    const magP = Math.abs(decP!)
    const delta = magP - magA
    if (Math.abs(delta) <= TOLERANCE_ECHEANCE_JOURS) continue

    if (delta > 0) {
      out.push({
        nature: 'intensifiee',
        vcrnum: p.vcrnum,
        vcrlin: p.vcrlin,
        vcrseq: p.vcrseq,
        cle: k,
        article: p.itmref,
        fournisseur: p.fournisseur,
        mrpmesAvant: a.mrpmes,
        mrpmesApres: p.mrpmes,
        mrpdatAvant: a.mrpdat,
        mrpdatApres: p.mrpdat,
        enddatAvant: a.enddat,
        enddatApres: p.enddat,
        decalageAvant: decA,
        decalageApres: decP,
        detail: `Décalage intensifié : ${fmtDecalage(decA)} → ${fmtDecalage(decP)} (+${delta} j) — ${libelle(p.mrpmes)} ${p.itmref}.`,
      })
    } else {
      out.push({
        nature: 'attenuee',
        vcrnum: p.vcrnum,
        vcrlin: p.vcrlin,
        vcrseq: p.vcrseq,
        cle: k,
        article: p.itmref,
        fournisseur: p.fournisseur,
        mrpmesAvant: a.mrpmes,
        mrpmesApres: p.mrpmes,
        mrpdatAvant: a.mrpdat,
        mrpdatApres: p.mrpdat,
        enddatAvant: a.enddat,
        enddatApres: p.enddat,
        decalageAvant: decA,
        decalageApres: decP,
        detail: `Décalage atténué : ${fmtDecalage(decA)} → ${fmtDecalage(decP)} (${delta} j) — ${libelle(p.mrpmes)} ${p.itmref}.`,
      })
    }
  }

  return out
}
