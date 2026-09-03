/**
 * Moteur de diff d'affichage (issue #186) — « qu'est-ce qui a bougé depuis le
 * rechargement ? ». Fonctions PURES, sans React ni DOM : deux photos du même
 * jeu de lignes (l'ancien payload affiché, le nouveau qui arrive) donnent les
 * cellules modifiées, les lignes entrées et les lignes sorties.
 *
 * Pourquoi côté client : le serveur ne connaît pas l'état affiché. Deux
 * rechargements successifs peuvent renvoyer le même contenu dans un ordre
 * différent (tri X3, cache), et l'utilisateur, lui, ne veut voir clignoter que
 * ce qui a RÉELLEMENT changé. D'où l'identité par clé métier (jamais l'index de
 * ligne) : un changement de tri ne produit aucun faux positif.
 *
 * Aucune dépendance au DOM ici — c'est ce qui rend le moteur testable comme
 * une fonction de domaine (tests/unit/diff_flash.test.ts). La recopie des
 * durées sur `:root` vit donc dans <DataStatus />, côté navigateur.
 *
 * Configuration déclarative par page : un extracteur de clé + une table
 * `colonne → valeur comparée`. Les identifiants de colonne sont ceux du
 * DataTable (`col.id ?? col.accessorKey`), pour que le flash se pose sur la
 * BONNE cellule sans table de correspondance intermédiaire.
 */

/** Durée du flash « a changé » (ambre) — cellule modifiée. */
export const FLASH_MS = 2000

/**
 * Sursis d'affichage d'une ligne sortie : elle flashe en rouge AVANT d'être
 * retirée du DOM. Retard d'affichage assumé — sans lui, la disparition est
 * indistinguable d'un changement de filtre.
 */
export const EXIT_MS = 1000

/**
 * Contrat de diff d'une page tableau.
 *
 * `fields` est indexé par identifiant de colonne DataTable ; une colonne
 * absente de la table n'est jamais comparée (donc jamais flashée). Chaque
 * extracteur doit rendre une valeur COMPARABLE et stable : scalaire de
 * préférence, sinon une petite structure sérialisable (cf. `sameValue`).
 */
export interface DiffConfig<TRow> {
  key: (row: TRow) => string
  fields: Record<string, (row: TRow) => unknown>
}

/** Ce qui a bougé, exprimé en clés de ligne et identifiants de colonne. */
export interface DiffResult<TRow> {
  /** clé de ligne → colonnes dont la valeur a changé. */
  changed: Map<string, Set<string>>
  /** Clés présentes dans le nouveau payload seulement. */
  entered: Set<string>
  /** Clés présentes dans l'ancien payload seulement. */
  exited: Set<string>
  /** Lignes (ANCIENNES) correspondant à `exited` — à réafficher le temps du flash. */
  exitedRows: TRow[]
}

/** Récapitulatif chiffré d'un diff — alimente le compteur de la barre data-status. */
export interface DiffCounts {
  changed: number
  entered: number
  exited: number
}

/**
 * Égalité de deux valeurs comparées. `Object.is` pour les scalaires (couvre
 * NaN et distingue null/undefined) ; sérialisation JSON pour le reste, ce qui
 * suppose des extracteurs rendant de PETITES structures à ordre de clés stable
 * — un objet volumineux comparé ici coûterait à chaque rechargement.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/**
 * Regroupe les lignes par clé. Deux lignes métier peuvent partager une clé
 * (cas X3 : même commande/article/date sur deux lignes indistinguables) — elles
 * sont alors comparées EN GROUPE, et flashent ensemble. Imprécision assumée :
 * l'alternative (suffixer par le rang d'apparition) ferait dépendre l'identité
 * de l'ordre du payload, donc produirait des faux positifs au moindre
 * changement de tri côté serveur.
 */
function groupByKey<TRow>(rows: readonly TRow[], key: (row: TRow) => string): Map<string, TRow[]> {
  const out = new Map<string, TRow[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = out.get(k)
    if (bucket) bucket.push(row)
    else out.set(k, [row])
  }
  return out
}

/** Valeur comparée d'un groupe pour une colonne (concaténation ordonnée du groupe). */
function groupValue<TRow>(group: TRow[], extract: (row: TRow) => unknown): unknown {
  return group.length === 1 ? extract(group[0]) : group.map(extract)
}

/**
 * Diff entre deux photos du même registre. Aucune allocation superflue quand
 * rien ne bouge : le résultat vide est reconnaissable via `isEmptyDiff`.
 */
export function diffRows<TRow>(
  prev: readonly TRow[],
  next: readonly TRow[],
  config: DiffConfig<TRow>
): DiffResult<TRow> {
  const prevGroups = groupByKey(prev, config.key)
  const nextGroups = groupByKey(next, config.key)
  const columns = Object.entries(config.fields)

  const changed = new Map<string, Set<string>>()
  const entered = new Set<string>()
  const exited = new Set<string>()
  const exitedRows: TRow[] = []

  for (const [k, nextGroup] of nextGroups) {
    const prevGroup = prevGroups.get(k)
    if (!prevGroup) {
      entered.add(k)
      continue
    }
    let cols: Set<string> | null = null
    for (const [columnId, extract] of columns) {
      if (sameValue(groupValue(prevGroup, extract), groupValue(nextGroup, extract))) continue
      if (cols === null) cols = new Set<string>()
      cols.add(columnId)
    }
    if (cols !== null) changed.set(k, cols)
  }

  for (const [k, prevGroup] of prevGroups) {
    if (nextGroups.has(k)) continue
    exited.add(k)
    exitedRows.push(...prevGroup)
  }

  return { changed, entered, exited, exitedRows }
}

/** Vrai si rien n'a bougé — évite d'armer des timers et d'afficher un compteur à zéro. */
export function isEmptyDiff<TRow>(d: DiffResult<TRow>): boolean {
  return d.changed.size === 0 && d.entered.size === 0 && d.exited.size === 0
}

/** Compte les lignes touchées (pas les cellules) — unité lisible dans la barre. */
export function countDiff<TRow>(d: DiffResult<TRow>): DiffCounts {
  return { changed: d.changed.size, entered: d.entered.size, exited: d.exited.size }
}

/**
 * Vue consommée par le DataTable — sous-ensemble de `DiffResult` sans les
 * lignes fantômes (celles-ci transitent par la liste de lignes, pas par le
 * flash) : le tableau n'a besoin que de savoir QUOI teinter.
 */
export interface RowFlash {
  changed: Map<string, Set<string>>
  entered: Set<string>
  exited: Set<string>
}
