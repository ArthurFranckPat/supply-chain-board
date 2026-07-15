/** SQL parsing utilities — pure functions, no I/O.
 *
 * Ported from x3_sql.py: split_union, extract_columns, strip_trailing_order,
 * _convert_top_to_rownum.
 */

/** Split SQL on UNION ALL / UNION at top level (not inside parentheses). */
export function splitUnion(sql: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let i = 0
  const upper = sql.toUpperCase()

  while (i < sql.length) {
    if (sql[i] === '(') {
      depth++
      current += sql[i]
      i++
    } else if (sql[i] === ')') {
      depth--
      current += sql[i]
      i++
    } else if (depth === 0) {
      let ws = 0
      while (i + ws < sql.length && ' \t\n\r'.includes(sql[i + ws])) ws++
      const restUpper = upper.slice(i + ws)

      if (
        restUpper.startsWith('UNION ALL') &&
        (restUpper.length <= 9 || !isAlphaNum(restUpper[9]))
      ) {
        parts.push(current.trim())
        current = ''
        i += ws + 9
        while (i < sql.length && ' \t\n\r'.includes(sql[i])) i++
      } else if (
        restUpper.startsWith('UNION') &&
        !restUpper.startsWith('UNION ALL') &&
        (restUpper.length <= 5 || !isAlphaNum(restUpper[5]))
      ) {
        parts.push(current.trim())
        current = ''
        i += ws + 5
        while (i < sql.length && ' \t\n\r'.includes(sql[i])) i++
      } else {
        current += sql[i]
        i++
      }
    } else {
      current += sql[i]
      i++
    }
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

/** Extract column names/aliases from a SELECT clause. */
export function extractColumns(sql: string): string[] {
  const m = sql.match(/\s*SELECT\s+(?:TOP\s+\d+\s+)?(.*?)\s+FROM\s+/is)
  if (!m) return []

  const selectPart = m[1]
  const columns: string[] = []
  let depth = 0
  let current = ''

  for (const ch of selectPart) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      columns.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }

  if (current.trim()) columns.push(current.trim())

  return columns.map((col) => {
    const aliasMatch = col.match(/\bAS\s+(\w+)\s*$/i)
    if (aliasMatch) return aliasMatch[1]
    const parts = col.trim().split('.')
    return parts[parts.length - 1].trim()
  })
}

/** Remove trailing ORDER BY from a single SELECT. */
export function stripTrailingOrder(sql: string): [string, string] {
  let depth = 0

  for (let i = sql.length - 1; i >= 0; i--) {
    if (sql[i] === ')') depth++
    else if (sql[i] === '(') depth--
    else if (depth === 0) {
      const before = sql.slice(0, i + 1)
      const match = before.match(/\s+ORDER\s+BY\s+$/i)
      if (match) {
        return [sql.slice(0, match.index!), sql.slice(match.index!)]
      }
    }
  }

  return [sql, '']
}

/** Convert SQL Server TOP N syntax to Oracle ROWNUM. */
export function topToRownum(sql: string): string {
  const topM = sql.match(/\bTOP\s+(\d+)\s+/i)
  if (!topM) return sql

  const n = topM[1]
  const base = sql.replace(/\bTOP\s+\d+\s+/i, '')

  let insertPos = base.length
  for (const kw of [/\bORDER\s+BY\b/i, /\bGROUP\s+BY\b/i, /\bHAVING\b/i]) {
    const km = base.match(kw)
    if (km && km.index! < insertPos) insertPos = km.index!
  }

  const before = base.slice(0, insertPos)
  const after = base.slice(insertPos)

  if (/\bWHERE\b/i.test(before)) {
    return before + ` AND ROWNUM <= ${n}` + after
  } else {
    const fromM = before.match(/\bFROM\s+\S+/i)
    if (fromM) {
      const afterFrom = before.slice(fromM.index! + fromM[0].length)
      return (
        before.slice(0, fromM.index! + fromM[0].length) +
        ` WHERE ROWNUM <= ${n}` +
        afterFrom +
        after
      )
    }
    return before + ` WHERE ROWNUM <= ${n}` + after
  }
}

function isAlphaNum(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch)
}
