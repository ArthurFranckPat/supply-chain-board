/**
 * `useDiffFlash` (issue #186) — anime le diff entre le payload AFFICHÉ et le
 * payload qui arrive après un rechargement explicite.
 *
 * Le hook est agnostique de la provenance des données : il suffit que `rows`
 * change d'identité quand de nouvelles lignes arrivent. Les deux chemins visés
 * sont donc couverts par le même code — le nonce de `useTimedFetch` (fetchs
 * JSON) comme les props d'un `router.reload()` (données en props Inertia), le
 * bouton « recharger » de la barre data-status déclenchant les deux.
 *
 * Déclencheur : le `nonce` du store. Une revalidation silencieuse (SWR, montage,
 * changement de filtre) ne le fait pas bouger — elle repose donc simplement la
 * photo de référence, sans rien animer. C'est la règle : on n'anime QUE ce que
 * l'utilisateur a lui-même demandé.
 *
 * Réglable : la préférence d'affichage `diffFlash` (/configuration/affichage)
 * éteint l'animation ET le récap. Éteinte, la photo de référence continue
 * d'être tenue à jour — rallumer le réglage anime donc le rechargement
 * SUIVANT, jamais un diff accumulé pendant que c'était coupé.
 *
 * Sorties :
 *   • `flash`  — quoi teinter, à passer tel quel au DataTable ;
 *   • `ghosts` — les lignes SORTIES, à réinjecter dans la liste affichée le
 *     temps de leur flash rouge (elles traversent les mêmes filtres et le même
 *     tri que les autres, donc apparaissent à leur place).
 */
import { useEffect, useRef, useState } from 'react'

import {
  EXIT_MS,
  FLASH_MS,
  countDiff,
  diffRows,
  isEmptyDiff,
  type DiffConfig,
  type RowFlash,
} from '@r/lib/diff-flash'
import { useDataStatusStore } from '@r/lib/data-status-store'
import { useDisplayPrefsStore } from '@r/lib/display-prefs-store'

interface DiffFlashState<TRow> {
  flash: RowFlash | null
  ghosts: TRow[]
}

const IDLE: DiffFlashState<never> = { flash: null, ghosts: [] }

/**
 * @param source identifiant de la source dans le récap de la barre (une page
 *   qui charge deux fragments en publie deux : « suivi:proactif », etc.).
 * @param rows lignes actuellement affichées, ou `null` tant qu'aucune n'est
 *   arrivée (premier chargement : photo de référence seulement, pas de flash).
 */
export function useDiffFlash<TRow>(
  source: string,
  rows: readonly TRow[] | null,
  config: DiffConfig<TRow>
): DiffFlashState<TRow> {
  const [state, setState] = useState<DiffFlashState<TRow>>(IDLE as DiffFlashState<TRow>)

  // Photo précédente + dernier nonce diffé : des refs, pas de l'état — les
  // muter ne doit pas provoquer de rendu, et elles doivent survivre au rendu
  // déclenché par setState juste en dessous.
  const prevRowsRef = useRef<readonly TRow[] | null>(null)
  const diffedNonceRef = useRef(0)
  // La config est recréée à chaque rendu par l'appelant : la lire dans une ref
  // évite de la mettre en dépendance de l'effet (qui se déclencherait alors à
  // chaque rendu, avec `prev === rows`, et n'animerait jamais rien).
  const configRef = useRef(config)
  configRef.current = config

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t)
    timersRef.current = []
  }

  // Dépendance sur `rows` SEUL, jamais sur le nonce : celui-ci est incrémenté
  // au clic, donc AVANT l'arrivée des données. Le mettre en dépendance ferait
  // tourner l'effet sur l'ancien payload (`prev === rows`, diff vide) et
  // consommerait le nonce avant que les vraies données n'atterrissent.
  useEffect(() => {
    if (rows === null) return
    const prev = prevRowsRef.current
    prevRowsRef.current = rows
    if (prev === null || prev === rows) return

    const nonce = useDataStatusStore.getState().nonce
    // nonce === 0 : aucun rechargement explicite depuis l'ouverture de l'onglet.
    // nonce déjà diffé : arrivée secondaire (re-render, données identiques
    // republiées) — le flash a déjà eu lieu, ne pas le rejouer.
    if (nonce === 0 || nonce === diffedNonceRef.current) return
    diffedNonceRef.current = nonce

    // Réglage éteint : on sort APRÈS avoir reposé la photo (fait plus haut) et
    // consommé le nonce. Rallumer n'exhume donc pas les changements d'un
    // rechargement passé — le prochain rechargement repart d'une base saine.
    if (!useDisplayPrefsStore.getState().diffFlash) return

    const d = diffRows(prev, rows, configRef.current)
    if (isEmptyDiff(d)) return

    useDataStatusStore.getState().publishDiff(source, nonce, countDiff(d))

    clearTimers()
    setState({
      flash: { changed: d.changed, entered: d.entered, exited: d.exited },
      ghosts: d.exitedRows,
    })
    // Les fantômes partent les premiers (sursis court), le flash ambre s'éteint
    // ensuite : deux échéances distinctes, pas un seul timer au plus long.
    if (d.exitedRows.length > 0) {
      timersRef.current.push(setTimeout(() => setState((s) => ({ ...s, ghosts: [] })), EXIT_MS))
    }
    timersRef.current.push(setTimeout(() => setState({ flash: null, ghosts: [] }), FLASH_MS))
  }, [rows, source])

  useEffect(() => clearTimers, [])

  return state
}
