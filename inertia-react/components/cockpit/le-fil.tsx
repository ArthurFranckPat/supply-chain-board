/**
 * LeFil — « le fil du poste » (#119, design V3).
 *
 * Un poste de charge se lit sur UN axe de temps continu : le passé constaté
 * (réplique MFGOPETRK) et le futur engagé (OF fermes du programme) partagent
 * la même échelle, la même ligne de capacité, la même maille. La coupure
 * « aujourd'hui » est la seule rupture — « je tourne à 120 % depuis 6 mois ET
 * j'ai encore 188 % engagés la semaine prochaine » se lit en un coup d'œil.
 *
 * RÈGLES DE REPRÉSENTATION (maquette V3, verrouillées) :
 *  1. Une seule échelle pour tout le fil, calculée sur le max global.
 *  2. Ligne de capacité CALCULÉE depuis cette échelle, jamais posée.
 *  3. Une seule couleur de barre ; le dépassement se lit contre la ligne.
 *  4. Rempli = constaté. Contour hachuré = engagé, pas encore fait.
 *  5. Mesure par défaut = heures (seule unité où la capacité est exacte).
 *     Pièces/palettes : la capacité est alors convertie à la cadence moyenne
 *     constatée et étiquetée comme telle.
 *  6. Agrégation mois = SOMME des semaines, jamais échantillonnage.
 *  7. Verdicts issus de seuils explicites (VERDICTS), pas de prose écrite à
 *     la main qu'aucun serveur ne saurait rendre.
 */

import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { ToolbarSegment, ToolbarSegmented } from '@r/components/ui/toolbar'
import { HistogrammeCharge, type PeriodeCharge, type SegmentCharge } from '@r/components/ui/chart'
import { cn } from '@r/lib/utils'
import type { EngagementRow } from '@r/lib/board/engagement-format'

export type Mesure = 'h' | 'pc' | 'pal'
export type MailleFil = 'jour' | 'semaine' | 'mois'

/** Une période de la série passée (une des 3 mailles servies par le loader). */
export interface PassePeriode {
  /** Clé de période : lundi ISO (semaine), JJ-MM (jour), YYYY-MM (mois). */
  date: string
  heures: number
  qty: number
  /** Équivalent palette de la période — null = pas de coef (#119). */
  palettes: number | null
}

/** Une barre du fil, prête à rendre. */
interface Barre {
  /** Label court utilisé sur l'axe. */
  lab: string
  /** Libellé explicite utilisé dans le tooltip, cohérent avec la maille. */
  tooltipLab: string
  /** Valeur dans la mesure courante — null = trou (donnée absente), jamais de
   *  conversion locale vers l'unité (revue #119, round 3). */
  v: number | null
  /** Capacité dans la mesure courante — null = pas de ligne (mesure palettes :
   *  la capacité ne se convertit pas en palettes). */
  cap: number | null
  futur: boolean
  vide: boolean
}

/** Une anomalie datée. La reprojection sur la série passée de la maille
 *  courante se fait ICI (lundi pour semaine, YYYY-MM pour mois, jour exact) —
 *  même règle que `semVersBarre` de la maquette V3. Hors fenêtre → ignorée. */
export interface AnomalieFil {
  /** Date ISO la plus pertinente (dernier pointage ?? lancement ?? jour). */
  dateIso: string | null
  crit: boolean
  texte: string
}

export interface VerdictVue {
  /** Valeur brute à afficher (déjà dans la bonne unité). */
  big: string
  txt: string
  cls: 'ok' | 'warn' | 'bad' | 'mute'
  sub: string
}

