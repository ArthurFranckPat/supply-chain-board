/**
 * Graphe « Heures vs capacité » du cockpit (#119, lot 4) — maillage MENSUEL :
 * capacité théorique nette TABWEEDIA (barres neutres), heures pointées (ligne
 * brand) et production convertie en heures de gamme (ligne verte).
 *
 * Les heures pointées incluent les pointages de réglage pur — la maille jour en
 * amont les compte, sinon la courbe divergerait de la production sans raison.
 */
import { useMemo } from 'react'
import { BRAND, FERME, FG, fmtCompact, moisLabel } from './chart-common'

export interface HeuresMoisView {
  mois: string
  capacite: number
  heuresPointees: number
  heuresConverties: number
}

const W = 560
const H = 170
const PAD_L = 38
const PAD_R = 12
const PAD_T = 12
const PAD_B = 22

export function HeuresCapaciteChart({ data }: { data: HeuresMoisView[] }) {
  const geom = useMemo(() => {
    const n = data.length || 1
    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B
    const slot = plotW / n
    const barW = Math.min(slot * 0.6, 52)

    const max =
      Math.max(...data.map((d) => Math.max(d.capacite, d.heuresPointees, d.heuresConverties)), 0) *
        1.08 || 1
    const y = (v: number) => PAD_T + plotH - (v / max) * plotH

    const bars = data.map((d, i) => {
      const cx = PAD_L + slot * i + slot / 2
      return {
        mois: d.mois,
        cx,
        x: cx - barW / 2,
        y: y(d.capacite),
        h: PAD_T + plotH - y(d.capacite),
        w: barW,
      }
    })

    const pts = (sel: (d: HeuresMoisView) => number) =>
      data.map((d, i) => ({ x: PAD_L + slot * i + slot / 2, y: y(sel(d)), v: sel(d) }))
    const pointees = pts((d) => d.heuresPointees)
    const converties = pts((d) => d.heuresConverties)
    const pathOf = (l: { x: number; y: number }[]) =>
      l.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

    return {
      bars,
      pointees,
      converties,
      pathPointees: pathOf(pointees),
      pathConverties: pathOf(converties),
      max,
      baseline: PAD_T + plotH,
      slot,
    }
  }, [data])

  if (data.length === 0) return null

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-[170px] w-full"
      role="img"
      aria-label="Capacité (barres), heures pointées et heures converties (lignes) par mois"
    >
      {[0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + (H - PAD_T - PAD_B) * (1 - f)}
            y2={PAD_T + (H - PAD_T - PAD_B) * (1 - f)}
            stroke={FG}
            strokeOpacity="0.08"
          />
          <text
            x={PAD_L - 5}
            y={PAD_T + (H - PAD_T - PAD_B) * (1 - f) + 3}
            textAnchor="end"
            fontSize="9"
            fill={FG}
            fillOpacity="0.5"
          >
            {fmtCompact(geom.max * f)}h
          </text>
        </g>
      ))}

      {/* Capacité théorique — barres neutres, c'est le plafond, pas une activité. */}
      {geom.bars.map((b) => (
        <rect
          key={b.mois}
          x={b.x}
          y={b.y}
          width={b.w}
          height={Math.max(b.h, 0)}
          rx="3"
          fill={FG}
          fillOpacity="0.1"
        />
      ))}

      {/* Production convertie en heures de gamme. */}
      <path
        d={geom.pathConverties}
        fill="none"
        stroke={FERME}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {geom.converties.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={FERME} />
      ))}

      {/* Heures réellement pointées. */}
      <path
        d={geom.pathPointees}
        fill="none"
        stroke={BRAND}
        strokeWidth="2"
        strokeLinecap="round"
      />
      {geom.pointees.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={BRAND} />
      ))}

      <line
        x1={PAD_L}
        x2={W - PAD_R}
        y1={geom.baseline}
        y2={geom.baseline}
        stroke={FG}
        strokeOpacity="0.2"
      />
      {geom.bars.map((b, i) => (
        <text
          key={b.mois}
          x={b.cx}
          y={H - 8}
          textAnchor="middle"
          fontSize="9"
          fill={FG}
          fillOpacity="0.55"
        >
          {moisLabel(b.mois, i)}
        </text>
      ))}

      {/* Zones de survol : les courbes n'ont aucune valeur affichée, le tooltip
          est la seule lecture exacte. En dernier = au-dessus. */}
      {data.map((d, i) => (
        <rect
          key={`hit-${d.mois}`}
          x={PAD_L + geom.slot * i}
          y={PAD_T}
          width={geom.slot}
          height={geom.baseline - PAD_T}
          fill="transparent"
        >
          <title>
            {`${moisLabel(d.mois, i)} — capacité : ${fmtCompact(d.capacite)} h · pointées : ${fmtCompact(d.heuresPointees)} h · converties : ${fmtCompact(d.heuresConverties)} h`}
          </title>
        </rect>
      ))}
    </svg>
  )
}
