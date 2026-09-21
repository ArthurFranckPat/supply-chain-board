/**
 * Assemblage des entrées du moteur de lissage de charge, pour UN poste.
 *
 * Le domaine (`load_smoothing.ts`) ne connaît ni X3, ni le calendrier usine, ni
 * la nomenclature : il reçoit des lignes datées, une capacité par jour, et rend
 * un plan. C'est ici qu'on fabrique ces deux entrées — et surtout qu'on plafonne
 * l'avance par la disponibilité matière, ce que le moteur ne peut pas faire.
 *
 * ── Une seule chaîne d'ingestion, celle de /charge ──────────────────────────
 * Les lignes viennent de `computeChargeNeeds()` sur les `ChargeInputs` de la
 * page, avec le MÊME `chargeDay()` et le même calendrier. Aucun calcul de charge
 * n'est réécrit ici : une proposition de lissage qui ne retomberait pas sur le
 * profil affiché par /charge serait indéfendable devant le planificateur, qui
 * regarde ce graphe-là en décrochant son téléphone.
 *
 * La fenêtre passée à `fetchChargeInputs()` est celle de /charge (6 mois depuis
 * le 1er du mois) et non les 3 semaines du lissage : c'est ce qui fait tomber
 * l'appel sur les entrées de cache déjà chaudes de la page. Le lissage ne coûte
 * donc rien de plus côté demande, OF, gammes et pointages.
 *
 * ── Le cran de charge : le RESTE À PRODUIRE ─────────────────────────────────
 * On organise le travail qui reste, pas celui qui est déjà sorti de la ligne
 * sans avoir été déclaré.
 *
 * ── L'unité déplaçable : la LIGNE DE COMMANDE, entière ──────────────────────
 * Un même couple (commande, ligne) peut charger le poste plusieurs fois — le
 * produit fini à sa gamme, et un composant induit qui repasse par le même poste.
 * Ces heures sont agrégées en UNE ligne déplaçable : elles bougent ensemble ou
 * pas du tout. Les émettre séparément laisserait le moteur poser la moitié d'une
 * commande le lundi et l'autre le jeudi, ce que le CBN ne saurait pas rejouer.
 *
 * ── Ce qui ne bouge pas, et pourquoi ────────────────────────────────────────
 * Une PRÉVISION est clouée sur sa date, dans les deux sens. `mobiliteDeLigne()`
 * la rend déjà `ferme`, mais `ferme` au sens du moteur veut dire « ne peut pas
 * reculer » — une ligne export ferme peut, elle, être avancée. Une prévision
 * n'a aucune ligne de commande à re-dater : l'avancer ne produit rien de réel.
 * Sa fenêtre est donc réduite à son seul jour, explicitement, ici.
 */

import { cacheNs } from '#services/cache_ns'
import { stamped } from '#services/computed_age'
import boardDataset from '#services/board_dataset'
import staticSync from '#services/static_sync_service'
import capacityCalendar from '#services/capacity_calendar_service'
import { OrderLineOverrideStore } from '#services/order_line_override_store'
import { X3OrderLineRepository } from '#repositories/order_line_repository'
import { addDays, atMidnight, isoDay, mondayOf } from '#app/utils/dates'
import type { Flow } from '#app/domain/models/flow'
import { capDay, chargeHoursWithEfficiency, isOpenDay } from '#app/domain/capacity'
import { collectBom } from '#app/domain/charge_explosion'
import { explodeMaterialNeeds } from '#app/domain/material_plan'
import {
  projectMaterialPlan,
  type ArticleSupply,
  type ProjectionDemand,
} from '#app/domain/material_projection'
import { sumAvailableStock } from '#services/material_plan_loader'
import {
  buildEncoursByArticle,
  chargeDay,
  chargeHorizon,
  chargeOrderLines,
  computeChargeNeeds,
  fetchChargeInputs,
} from '#services/load_payload_loader'
import {
  fenetreDeplacement,
  lisserCharge,
  mobiliteDeLigne,
  type JourCapacite,
  type LigneLissage,
  type Mobilite,
  type PlanLissage,
} from '#app/domain/load_smoothing'
import {
  alertesApresLissage,
  borneMatiereAvance,
  margeCumulee,
  type BesoinComposant,
  type MouvementMatiere,
} from '#app/domain/load_smoothing_material'