export interface LeFilProps {
  /** Les 3 mailles passées réelles, servies précalculées par le loader. */
  passeParMaille: Record<MailleFil, PassePeriode[]>
  /** Heures totales pointées et pièces totales sur la fenêtre (cadence moyenne). */
  totaux: { heures: number; qty: number }
  /** OF engagés du programme (#46) — ventilés par semaine de début. */
  ofsEngages: Pick<EngagementRow, 'numOf' | 'dateDebutIso' | 'livraisonIso' | 'hours'>[]
  /** Capacité hebdomadaire nette (h) — WORKSTATIO × TABWEEDIA × rendement. */
  capaciteHebdoHeures: number | null
  /** Régime TABWEEDIA brut, utilisé pour retrouver la capacité nette par jour. */
  regimeHebdo: number[] | null
  /** Capacité CALENDAIRE (fériés/fermetures #37) par période de la maille,
   *  servie par le loader — jamais réapproximée ici (revue #119, round 3). */
  capaciteParMaille: Record<MailleFil, Map<string, number>>
  /** True si au moins une maille de la fenêtre porte un coefficient palette —
   *  sinon la mesure « Palettes » est désactivée (critère d'acceptation #119). */
  palettesDisponibles: boolean
  /** Anomalies reprojetées sur la série passée de la maille courante. */
  anomalies: AnomalieFil[]
  /**
   * Fenêtre affichée sur l'axe. Le contrôle vit dans la rangée d'outils de la
   * page (zone 01 « portée », standard §18) et non dans la carte : une fenêtre
   * de dates est de la portée, pas un réglage de graphe. `undefined` = toute la
   * période disponible.
   */
  periode: DayPickerRange | undefined
  maille: MailleFil
  onMaille: (m: MailleFil) => void
  mesure: Mesure
  onMesure: (m: Mesure) => void
  verdicts: { saturation: VerdictVue; fiabilite: VerdictVue; carnet: VerdictVue }
  /** Sous-titre honnête sur ce qu'on regarde (défaut calculé ici). */
  sub?: string
}

/** Seuils de verdict — implémentables tels quels côté serveur (maquette V3). */
export const VERDICTS = {
  saturation: [
    { max: 0.85, cls: 'warn', txt: 'Poste sous-employé' },
    { max: 1.05, cls: 'ok', txt: 'Poste à sa capacité' },
    { max: 1.25, cls: 'warn', txt: 'Au-dessus de la capacité déclarée' },
    { max: Infinity, cls: 'bad', txt: 'Capacité déclarée hors sujet' },
  ],
  fiabilite: [
    { max: 0.9, cls: 'warn', txt: 'Gamme trop généreuse' },
    { max: 1.1, cls: 'ok', txt: 'Gamme tenue' },
    { max: 1.25, cls: 'warn', txt: 'Gamme optimiste' },
    { max: Infinity, cls: 'bad', txt: 'Gamme à refaire' },
  ],
  carnet: [
    { max: 0.6, cls: 'warn', txt: 'Carnet creux' },
    { max: 1.05, cls: 'ok', txt: 'Carnet tenable' },
    { max: 1.4, cls: 'warn', txt: 'Carnet en surengagement' },
    { max: Infinity, cls: 'bad', txt: 'Carnet intenable' },
  ],
} as const

export type VerdictCls = 'ok' | 'warn' | 'bad'

export function verdictPour(
  table: readonly { max: number; cls: VerdictCls; txt: string }[],
  x: number
): { txt: string; cls: VerdictCls } {
  const v = table.find((s) => x < s.max) ?? table[table.length - 1]
  return { txt: v.txt, cls: v.cls }
}

/** Lundi ISO d'une date ISO (YYYY-MM-DD) — même règle que le domaine. */
export function lundiIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)

/** Les deux segments du fil : le constaté en brand pleine, l'engagé en brand
 *  éclaircie — la maquette V3 distinguait par le rempli contre la hachure, la
 *  lib ne hachure pas ; la couleur porte la coupure, la légende l'explique. */
const SEGMENTS_FIL: SegmentCharge[] = [
  {
    cle: 'constate',
    serie: 'reel',
    label: 'Constaté',
    couleur: 'color-mix(in oklab, var(--color-brand) 80%, transparent)',
  },
  {
    cle: 'engage',
    serie: 'projete',
    label: 'Engagé',
    couleur: 'color-mix(in oklab, var(--color-brand) 42%, transparent)',
  },
]

/** « S JJ/MM » à partir d'un lundi ISO — même style que l'axe actuel. */
function semaineCourte(lundiIso: string): string {
  const [, m, d] = /^(\d{4})-(\d{2})-(\d{2})/.exec(lundiIso) ?? []
  return m && d ? `S ${d}/${m}` : lundiIso
}

