/**
 * Poste de charge X3 (WORKSTATIO) + son schéma horaire (TABWEEDIA), aplati
 * pour le calcul de capacité. Source : sync statique SQLite (cf. StaticSyncService).
 *
 * MCD : https://online-help.sagex3.com/erp/12/fr-fr/Content/MCD/WORKSTATIO.htm
 */
export interface Workstation {
  /** WST_0 — code poste (ex. `PP_830`), aligné sur `gamme.workstation`. */
  code: string
  /** WSTDES_0 — libellé. */
  description: string
  /** WSTTYP_0 — 1 = machine, 2 = main d'œuvre, 3 = sous-traitance. */
  type: number
  /** WSTNBR_0 — nombre d'exemplaires (shifts / ressources parallèles). */
  parallelUnits: number
  /** EFF_0 — efficience %. */
  efficiency: number
  /** USE_0 — utilisation %. */
  utilization: number
  /** SHR_0 — perte %. */
  scrap: number
  /** TWD_0 — code schéma horaire. */
  scheduleCode: string
  /** TABWEEDIA.DAYCAP_0..6 — capacité (h) par jour, index 0 = Lundi … 6 = Dimanche. */
  dailyCapacity: number[]
  /** STOLOC_0 — emplacement de stock / atelier (issue #36). */
  stockLocation: string
  /** WCR_0 — centre de charge (PP, PC, PB…). */
  workCenter: string
  /** WCRFCY_0 — site de fabrication (ex. `AE1`). */
  facility: string
}