/**
 * Horizon du lissage, en semaines. **Trois** : c'est l'horizon de décision donné
 * par le métier. Une date de commande
 * renégociée pour dans six semaines aura été rejalonnée cinq fois d'ici là.
 */
export const LISSAGE_SEMAINES = 3

/** Paramètre invalide — le contrôleur le traduira en 400, comme /charge. */
export class LissageBadRequest extends Error {}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** `YYYY-MM-DD` → `jj/mm/aaaa`. Découpage de chaîne : aucun risque de fuseau. */
const dateFr = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

const r1 = (n: number): number => Math.round(n * 10) / 10
const r2 = (n: number): number => Math.round(n * 100) / 100

/** Composant qui empêche une ligne d'être avancée autant que la règle le permettrait. */
export interface ComposantBloquantLisible {
  article: string
  designation: string | null
  /** Quantité appelée par CETTE ligne de commande. */
  quantite: number
  /** Première date où ce composant laisse passer cette quantité. */
  disponibleLeIso: string
  disponibleLe: string
  /** Composant absent de la projection : on ne sait rien, donc on ne bouge pas. */
  inconnu: boolean
}

/**
 * Ligne dont l'avance a été rognée par la matière.
 *
 * C'est une information MÉTIER de première importance, pas un détail : elle dit
 * qu'un pic ne se résorbera pas par la négociation commerciale seule, et que le
 * levier est chez l'approvisionneur. Elle est rendue même quand le moteur
 * n'aurait de toute façon pas voulu avancer la ligne — sinon l'écran ne pourrait
 * jamais répondre « pourquoi n'a-t-on pas dégagé ce lundi ? ».
 */
export interface AvanceLimiteeMatiere {
  numCommande: string
  ligne: string
  article: string
  designation: string | null
  client: string | null
  clientCode: string | null
  heures: number
  dateActuelleIso: string
  dateActuelle: string
  /** Ce que la seule règle commerciale autorisait (date − 10 jours ouvrés). */
  auPlusTotSansMatiereIso: string
  auPlusTotSansMatiere: string
  /** Ce que la matière autorise réellement. */
  auPlusTotIso: string
  auPlusTot: string
  /** Jours ouvrés d'avance perdus à cause de la matière. */
  joursOuvresPerdus: number
  composants: ComposantBloquantLisible[]
  /** Le plan final laisse-t-il cette ligne sur sa date d'origine ? */
  resteeSurPlace: boolean
}

/** Déplacement proposé, prêt à afficher — aucune règle à rejouer côté écran. */
export interface DeplacementLisible {
  numCommande: string
  ligne: string
  article: string
  designation: string | null
  client: string | null
  clientCode: string | null
  mobilite: Mobilite
  motifMobilite: string
  heures: number
  dateActuelleIso: string
  dateActuelle: string
  dateProposeeIso: string
  dateProposee: string
  sens: 'avance' | 'retard'
  /** Amplitude en jours OUVRÉS du poste, pas en jours calendaires. */
  joursOuvres: number
}

/** Rupture matière CRÉÉE par le plan proposé — contrôle groupé, après coup. */
export interface AlerteMatiereLisible {
  article: string
  designation: string | null
  dateIso: string
  date: string
  manque: number
}

/**
 * Maille de la borne matière. Déclarée dans le type, pas devinée à la lecture :
 * une borne grossière annoncée vaut mieux qu'une borne fausse. Aujourd'hui
 * `jour` — `material_projection` indexe ses buckets librement, on lui en passe
 * un par jour de l'horizon.
 */
export type MailleBorneMatiere = 'jour' | 'semaine'