/** +7 jours sur une date ISO. */
function plusSeptJours(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** Étiquette courte d'une clé de période, selon la maille. */
function dateLongue(iso: string): string {
  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) ?? []
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** Libellé explicite de la période : le tooltip ne doit jamais laisser
 * deviner si une barre représente un jour, une semaine ou un mois. */
function tooltipPeriode(date: string, maille: MailleFil): string {
  if (maille === 'jour') return `Jour du ${dateLongue(date)}`
  if (maille === 'semaine') return `Semaine du ${dateLongue(date)}`
  const [y, m] = date.split('-').map(Number)
  const mois = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ]
  if (!y || !m) return `Mois de ${date}`
  const article = ['avril', 'août', 'octobre'].includes(mois[m - 1]) ? "d'" : 'de '
  return `Mois ${article}${mois[m - 1]} ${y}`
}

function labelPeriode(date: string, maille: MailleFil): string {
  if (maille === 'semaine') return semaineCourte(date)
  if (maille === 'jour') {
    const [, m, d] = /^(\d{4})-(\d{2})-(\d{2})/.exec(date) ?? []
    return m && d ? `${d}/${m}` : date
  }
  // mois : YYYY-MM → « févr. », « mars »…
  const [y, m] = date.split('-').map(Number)
  const COURTS = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ]
  const court = COURTS[(m ?? 1) - 1] ?? date
  return m === 1 ? `${court} ${String(y).slice(2)}` : court
}

/** Capacité (h) d'une période de la maille donnée. */
function isoDepuisDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function bornesPeriode(date: string, maille: MailleFil): [string, string] {
  if (maille === 'jour') return [date, date]
  if (maille === 'semaine') return [date, plusJours(date, 6)]
  const debut = `${date}-01`
  const fin = new Date(`${debut}T00:00:00`)
  fin.setMonth(fin.getMonth() + 1)
  fin.setDate(0)
  return [debut, isoDepuisDate(fin)]
}

function plusJours(iso: string, jours: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + jours)
  return isoDepuisDate(d)
}

function periodeChevauche(
  date: string,
  maille: MailleFil,
  range: DayPickerRange | undefined
): boolean {
  if (!range?.from && !range?.to) return true
  const [debut, fin] = bornesPeriode(date, maille)
  const from = range.from ? isoDepuisDate(range.from) : debut
  const to = range.to ? isoDepuisDate(range.to) : from
  return debut <= to && fin >= from
}

/**
 * Période couverte par la donnée du poste — le défaut de la fenêtre du fil.
 *
 * Exportée parce que le contrôle qui l'affiche a quitté la carte pour la rangée
 * d'outils de la page : la valeur par défaut se calcule là où le contrôle vit,
 * et la règle reste écrite une seule fois. `undefined` quand il n'y a aucune
 * date — la fenêtre ne borne alors rien, au lieu de se réduire à aujourd'hui.
 */
export function fenetreDisponible(
  joursIso: string[],
  datesOf: (string | null)[]
): DayPickerRange | undefined {
  const dates = [...joursIso, ...datesOf.filter((d): d is string => Boolean(d))].sort()
  if (dates.length === 0) return undefined
  return {
    from: new Date(`${dates[0]}T00:00:00`),
    to: new Date(`${dates[dates.length - 1]}T00:00:00`),
  }
}

function capPeriode(maille: MailleFil, capHebdo: number): number {
  if (capHebdo <= 0) return 0
  if (maille === 'semaine') return capHebdo
  if (maille === 'jour') return capHebdo / 5
  return capHebdo * 4.35 // mois moyen (8 h × 5 j × 4,35)
}

/**
 * LeFil : la carte centrale. Construit la série (passé réel + futur ventilé
 * selon la maille), calcule l'échelle unique et rend barres + capacité +
 * coupure + pastilles + verdicts.
 */
