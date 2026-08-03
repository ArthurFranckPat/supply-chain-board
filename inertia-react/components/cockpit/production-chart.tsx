/**
 * Graphe « Production » du cockpit (#119, lot 4) — maillage MENSUEL :
 * quantité produite (barres) + heures pointées (ligne), deux échelles.
 * SVG maison, calque /charge (pas de lib de charts dans ce repo).
 */
import { useMemo } from 'react'
import { BRAND, FERME, FG, fmtCompact, moisLabel } from './chart-common'

export interface ProductionMoisView {
  mois: string
  qty: number
  heures: number
  dontHeuresReglage: number
}

const W = 560
const H = 170
const PAD_L = 34
const PAD_R = 34
const PAD_T = 12
const PAD_B = 22

export function ProductionChart({ data }: { data: ProductionMoisView[] }) {
  const geom = useMemo(() => {
    const n = data.length || 1
    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B
    const slot = plotW / n
    const barW = Math.min(slot * 0.5, 42)

    const maxQty = Math.max(...data.map((d) => d.qty), 0) * 1.08 || 1
    const maxH = Math.max(...data.map((d) => d.heures), 0) * 1.08 || 1
    const yQty = (v: number) => PAD_T + plotH - (v / maxQty) * plotH
    const yH = (v: number) => PAD_T + plotH - (v / maxH) * plotH

    const bars = data.map((d, i) => {
      const cx = PAD_L + slot * i + slot / 2
      return {
        mois: d.mois,
        cx,
        x: cx - barW / 2,
        y: yQty(d.qty),
        h: PAD_T + plotH - yQty(d.qty),
        w: barW,
        qty: d.qty,
      }
    })

    const ligne = data.map((d, i) => ({
      x: PAD_L + slot * i + slot / 2,
      y: yH(d.heures),
      heures: d.heures,
    }))
    const path = ligne.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

    return { bars, ligne, path, maxQty, maxH, baseline: PAD_T + plotH }
  }, [data])

  if (data.length === 0) return null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-[170px] w-full" role="img">
      {/* Lignes de grille + repères d'échelle gauche (quantité) et droite (heures). */}
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
            {fmtCompact(geom.maxQty * f)}
          </text>
          <text
            x={W - PAD_R + 5}
            y={PAD_T + (H - PAD_T - PAD_B) * (1 - f) + 3}
            textAnchor="start"
            fontSize="9"
            fill={FERME}
            fillOpacity="0.7"
          >
            {fmtCompact(geom.maxH * f)}h
          </text>
        </g>
      ))}

      {/* Barres quantité. */}
      {geom.bars.map((b) => (
        <g key={b.mois}>
          <rect x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 0)} rx="3" fill={BRAND} />
          <text
            x={b.cx}
            y={b.y - 4}
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill={FG}
            fillOpacity="0.75"
          >
            {b.qty > 0 ? fmtCompact(b.qty) : ''}
          </text>
        </g>
      ))}

      {/* Ligne heures pointées. */}
      <path d={geom.path} fill="none" stroke={FERME} strokeWidth="2" strokeLinecap="round" />
      {geom.ligne.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill={FERME} />
      ))}

      {/* Axe mois. */}
      <line x1={PAD_L} x2={W - PAD_R} y1={geom.baseline} y2={geom.baseline} stroke={FG} strokeOpacity="0.2" />
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
    </svg>
  )
}
