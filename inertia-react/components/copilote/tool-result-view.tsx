/**
 * Rendu lisible d'un résultat de tool dans l'inspecteur.
 *
 * Les payloads des tools agent suivent tous la même convention (cf. `_source`
 * dans app/services/agent/primitives*.ts) : quelques champs de provenance, un
 * bloc de filtres, des agrégats scalaires, et UNE liste qui porte la donnée.
 * On s'appuie sur cette convention plutôt que sur un rendu par tool — 18 tools,
 * et un tool ajouté ne doit pas arriver muet dans le panneau.
 *
 * Ordre délibérément inverse du JSON : la donnée d'abord, la provenance en
 * pied. Un dump brut mettait `_source` / `engine` / `note` en tête et coupait
 * la liste avant qu'elle n'apparaisse.
 *
 * Les clés ne sont PAS traduites : le prompt système impose au copilote de
 * reprendre la terminologie des tools, donc le panneau doit montrer les mêmes
 * mots que ceux qu'il cite.
 */

import { useMemo } from 'react'

import { cx } from '@r/lib/cx'

/** Provenance et cadrage — utiles, mais jamais avant la donnée. */
const META_KEYS = new Set(['_source', 'engine', 'note', 'filtres'])
/** Champs de volumétrie promus en chips d'en-tête. */
const COUNT_KEYS = new Set(['totalMatching', 'truncated'])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type Scalar = string | number | boolean | null

function isScalar(v: unknown): v is Scalar {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** ISO → jj/mm/aaaa. Règle projet : aucune date ISO affichée à l'écran. */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  if (typeof v === 'string') {
    if (ISO_DATE_RE.test(v)) {
      const [y, m, d] = v.split('-')
      return `${d}/${m}/${y}`
    }
    return v
  }
  if (Array.isArray(v)) return `${v.length} élément${v.length > 1 ? 's' : ''}`
  return JSON.stringify(v)
}

/**
 * La liste porteuse de donnée = le plus long tableau d'objets du payload.
 * Les tools n'utilisent pas tous le même nom (`lignes`, `ofs`, `stocks`,
 * `items`, `articles`…) et figer une liste de noms condamnerait le prochain.
 */
function pickRows(payload: Record<string, unknown>): { key: string; rows: Record<string, unknown>[] } | null {
  let best: { key: string; rows: Record<string, unknown>[] } | null = null
  for (const [key, value] of Object.entries(payload)) {
    if (!Array.isArray(value) || value.length === 0) continue
    if (!value.every(isRecord)) continue
    if (!best || value.length > best.rows.length) {
      best = { key, rows: value as Record<string, unknown>[] }
    }
  }
  return best
}

/** Nb de lignes rendues en clair avant de renvoyer au JSON brut. */
const MAX_ROWS = 12
/** Nb de champs détaillés par ligne (au-delà : bruit dans 300 px). */
const MAX_ROW_FIELDS = 6

function KeyValue(props: { label: string; value: unknown; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="shrink-0 text-[10.5px] text-muted-foreground">{props.label}</span>
      <span
        className={cx(
          'min-w-0 break-words text-right text-[11.5px] text-foreground',
          props.mono && 'font-mono'
        )}
      >
        {fmtValue(props.value)}
      </span>
    </div>
  )
}

function RowCard(props: { row: Record<string, unknown> }) {
  const entries = Object.entries(props.row)
  const scalars = entries.filter(([, v]) => isScalar(v))
  const [titleEntry, ...rest] = scalars
  // Les sous-objets (criticité, ofs…) ne sont pas dépliés ici : on signale leur
  // présence et leur volume, le JSON brut reste la sortie de secours.
  const nested = entries.filter(([, v]) => !isScalar(v) && v !== null && v !== undefined)

  return (
    <div className="rounded-lg border border-border/50 bg-background/60 px-2.5 py-2">
      {titleEntry && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[12px] font-semibold text-foreground">
            {fmtValue(titleEntry[1])}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{titleEntry[0]}</span>
        </div>
      )}
      {rest.slice(0, MAX_ROW_FIELDS).map(([k, v]) => (
        <KeyValue key={k} label={k} value={v} />
      ))}
      {nested.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {nested.map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-secondary px-1.5 py-px text-[10px] text-muted-foreground"
            >
              {k}
              {Array.isArray(v) ? ` · ${v.length}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ToolResultView(props: { payload: unknown; fallbackInput?: unknown }) {
  const data = props.payload ?? props.fallbackInput

  const view = useMemo(() => {
    if (!isRecord(data)) return null
    const rows = pickRows(data)
    const scalars = Object.entries(data).filter(
      ([k, v]) => isScalar(v) && !META_KEYS.has(k) && !COUNT_KEYS.has(k) && v !== null
    )
    const objects = Object.entries(data).filter(
      ([k, v]) => isRecord(v) && !META_KEYS.has(k) && k !== rows?.key
    )
    return { rows, scalars, objects }
  }, [data])

  if (data === undefined || data === null) {
    return <p className="text-[11.5px] text-muted-foreground">Aucun résultat.</p>
  }

  // Payload non conventionnel (chaîne, tableau nu) : JSON direct, sans habillage.
  if (!isRecord(data) || !view) {
    return <RawJson value={data} open />
  }

  const error = typeof data.error === 'string' ? data.error : null
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11.5px] text-destructive">
        {error}
      </div>
    )
  }

  const { rows, scalars, objects } = view
  const total = typeof data.totalMatching === 'number' ? data.totalMatching : rows?.rows.length
  const hidden = rows ? rows.rows.length - Math.min(rows.rows.length, MAX_ROWS) : 0

  return (
    <div className="flex flex-col gap-2.5">
      {rows && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold text-foreground">{rows.key}</span>
            <span className="text-[10.5px] text-muted-foreground">
              {total}
              {data.truncated === true && ' (tronqué)'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.rows.slice(0, MAX_ROWS).map((row, i) => (
              <RowCard key={i} row={row} />
            ))}
          </div>
          {hidden > 0 && (
            <p className="text-[10.5px] text-muted-foreground">
              +{hidden} autre{hidden > 1 ? 's' : ''} — voir le JSON brut
            </p>
          )}
        </>
      )}

      {scalars.length > 0 && (
        <div className="rounded-lg border border-border/50 px-2.5 py-1.5">
          {scalars.map(([k, v]) => (
            <KeyValue key={k} label={k} value={v} />
          ))}
        </div>
      )}

      {objects.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border/50 px-2.5 py-1.5">
          <div className="mb-0.5 text-[10.5px] font-semibold text-muted-foreground">{k}</div>
          {Object.entries(v as Record<string, unknown>).map(([ik, iv]) => (
            <KeyValue key={ik} label={ik} value={iv} />
          ))}
        </div>
      ))}

      {/* Provenance en pied : elle qualifie la donnée, elle ne la précède pas. */}
      {(typeof data.engine === 'string' || typeof data.note === 'string') && (
        <div className="border-t border-border/50 pt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
          {typeof data.engine === 'string' && <div className="font-mono">{data.engine}</div>}
          {typeof data.note === 'string' && <div className="italic">{data.note}</div>}
        </div>
      )}

      <RawJson value={data} />
    </div>
  )
}

function RawJson(props: { value: unknown; open?: boolean }) {
  return (
    <details open={props.open} className="group">
      <summary className="cursor-pointer list-none text-[10.5px] text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        JSON brut
      </summary>
      <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-secondary p-2 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {JSON.stringify(props.value, null, 2)}
      </pre>
    </details>
  )
}
