import vine from '@vinejs/vine'

/**
 * Validation du PATCH /api/v1/planning/ofs/:of (override d'OF — planning board).
 *
 * Raison d'être (H4) : sans validation, un `status` hors domaine (ex. `9`) ou
 * une date mal formée pouvait être persisté dans `of_overrides` puis corrompre
 * `precomputeMfgFeasibility` + le matcher OF↔commande. Le schéma ci-dessous
 * restreint chaque champ à son domaine métier :
 *   - `status`    ∈ {1, 2, 3}           (ferme / planifié / suggéré — cf. ORDERS.WIPSTA)
 *   - `dateDebut` / `dateFin` ISO YYYY-MM-DD (aligné sur `order_planning_controller.ISO_RE`)
 *   - `workstation` texte non-vide (code poste de charge — ex. `PP_830`)
 *   - `note`       texte libre plafonné (anti-abus, pas de blob en SQLite)
 *
 * Le paramètre de path `of` (numéro d'OF) est validé par `OF_RE` dans le
 * contrôleur (cf. `planning_board_controller.update`) plutôt que via Vine :
 * les path params vivent hors body et l'approche est alignée sur le pattern
 * `ISO_RE.test(...)` du contrôleur de lignes de commande.
 */
export const planningBoardUpdateValidator = vine.compile(
  vine.object({
    status: vine.enum([1, 2, 3] as const).optional(),
    dateDebut: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateFin: vine
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    workstation: vine.string().trim().minLength(1).maxLength(50).optional(),
    note: vine.string().trim().maxLength(2000).optional(),
  })
)