export interface PlanLissagePoste {
  poste: { code: string; label: string }
  horizon: {
    debutIso: string
    finIso: string
    semaines: number
    /** Nombre de jours ouverts du poste sur l'horizon (calendrier appliqué). */
    joursOuvres: number
  }
  /** Sortie brute du moteur : profil avant/après, déplacements, indicateurs. */
  plan: PlanLissage
  /** Les mêmes déplacements, enrichis de quoi les lire sans rien recalculer. */
  deplacements: DeplacementLisible[]
  borneMatiere: {
    maille: MailleBorneMatiere
    /** Nombre de lignes dont l'avance a été rognée. */
    lignesLimitees: number
    lignes: AvanceLimiteeMatiere[]
    /** Ruptures que le plan RETENU créerait — contrôle groupé (cf. domaine). */
    alertes: AlerteMatiereLisible[]
    /** Limites connues de la borne, en clair — l'écran les affiche telles quelles. */
    avertissements: string[]
  }
  x3Error: string | null
}

export interface LissageParams {
  poste: string
  /** Premier jour de l'horizon (ISO) — ramené au lundi. Défaut : semaine courante. */
  start?: string
  semaines?: number
  force?: boolean
}

/** Clé d'une ligne de commande — même convention que les overrides de date. */
export const cleLigne = (numCommande: string | null, ligne: string | null): string =>
  `${numCommande ?? ''}#${ligne ?? ''}`

/**
 * Une contribution de charge du poste, rattachée à un jour de l'horizon.
 * Sous-ensemble de `ChargeNeed` : le strict nécessaire au lissage.
 */
export interface ChargePoste {
  numCommande: string | null
  ligne: string | null
  /** Produit fini de tête — c'est l'article de la ligne de commande. */
  article: string
  clientCode: string | null
  prevision: boolean
  heures: number
  /** Index du jour de rattachement dans l'horizon. */
  index: number
}

/** Une ligne déplaçable, après agrégation, avant calcul de sa fenêtre. */
export type LigneBrute = ChargePoste

/**
 * Agrège les contributions du poste PAR LIGNE DE COMMANDE.
 *
 * Un même couple (commande, ligne) charge le poste plusieurs fois dès que le
 * produit fini et un composant induit repassent par lui. Ces heures bougent
 * ensemble ou pas du tout : les laisser séparées autoriserait le moteur à poser
 * la moitié d'une commande le lundi et l'autre le jeudi, ce que le CBN ne
 * saurait pas rejouer.
 */
export function agregeParLigneDeCommande(charges: ChargePoste[]): Map<string, LigneBrute> {
  const out = new Map<string, LigneBrute>()
  for (const c of charges) {
    if (c.heures <= 0) continue
    const cle = cleLigne(c.numCommande, c.ligne)
    const deja = out.get(cle)
    if (!deja) {
      out.set(cle, { ...c })
      continue
    }
    deja.heures += c.heures
    // Deux jours de rattachement pour une même ligne de commande est une
    // anomalie (la demande n'a qu'une date) : on retient le plus tôt plutôt que
    // de scinder la ligne en deux objets déplaçables.
    if (c.index < deja.index) deja.index = c.index
  }
  return out
}

/** Fenêtre autorisée par la seule règle commerciale, avant plafond matière. */
export interface FenetreLigne {
  ligne: LigneLissage
  /** Index du plancher d'avance — la matière ne fait que le remonter. */
  plancher: number
  /**
   * Ligne clouée sur sa date : prévision, ou demande sans ligne de commande
   * identifiée. Elle pèse dans le profil, elle ne peut pas servir de levier.
   */
  epinglee: boolean
}

/**
 * Fenêtre commerciale d'une ligne, bornée à l'horizon du poste.
 *
 * Une PRÉVISION est clouée dans les DEUX sens. `mobiliteDeLigne()` la rend déjà
 * `ferme`, mais `ferme` au sens du moteur veut dire « ne peut pas reculer » —
 * une ligne export ferme peut, elle, être avancée. Une prévision n'a aucune
 * ligne de commande à re-dater : l'avancer ne produit rien de réel, et une
 * proposition qui ne se traduit par aucune action est pire qu'aucune
 * proposition.
 */