export function LeFil(props: LeFilProps) {
  const {
    passeParMaille,
    totaux,
    ofsEngages,
    capaciteHebdoHeures,
    regimeHebdo,
    capaciteParMaille,
    palettesDisponibles,
    anomalies,
    periode,
    maille,
    onMaille,
    mesure,
    onMesure,
    verdicts,
  } = props

  const capHebdo = capaciteHebdoHeures ?? 0
  const regimeBrutTotal = regimeHebdo?.reduce((sum, h) => sum + Math.max(0, h), 0) ?? 0
  const facteurNet = regimeBrutTotal > 0 && capHebdo > 0 ? capHebdo / regimeBrutTotal : 1
  const capaciteJour = (date: string): number => {
    if (!regimeHebdo || regimeBrutTotal <= 0) return capHebdo / 5
    const d = new Date(`${date}T00:00:00`)
    const index = (d.getDay() + 6) % 7
    return (regimeHebdo[index] ?? 0) * facteurNet
  }
  const capaciteMois = (mois: string): number => {
    const debut = `${mois}-01`
    const fin = new Date(`${debut}T00:00:00`)
    fin.setMonth(fin.getMonth() + 1)
    fin.setDate(0)
    let total = 0
    for (let d = new Date(`${debut}T00:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
      total += capaciteJour(isoDepuisDate(d))
    }
    return total
  }
  const cadenceMoy = totaux.heures > 0 ? totaux.qty / totaux.heures : 0
  /* Tooltip tap-to-toggle : clé du tooltip ouvert (bar-i ou ano-idx).
     Vide = aucun. Réinitialisé dans le useMemo de la série. */
  const [tipOpen, setTipOpen] = useState('')

  /* Ventilation des OF engagés : semaines de début (lundi ISO) → heures. */
  const futurParSemaine = useMemo(() => {
    const par = new Map<string, number>()
    for (const of of ofsEngages) {
      if (!of.dateDebutIso || !of.hours) continue
      const lundi = lundiIso(of.dateDebutIso)
      par.set(lundi, (par.get(lundi) ?? 0) + of.hours)
    }
    return [...par.entries()]
      .map(([lundi, heures]) => ({ lundi, heures }))
      .sort((a, b) => (a.lundi < b.lundi ? -1 : 1))
  }, [ofsEngages])

  /* Valeur d'une période PASSÉE dans la mesure courante. `palettes` (null =
     absence de coefficient) n'est lu QUE pour la mesure palettes : jamais de
     conversion locale vers des palettes — la maquette divisait par 60 et une
     maille sans coefficient s'affichait qty/60, un nombre faux qui avait l'air
     d'une donnée (revue #119, round 3). */
  const vPasse = (p: PassePeriode): number | null => {
    if (mesure === 'h') return p.heures
    if (mesure === 'pc') return p.qty
    return p.palettes
  }
  /* Valeur d'un OF ENGAGÉ : des heures seulement (X3 ne prédit pas de
     palettes) — converties en pièces à la cadence constatée pour la mesure
     pièces, TROU pour la mesure palettes. */
  const vFutur = (heures: number): number | null => {
    if (mesure === 'h') return heures
    if (mesure === 'pc') return heures * cadenceMoy
    return null
  }
  /* Capacité dans la mesure courante — heures exactes, pièces à la cadence
     constatée (règle 5 de la maquette), PALETTES JAMAIS : la capacité ne se
     convertit pas en palettes, la ligne disparaît (revue #119, round 3). */
  const capMesure = (h: number): number | null => {
    if (mesure === 'h') return h
    if (mesure === 'pc') return h * cadenceMoy
    return null
  }

  const serie = useMemo(() => {
    setTipOpen('')
    const toutesPassePeriodes = passeParMaille[maille] ?? []
    const passePeriodes = toutesPassePeriodes.filter((p) =>
      periodeChevauche(p.date, maille, periode)
    )
    const passe: Barre[] = passePeriodes.map((p) => {
      // Capacité calendaire servie par le loader (fériés/fermetures #37) ;
      // repli local seulement si la période manque à la carte (ne devrait pas
      // arriver : la carte couvre exactement la fenêtre).
      const capHeures =
        capaciteParMaille[maille].get(p.date) ??
        (maille === 'jour'
          ? capaciteJour(p.date)
          : maille === 'mois'
            ? capaciteMois(p.date)
            : capHebdo)
      return {
        cap: capMesure(capHeures),
        lab: labelPeriode(p.date, maille),
        tooltipLab: tooltipPeriode(p.date, maille),
        v: vPasse(p),
        futur: false,
        vide: false,
      }
    })

    const futur: Barre[] = []
    if (futurParSemaine.length > 0 && toutesPassePeriodes.length > 0) {
      const futurVisible = futurParSemaine.filter((f) =>
        periodeChevauche(f.lundi, 'semaine', periode)
      )
      if (maille === 'semaine' && futurVisible.length > 0) {
        const dernierLundi = toutesPassePeriodes[toutesPassePeriodes.length - 1].date
        let lundi = plusSeptJours(dernierLundi)
        const dernierFutur = futurVisible[futurVisible.length - 1].lundi
        let garde = 0
        while (lundi <= dernierFutur && garde < 6) {
          const heures = futurParSemaine.find((f) => f.lundi === lundi)?.heures ?? 0
          futur.push({
            lab: semaineCourte(lundi),
            tooltipLab: tooltipPeriode(lundi, 'semaine'),
            v: vFutur(heures),
            cap: capMesure(capHebdo),
            futur: true,
            vide: heures === 0,
          })
          lundi = plusSeptJours(lundi)
          garde++
        }
        // Semaine de respiration si le dernier OF est déjà couvert.
        if (futur.length > 0 && lundi <= plusSeptJours(dernierFutur)) {
          futur.push({
            lab: semaineCourte(lundi),
            tooltipLab: tooltipPeriode(lundi, 'semaine'),
            v: vFutur(0),
            cap: capMesure(capHebdo),
            futur: true,
            vide: true,
          })
        }
      } else if (maille === 'mois' && futurVisible.length > 0) {
        const hFut = futurVisible.reduce((a, f) => a + f.heures, 0)
        const moisFuturs = [...new Set(futurVisible.map((f) => f.lundi.slice(0, 7)))]
        const premierMois = moisFuturs[0] ?? ''
        const dernierMois = moisFuturs[moisFuturs.length - 1] ?? premierMois
        const libMois =
          premierMois && premierMois === dernierMois
            ? labelPeriode(premierMois, 'mois')
            : premierMois && dernierMois
              ? `${labelPeriode(premierMois, 'mois')} → ${labelPeriode(dernierMois, 'mois')}`
              : 'À venir'
        futur.push({
          lab: libMois,
          tooltipLab: `Engagement agrégé · ${libMois}`,
          v: vFutur(hFut),
          cap: capMesure(moisFuturs.reduce((total, mois) => total + capaciteMois(mois), 0)),
          futur: true,
          vide: hFut === 0,
        })
      } else if (maille === 'jour') {
        // jour : chaque OF sur son jour de début.
        const parJour = new Map<string, number>()
        for (const of of ofsEngages) {
          if (!of.dateDebutIso || !of.hours) continue
          if (!periodeChevauche(of.dateDebutIso, 'jour', periode)) continue
          parJour.set(of.dateDebutIso, (parJour.get(of.dateDebutIso) ?? 0) + of.hours)
        }
        for (const [jour, heures] of [...parJour.entries()].sort()) {
          futur.push({
            lab: `${jour.slice(8, 10)}/${jour.slice(5, 7)}`,
            tooltipLab: tooltipPeriode(jour, 'jour'),
            v: vFutur(heures),
            cap: capMesure(capaciteJour(jour)),
            futur: true,
            vide: false,
          })
        }
      }
    }

    return { passe, futur }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    passeParMaille,
    maille,
    mesure,
    futurParSemaine,
    cadenceMoy,
    capHebdo,
    ofsEngages,
    periode,
    regimeHebdo,
  ])

  const all = [...serie.passe, ...serie.futur]
  const capMax = Math.max(...all.map((b) => b.cap ?? 0), 0)
  const max = Math.max(...all.map((b) => b.v ?? 0), capMax) * 1.06 || 1
  const nPasse = serie.passe.length

  /** Périodes de la lib : une par barre du fil, une seule série par période
   *  (constaté OU engagé), capacité calendaire portée par période. */
  const periodes = useMemo<PeriodeCharge[]>(
    () =>
      [...serie.passe, ...serie.futur].map((b, i) => ({
        cle: `p${i}`,
        label: b.tooltipLab,
        valeurs: b.v !== null && b.v > 0 ? { [b.futur ? 'engage' : 'constate']: b.v } : {},
        capacite: b.cap !== null && b.cap > 0 ? b.cap : null,
      })),
    [serie.passe, serie.futur]
  )

  const UNITE_LAB: Record<Mesure, string> = { h: 'h', pc: 'pc', pal: 'pal' }
  const libMesure = { h: 'heures pointées', pc: 'pièces déclarées', pal: 'palettes' }[mesure]
  const libMaille = { jour: 'par jour', semaine: 'par semaine', mois: 'par mois' }[maille]

  const sub =
    props.sub ??
    `${serie.passe.length} périodes constatées${
      // En mesure palettes les OF engagés n'ont pas d'équivalent (heures
      // seules) : on ne les annonce pas si aucune barre n'est représentable
      // (revue #119, round 4).
      serie.futur.some((b) => b.v !== null) ? ` + ${serie.futur.length} engagées` : ''
    } · ${libMesure} ${libMaille}`

  /* Reprojection des anomalies sur la série passée de la maille courante,
     puis regroupement par index (compteur sur la pastille). */
  const parIndex = useMemo(() => {
    const passePeriodes = (passeParMaille[maille] ?? []).filter((p) =>
      periodeChevauche(p.date, maille, periode)
    )
    const m = new Map<number, AnomalieFil[]>()
    for (const a of anomalies) {
      const dateIso = a.dateIso
      if (!dateIso) continue
      const idx =
        maille === 'jour'
          ? passePeriodes.findIndex((p) => p.date === dateIso)
          : maille === 'mois'
            ? passePeriodes.findIndex((p) => p.date === dateIso.slice(0, 7))
            : passePeriodes.findIndex((p) => p.date === lundiIso(dateIso))
      if (idx === -1) continue
      const l = m.get(idx) ?? []
      l.push(a)
      m.set(idx, l)
    }
    return m
  }, [anomalies, maille, passeParMaille, periode])

  return (
    <section className="rounded-lg border border-rule bg-card shadow-float">
      {/* En-tête */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="text-[15px] font-bold tracking-tight text-foreground">Le fil du poste</h2>
        <span className="font-mono text-2xs text-muted-foreground">{sub}</span>
      </div>

      {/* Maille et mesure : deux segmented controls du design system, restés
          LOCAUX au graphe. Ils ne gouvernent que ce fil — les cinq autres
          sections de la page ne bougent pas d'un pixel quand on passe de
          « Semaine » à « Mois ». Les monter dans la rangée les aurait présentés
          comme la portée de la page, et aurait mangé deux des cinq contrôles
          qu'elle autorise. Le libellé « Maille »/« Mesure » tombe : « Jour ·
          Semaine · Mois » et « Heures · Pièces · Palettes » se nomment
          eux-mêmes, l'aria-label porte le reste. */}
      <div className="flex flex-wrap items-center gap-2 px-5 pt-2.5">
        <ToolbarSegmented semantics="tabs" aria-label="Maille du fil">
          {(['jour', 'semaine', 'mois'] as const).map((m) => (
            <ToolbarSegment key={m} active={maille === m} onClick={() => onMaille(m)}>
              {m === 'jour' ? 'Jour' : m === 'semaine' ? 'Semaine' : 'Mois'}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>

        <ToolbarSegmented semantics="tabs" aria-label="Mesure du fil">
          {(['h', 'pc', 'pal'] as const).map((m) => (
            <ToolbarSegment
              key={m}
              active={mesure === m}
              onClick={() => onMesure(m)}
              disabled={m === 'pal' && !palettesDisponibles}
              className="disabled:cursor-not-allowed disabled:opacity-40"
              title={
                m === 'pal' && !palettesDisponibles
                  ? 'Aucun coefficient palette sur la fenêtre'
                  : undefined
              }
            >
              {m === 'h' ? 'Heures' : m === 'pc' ? 'Pièces' : 'Palettes'}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>
      </div>

      {/* Légende visible avant le graphe : elle reste lisible même quand la
          granularité Jour produit plus d'une centaine de barres. */}
      <div className="mx-5 mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-rule-soft py-2.5 text-1.5xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-[10px] w-3 rounded-[2px]"
            style={{ backgroundColor: 'color-mix(in oklab, var(--color-brand) 80%, transparent)' }}
          />
          Constaté · pointages
        </span>
        {/* En mesure palettes, ni la capacité (capMesure → null) ni les OF
            engagés (heures seules, vFutur → null) ne sont représentés : on ne
            légende pas des marques inexistantes (revue #119, round 4). */}
        {serie.futur.some((b) => b.v !== null) && (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-[10px] w-3 rounded-[2px]"
              style={{
                backgroundColor: 'color-mix(in oklab, var(--color-brand) 42%, transparent)',
              }}
            />
            Engagé · OF fermes
          </span>
        )}
        {capMax > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-3 border-t-2 border-dashed border-input" />
            {mesure === 'h' ? 'Capacité déclarée' : 'Capacité convertie'}
          </span>
        )}
      </div>

      {/* Le fil — barres, capacité et coupure par HistogrammeCharge
          (@tanstack/charts) ; trous, respiration, pastilles d'anomalies et
          étiquettes en overlay HTML calé sur les mêmes proportions. */}
      <div className="px-5 pb-1 pt-4">
        <div className="relative h-[190px]">
          <HistogrammeCharge
            periodes={periodes}
            segments={SEGMENTS_FIL}
            max={max}
            hauteur={190}
            afficherAxes={false}
            afficherCapacite
            regleX={nPasse > 0 && nPasse < all.length ? `p${nPasse}` : null}
            largeurInitiale={700}
            format={fmt}
            formatTooltip={(points) => {
              const premier = points[0]?.datum
              if (!premier) return ''
              const b = all[Number(premier.cle.slice(1))]
              if (!b) return ''
              const detail = b.vide
                ? 'Aucune heure engagée'
                : b.v === null
                  ? 'Équivalent palette indisponible'
                  : `${fmt(b.v)} ${UNITE_LAB[mesure]}`
              const statut = b.futur ? 'Engagé' : 'Constaté'
              const sat =
                b.cap !== null && b.cap > 0 && b.v !== null
                  ? ` · ${Math.round((b.v / b.cap) * 100)} % de la capacité`
                  : ''
              return `${b.tooltipLab} — ${statut}\n${detail}${sat}`
            }}
            ariaLabel={`Le fil du poste — ${serie.passe.length} périodes constatées et ${serie.futur.length} engagées`}
            ariaDescription={`${fmt(capMax)} de capacité au plafond, en ${libMesure} ${libMaille}`}
          />

          {/* Trous : donnée absente — un marqueur au sol, jamais un zéro. */}
          <div className="pointer-events-none absolute inset-0 z-[2]">
            {all.map((b, i) =>
              b.v === null ? (
                <span
                  key={`trou-${i}`}
                  className="absolute bottom-0 h-[3px] w-[2px] -translate-x-1/2 border-b-2 border-dotted border-muted-foreground/40"
                  style={{ left: `${((i + 0.5) / all.length) * 100}%` }}
                />
              ) : null
            )}
          </div>

          {/* Respiration : semaine engagée à zéro heure. */}
          <div className="pointer-events-none absolute inset-0 z-[2]">
            {all.map((b, i) =>
              b.vide && b.futur ? (
                <span
                  key={`vide-${i}`}
                  className="absolute bottom-0 h-[5px] w-[6px] -translate-x-1/2 rounded-[2px] border border-dashed border-brand/50"
                  style={{ left: `${((i + 0.5) / all.length) * 100}%` }}
                />
              ) : null
            )}
          </div>

          {/* Étiquette de capacité — le trait est la courbe de la lib. */}
          {capMax > 0 && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-[3]"
              style={{ top: `${(1 - capMax / max) * 100}%` }}
            >
              <span className="absolute -top-2 right-0 bg-card px-1.5 text-4xs font-bold uppercase tracking-wide text-muted-foreground">
                {mesure === 'h'
                  ? `Capacité ${fmt(capMax)} h`
                  : `Capacité ≈ ${fmt(capMax)} ${UNITE_LAB[mesure]} (convertie à ${fmt(cadenceMoy)} pc/h)`}
              </span>
            </div>
          )}

          {/* Coupure aujourd'hui : la ligne vient de la règle de la lib, la
              pastille reste du HTML posé sur le premier band futur. */}
          {nPasse > 0 && nPasse < all.length && (
            <div
              className="pointer-events-none absolute inset-y-0 z-[4]"
              style={{ left: `${((nPasse + 0.5) / all.length) * 100}%` }}
            >
              <span className="absolute left-1/2 top-[-18px] -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-4xs font-extrabold uppercase tracking-wide text-background">
                Aujourd'hui
              </span>
            </div>
          )}

          {/* Pastilles d'anomalies, ancrées sur la barre qui les porte. */}
          <div className="pointer-events-none absolute inset-0 z-[5]">
            {[...parIndex.entries()].map(([idx, liste]) => {
              const barre = serie.passe[idx]
              if (!barre) return null
              const v = barre.v ?? 0
              const top = (1 - v / max) * 100
              const crit = liste.some((a) => a.crit)
              const tooltipAlign = tooltipAlignClass(idx, all.length)
              const tooltipPlacement = tooltipPlacementClass(top)
              return (
                <div
                  key={idx}
                  tabIndex={0}
                  aria-label={`${liste.length} anomalie${liste.length > 1 ? 's' : ''}`}
                  onClick={() => setTipOpen(tipOpen === `ano-${idx}` ? '' : `ano-${idx}`)}
                  className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer outline-none after:absolute after:inset-[-14px] after:rounded-full after:content-[''] focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                  style={{ left: `${((idx + 0.5) / all.length) * 100}%`, top: `${top}%` }}
                >
                  <span
                    className={cn(
                      'relative flex h-[15px] min-w-[15px] items-center justify-center rounded-full border-2 border-card px-0.5 text-4xs font-extrabold shadow-float',
                      crit
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-suggere text-foreground'
                    )}
                  >
                    {liste.length}
                  </span>
                  <span
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute z-30 hidden min-w-[190px] rounded-lg border border-background/10 bg-foreground px-3 py-2 text-left text-2xs text-background shadow-float group-hover:block group-focus-within:block',
                      tipOpen === `ano-${idx}` && '!block',
                      tooltipAlign,
                      tooltipPlacement
                    )}
                  >
                    <span className="mb-1 flex items-center justify-between gap-3 border-b border-background/15 pb-1 font-semibold">
                      <span>
                        {liste.length} anomalie{liste.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-brand">{barre.tooltipLab}</span>
                    </span>
                    <span className="flex flex-col gap-0.5 text-background/90">
                      {liste.map((a) => (
                        <span key={a.texte}>{a.texte}</span>
                      ))}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Axe */}
        <div className="flex pt-1 font-mono text-3xs font-semibold text-muted-foreground">
          {all.map((b, i) => (
            <span key={i} className={cn('flex-1 truncate text-center', b.futur && 'text-brand')}>
              {i === 0 ||
              i === all.length - 1 ||
              (i + 1) % Math.max(1, Math.floor(all.length / 7)) === 0
                ? b.lab
                : ''}
            </span>
          ))}
        </div>

        <div className="mt-2 text-right text-2xs text-muted-foreground">
          Survoler ou toucher une barre pour le détail · une pastille pour l'anomalie
        </div>
      </div>

      {/* Overlay de dismiss : un tap ailleurs referme le tooltip ouvert. */}
      {tipOpen && (
        <div className="fixed inset-0 z-50" onClick={() => setTipOpen('')} aria-hidden="true" />
      )}

      {/* Verdicts — seuils explicites, pas de prose écrite à la main. */}
      <div className="mt-3 grid grid-cols-1 divide-y divide-rule-soft border-t border-rule-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <VerdictCell k="Charge constatée · 6 mois" v={verdicts.saturation} />
        <VerdictCell k="Fiabilité du temps de gamme" v={verdicts.fiabilite} />
        <VerdictCell k="Carnet engagé" v={verdicts.carnet} />
      </div>
    </section>
  )
}

function VerdictCell(props: { k: string; v: VerdictVue }) {
  const { k, v } = props
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3 sm:px-6">
      <span className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">{k}</span>
      <span
        className="text-[26px] font-extrabold leading-tight tracking-tight"
        dangerouslySetInnerHTML={{ __html: v.big }}
      />
      <span
        className={cn(
          'text-1.5xs font-bold',
          v.cls === 'ok' && 'text-ferme',
          v.cls === 'warn' && 'text-suggere',
          v.cls === 'bad' && 'text-destructive',
          v.cls === 'mute' && 'text-muted-foreground'
        )}
      >
        {v.txt}
      </span>
      <span className="text-2xs leading-snug text-muted-foreground">{v.sub}</span>
    </div>
  )
}

function tooltipAlignClass(index: number, total: number): string {
  if (index < 3) return 'left-0'
  if (index >= total - 3) return 'left-auto right-0'
  return 'left-1/2 -translate-x-1/2'
}

/** Les barres proches du haut du graphe affichent leur tooltip dessous pour
 * éviter qu'il soit coupé par le bord de la carte. */
function tooltipPlacementClass(topPct: number): string {
  return topPct < 28 ? 'top-full mt-2' : 'bottom-full mb-2'
}

/** Exporté pour les tests éventuels. */
export const __internal = {
  semaineCourte,
  plusSeptJours,
  lundiIso,
  verdictPour,
  labelPeriode,
  capPeriode,
  tooltipAlignClass,
  tooltipPlacementClass,
}