export function fenetreCommerciale(
  b: LigneBrute,
  jours: JourCapacite[],
  joursOuvres: string[]
): FenetreLigne {
  const dateIso = jours[b.index]!.dateIso
  const mob = mobiliteDeLigne(b.clientCode)
  const base = {
    numCommande: b.numCommande ?? b.article,
    ligne: b.ligne ?? '',
    heures: b.heures,
    dateIso,
    export: mob.export,
  }
  if (b.prevision || !b.numCommande) {
    return {
      ligne: { ...base, auPlusTotIso: dateIso, auPlusTardIso: dateIso },
      plancher: b.index,
      epinglee: true,
    }
  }
  const fenetre = fenetreDeplacement(dateIso, mob, joursOuvres)
  const plancher = jours.findIndex((j) => j.dateIso === fenetre.auPlusTotIso)
  return {
    ligne: { ...base, auPlusTotIso: fenetre.auPlusTotIso, auPlusTardIso: fenetre.auPlusTardIso },
    plancher: plancher < 0 ? b.index : plancher,
    epinglee: false,
  }
}

export async function loadPlanLissage(params: LissageParams): Promise<PlanLissagePoste> {
  const poste = params.poste.trim()
  if (!poste) throw new LissageBadRequest('Poste manquant')
  if (params.start && !ISO_RE.test(params.start)) {
    throw new LissageBadRequest('start au format YYYY-MM-DD requis')
  }
  const semaines = params.semaines ?? LISSAGE_SEMAINES
  if (!Number.isInteger(semaines) || semaines < 1 || semaines > 8) {
    throw new LissageBadRequest('semaines doit être un entier entre 1 et 8')
  }

  const debut = mondayOf(params.start ? atMidnight(new Date(params.start)) : new Date())
  const fin = addDays(debut, semaines * 7 - 1)
  const force = !!params.force

  // Empreinte des overrides : ils datent la demande de /charge, donc le profil
  // d'entrée du lissage. Une clé qui les ignore proposerait de re-déplacer une
  // ligne qu'on vient de déplacer.
  const ovSig = await new OrderLineOverrideStore().signature().catch(() => 'none')
  const cacheKey = `lissage:s1:${poste}:${isoDay(debut)}:${semaines}:ov${ovSig}`
  if (force) await cacheNs('charge').delete({ key: cacheKey })

  return cacheNs('charge').getOrSet({
    key: cacheKey,
    ttl: 2 * 60 * 1000,
    timeout: 0,
    factory: stamped(async (): Promise<PlanLissagePoste> => {
      // Fenêtre de /charge, pas celle du lissage : mêmes arguments, donc mêmes
      // entrées de cache que la page — le lissage ne relit rien.
      //
      // Élargie au mois de `debut` dans le seul cas où elle ne le couvrirait
      // pas : une semaine à cheval sur deux mois (lundi 28/09 pour un horizon
      // ouvert le 01/10) verrait sinon ses premiers jours SANS demande lue,
      // donc vides — et le moteur s'empresserait d'y poser de la charge. Un
      // jour faussement libre est la pire sortie possible pour cet outil.
      const courant = chargeHorizon()
      const { monthStart, horizonEnd } =
        debut >= courant.monthStart ? courant : chargeHorizon(isoDay(debut))
      const inputs = await fetchChargeInputs(monthStart, horizonEnd, force)
      const wstByCode = new Map(inputs.workstations.map((w) => [w.code, w]))
      const w = wstByCode.get(poste)
      if (!w) throw new LissageBadRequest(`poste de charge inconnu : ${poste}`)

      const calendar = await capacityCalendar
        .buildCalendar(debut.getFullYear(), fin.getFullYear())
        .catch(() => null)

      // ── 1. Capacité jour par jour ────────────────────────────────────────
      // MÊME calcul que les barres du graphe et que le panneau de détail
      // (`capDay` × facteur calendrier, sentinelle X3 des jours chômés écartée
      // par `isOpenDay`). Une capacité recopiée autrement ici, et le moteur
      // lisserait contre un plafond que l'écran n'affiche pas.
      const jours: JourCapacite[] = []
      for (let d = new Date(debut); d <= fin; d = addDays(d, 1)) {
        const iso = isoDay(d)
        const factor = calendar ? calendar.factor(w, iso) : 1
        const ouvert = isOpenDay(w, d, factor)
        jours.push({ dateIso: iso, capaciteH: ouvert ? r1(capDay(w, d) * factor) : 0 })
      }
      const indexParIso = new Map(jours.map((j, i) => [j.dateIso, i]))
      const joursOuvres = jours.filter((j) => j.capaciteH > 0).map((j) => j.dateIso)

      // ── 2. Lignes de charge du poste, agrégées par ligne de commande ─────
      const needs = await computeChargeNeeds(inputs)
      const charges: ChargePoste[] = []
      for (const n of needs) {
        if (n.wst !== poste) continue
        const heures = chargeHoursWithEfficiency(n.resteHours, w)
        if (heures <= 0) continue
        const jour = chargeDay(n.wst, n.date, calendar, wstByCode, monthStart, horizonEnd)
        const index = indexParIso.get(isoDay(jour))
        if (index === undefined) continue // hors de l'horizon du lissage : pas notre sujet
        charges.push({
          numCommande: n.source?.numCommande ?? null,
          ligne: n.source?.ligne ?? null,
          article: n.source?.pfArticle ?? n.article,
          clientCode: n.source?.client ?? null,
          prevision: n.nature === 'prevision',
          heures,
          index,
        })
      }
      const brutes = agregeParLigneDeCommande(charges)

      // ── 3. Borne matière, à la journée ───────────────────────────────────
      const matiere = await borneParLigne({
        inputs,
        brutes,
        debut,
        fin,
        nbJours: jours.length,
        force,
      })

      // ── 4. Fenêtres et appel du moteur ───────────────────────────────────
      const lignes: LigneLissage[] = []
      const limitees: AvanceLimiteeMatiere[] = []
      const mobiliteParCle = new Map<string, ReturnType<typeof mobiliteDeLigne>>()
      for (const [cle, b] of brutes) {
        mobiliteParCle.set(cle, mobiliteDeLigne(b.clientCode))
        const { ligne: base, plancher, epinglee } = fenetreCommerciale(b, jours, joursOuvres)
        if (epinglee) {
          lignes.push(base)
          continue
        }

        // La matière ne fait que REMONTER le plancher commercial : produire plus
        // tôt suppose les composants présents, retarder ne suppose rien.
        const borne = borneMatiereAvance(
          b.index,
          plancher,
          matiere.besoinsParLigne.get(cle) ?? [],
          matiere.margeParArticle
        )
        const auPlusTotIso = jours[borne.index]!.dateIso
        lignes.push({ ...base, auPlusTotIso })

        if (borne.index > plancher) {
          limitees.push({
            numCommande: base.numCommande,
            ligne: base.ligne,
            article: b.article,
            designation: matiere.designation(b.article),
            client: null, // résolu plus bas, une seule requête BPARTNER
            clientCode: b.clientCode,
            heures: r1(b.heures),
            dateActuelleIso: base.dateIso,
            dateActuelle: dateFr(base.dateIso),
            auPlusTotSansMatiereIso: base.auPlusTotIso,
            auPlusTotSansMatiere: dateFr(base.auPlusTotIso),
            auPlusTotIso,
            auPlusTot: dateFr(auPlusTotIso),
            joursOuvresPerdus: joursOuvresEntre(jours, plancher, borne.index),
            composants: borne.bloquants.map((c) => ({
              article: c.article,
              designation: matiere.designation(c.article),
              quantite: r2(c.quantite),
              disponibleLeIso: jours[c.index]!.dateIso,
              disponibleLe: dateFr(jours[c.index]!.dateIso),
              inconnu: c.inconnu,
            })),
            resteeSurPlace: true, // corrigé après l'appel du moteur
          })
        }
      }

      const plan = lisserCharge(lignes, jours)

      // ── 5. Contrôle groupé : le plan RETENU tient-il matière ? ───────────
      const mouvements: MouvementMatiere[] = []
      for (const d of plan.deplacements) {
        const cle = cleLigne(d.numCommande, d.ligne || null)
        const besoins = matiere.besoinsParLigne.get(cle)
        if (!besoins?.length) continue
        const deIndex = indexParIso.get(d.deIso)
        const versIndex = indexParIso.get(d.versIso)
        if (deIndex === undefined || versIndex === undefined) continue
        mouvements.push({ deIndex, versIndex, besoins })
      }
      const alertes = alertesApresLissage(matiere.margeParArticle, mouvements)

      // ── 6. Mise au clair ─────────────────────────────────────────────────
      const deplacees = new Set(
        plan.deplacements.map((d) => cleLigne(d.numCommande, d.ligne || null))
      )
      for (const l of limitees) l.resteeSurPlace = !deplacees.has(cleLigne(l.numCommande, l.ligne))

      // Noms clients : UNE requête BPARTNER, sur les seuls codes concernés par
      // un déplacement ou une borne matière — pas sur tout le poste.
      const codes = [
        ...new Set(
          [
            ...plan.deplacements.map((d) => brutes.get(cleLigne(d.numCommande, d.ligne || null))),
            ...limitees.map((l) => brutes.get(cleLigne(l.numCommande, l.ligne))),
          ]
            .map((b) => b?.clientCode)
            .filter((c): c is string => !!c)
        ),
      ]
      const noms = codes.length
        ? await new X3OrderLineRepository()
            .resolveClientNames(codes)
            .catch(() => new Map<string, string>())
        : new Map<string, string>()
      const nomClient = (code: string | null): string | null =>
        code ? (noms.get(code) ?? code) : null
      for (const l of limitees) l.client = nomClient(l.clientCode)

      const deplacements: DeplacementLisible[] = plan.deplacements.map((d) => {
        const cle = cleLigne(d.numCommande, d.ligne || null)
        const b = brutes.get(cle)
        const mob = mobiliteParCle.get(cle) ?? mobiliteDeLigne(b?.clientCode ?? null)
        return {
          numCommande: d.numCommande,
          ligne: d.ligne,
          article: b?.article ?? '',
          designation: b ? matiere.designation(b.article) : null,
          client: nomClient(b?.clientCode ?? null),
          clientCode: b?.clientCode ?? null,
          mobilite: mob.mobilite,
          motifMobilite: mob.motif,
          heures: d.heures,
          dateActuelleIso: d.deIso,
          dateActuelle: dateFr(d.deIso),
          dateProposeeIso: d.versIso,
          dateProposee: dateFr(d.versIso),
          sens: d.sens,
          joursOuvres: d.joursOuvres,
        }
      })

      limitees.sort(
        (a, b) => b.heures - a.heures || a.dateActuelleIso.localeCompare(b.dateActuelleIso)
      )

      return {
        poste: { code: poste, label: inputs.wstLabels.get(poste) ?? poste },
        horizon: {
          debutIso: isoDay(debut),
          finIso: isoDay(fin),
          semaines,
          joursOuvres: joursOuvres.length,
        },
        plan,
        deplacements,
        borneMatiere: {
          maille: 'jour',
          lignesLimitees: limitees.length,
          lignes: limitees,
          alertes: alertes.map((a) => ({
            article: a.article,
            designation: matiere.designation(a.article),
            dateIso: jours[a.index]?.dateIso ?? isoDay(debut),
            date: dateFr(jours[a.index]?.dateIso ?? isoDay(debut)),
            manque: a.manque,
          })),
          avertissements: AVERTISSEMENTS_BORNE,
        },
        x3Error: inputs.x3Error,
      }
    }),
  })
}

/**
 * Limites connues de la borne matière, écrites une fois et rendues telles
 * quelles à l'écran. Une borne grossière annoncée vaut mieux qu'une borne fausse
 * qu'on découvre à l'atelier.
 */
const AVERTISSEMENTS_BORNE = [
  'La borne ne porte que sur les composants ACHETÉS : un sous-ensemble fabriqué se produit, il ne s’attend pas.',
  'Aucun décalage de délai fournisseur : une arrivée est datée à sa date de réception attendue, un besoin à la date client.',
  'Le besoin d’une ligne vient de l’explosion brute (nette du seul stock fantôme) : la borne refuse parfois une avance qui passerait.',
  'Chaque ligne est bornée seule : le contrôle groupé, après lissage, dit si le plan retenu réserve deux fois la même marge.',
]

/** Jours OUVRÉS entre deux index de l'horizon (bornes ordonnées). */
function joursOuvresEntre(jours: JourCapacite[], de: number, vers: number): number {
  let n = 0
  for (let i = Math.min(de, vers); i < Math.max(de, vers); i++) {
    if ((jours[i]?.capaciteH ?? 0) > 0) n++
  }
  return n
}

/** Sortie de la passe matière : marges par composant + besoins par ligne. */
interface MatiereLissage {
  margeParArticle: Map<string, number[]>
  besoinsParLigne: Map<string, BesoinComposant[]>
  designation: (article: string) => string | null
}

/**
 * Projection matières à la MAILLE JOUR sur l'horizon du lissage.
 *
 * `material_projection` indexe ses buckets librement : on lui en passe un par
 * jour, là où /approvisionnement lui en passe un par semaine ou par mois. Rien
 * n'est réécrit — même moteur, même nomenclature complète, mêmes règles de
 * fantômes et d'arrêt sur acheté.
 *
 * La demande retenue est TOUTE la demande de l'usine qui tombe dans la fenêtre,
 * pas seulement celle du poste lissé : un composant se partage entre lignes de
 * production, et ne regarder que le poste rendrait une marge imaginaire. Ce qui
 * tombe AVANT la fenêtre est replié sur le premier jour (même convention que les
 * réceptions en retard du plan appro) : cette demande n'est pas soldée, sa
 * matière est réellement engagée.
 */
async function borneParLigne(p: {
  inputs: Awaited<ReturnType<typeof fetchChargeInputs>>
  brutes: Map<string, LigneBrute>
  debut: Date
  fin: Date
  nbJours: number
  force: boolean
}): Promise<MatiereLissage> {
  const { inputs, brutes, debut, fin, nbJours, force } = p
  const vide: MatiereLissage = {
    margeParArticle: new Map(),
    besoinsParLigne: new Map(),
    designation: () => null,
  }

  const [entries, articles] = await Promise.all([
    staticSync.readNomenclatures().catch(() => []),
    staticSync.readArticles().catch(() => []),
  ])
  // Sans référentiel article, l'arrêt sur acheté disparaît et la notion même de
  // composant acheté n'existe plus : on rend une borne vide plutôt qu'une borne
  // calculée sur une population fausse.
  if (!entries.length || !articles.length) return vide

  const catByArticle = new Map(articles.map((a) => [a.code, a.category ?? '']))
  const supplyByArticle = new Map(articles.map((a) => [a.code, a.supplyType ?? '']))
  const descByArticle = new Map(articles.map((a) => [a.code, a.description || null]))
  const designation = (article: string): string | null => descByArticle.get(article) ?? null
  const isPhantom = (a: string): boolean => (catByArticle.get(a) ?? '').toUpperCase() === 'AFANT'
  const isPurchased = (a: string): boolean => supplyByArticle.get(a) === 'ACHAT'

  // Demande bornée à la fenêtre — le retard replié sur le premier jour. Au-delà
  // de `fin`, une demande ne dispute rien à une avance qui, par construction, ne
  // dépasse jamais la date actuelle de la ligne.
  const finTs = atMidnight(fin).getTime()
  const debutTs = atMidnight(debut).getTime()
  const jourIndex = (d: Date): number | null => {
    const t = atMidnight(d).getTime()
    if (t > finTs) return null
    if (t < debutTs) return 0
    return Math.round((t - debutTs) / 86_400_000)
  }

  const toutesLignes = chargeOrderLines(inputs)
  const dansFenetre = toutesLignes.filter((l) => jourIndex(l.date) !== null)
  if (!dansFenetre.length) return { ...vide, designation }

  // Périmètre de lecture du stock : tout ce que la découverte VISITE, fantômes
  // traversés compris (leur stock couvre avant descente du reliquat).
  const fantomesTraverses = new Set<string>()
  const decouverte = explodeMaterialNeeds(dansFenetre, entries, {
    isPhantom: (a) => {
      const ph = isPhantom(a)
      if (ph) fantomesTraverses.add(a)
      return ph
    },
    isPurchased,
  })
  const atteints = new Set([...decouverte.map((r) => r.article), ...fantomesTraverses])

  const [flux, receptions] = await Promise.all([
    boardDataset.getStock([...atteints], force).catch(() => [] as Flow[]),
    boardDataset.getReceptions(force).catch(() => [] as Flow[]),
  ])
  const { stock } = sumAvailableStock(flux)

  // Arrivées par jour. Une réception ANTÉRIEURE à la fenêtre est repliée sur le
  // premier jour : c'est de la matière réellement attendue, l'ignorer
  // surestimerait le manque. Même convention que le plan appro.
  const arriveesParArticle = new Map<string, number[]>()
  for (const f of receptions) {
    if (f.quantity <= 0 || !f.article || !atteints.has(f.article)) continue
    const idx = f.date === null ? 0 : jourIndex(f.date)
    if (idx === null) continue
    let arr = arriveesParArticle.get(f.article)
    if (!arr) {
      arr = new Array<number>(nbJours).fill(0)
      arriveesParArticle.set(f.article, arr)
    }
    arr[idx] = (arr[idx] ?? 0) + f.quantity
  }

  const encours = buildEncoursByArticle(inputs)
  const demands: ProjectionDemand[] = []
  for (const l of dansFenetre) {
    const bucket = jourIndex(l.date)
    if (bucket === null) continue
    demands.push({ article: l.article, bucket, qty: l.quantite, nature: l.nature })
  }

  const projection = projectMaterialPlan(demands, collectBom(entries, { includePurchased: true }), {
    buckets: nbJours,
    supply: (article): ArticleSupply => ({
      stock: stock.get(article) ?? 0,
      encours: encours.get(article) ?? 0,
      arrivees: arriveesParArticle.get(article),
    }),
    isPhantom,
    isPurchased,
  })

  const margeParArticle = new Map<string, number[]>()
  for (const proj of projection.byArticle.values()) {
    if (!isPurchased(proj.article)) continue
    margeParArticle.set(
      proj.article,
      margeCumulee({
        stockInitial: proj.stockInitial,
        encours: proj.encours,
        arrivees: proj.arrivees,
        besoin: proj.besoinFerme.map((v, t) => v + (proj.besoinPrevi[t] ?? 0)),
      })
    )
  }

  // Besoin PROPRE de chaque ligne déplaçable : la seule explosion qui porte la
  // provenance jusqu'en bas de nomenclature (`ChargeSource`), donc la seule qui
  // sache dire « ce composant est appelé par CETTE ligne ».
  // Seules les lignes RÉELLEMENT déplaçables sont explosées : une prévision est
  // clouée sur sa date, lui calculer une borne matière serait du travail payé
  // pour une décision qui n'existe pas.
  const cles = new Set(
    [...brutes].filter(([, b]) => !b.prevision && b.numCommande).map(([cle]) => cle)
  )
  const lignesDeplacables = dansFenetre.filter((l) =>
    cles.has(cleLigne(l.source?.numCommande ?? null, l.source?.ligne ?? null))
  )
  const besoinsParLigne = new Map<string, BesoinComposant[]>()
  if (lignesDeplacables.length) {
    const parLigne = new Map<string, Map<string, number>>()
    for (const raw of explodeMaterialNeeds(lignesDeplacables, entries, {
      isPhantom,
      isPurchased,
      phantomStock: stock,
    })) {
      if (!isPurchased(raw.article)) continue
      if (raw.qty <= 0) continue
      const cle = cleLigne(raw.source?.numCommande ?? null, raw.source?.ligne ?? null)
      if (!cles.has(cle)) continue
      let parArticle = parLigne.get(cle)
      if (!parArticle) parLigne.set(cle, (parArticle = new Map()))
      parArticle.set(raw.article, (parArticle.get(raw.article) ?? 0) + raw.qty)
    }
    for (const [cle, parArticle] of parLigne) {
      besoinsParLigne.set(
        cle,
        [...parArticle.entries()].map(([article, quantite]) => ({ article, quantite }))
      )
    }
  }

  return { margeParArticle, besoinsParLigne, designation }
}
