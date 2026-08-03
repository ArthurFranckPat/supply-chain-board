/**
 * Graphe « Production » du cockpit (#119, lots 4/6) : quantité (barres) +
 * heures pointées (ligne), deux échelles. La maille (jour/semaine/mois) est
 * portée par le label — le serveur sert les trois maillages précalculés.
 * SVG maison, calque /charge (pas de lib de charts dans ce repo).
 */
import { useMemo } from 'react'
import { BRAND, FERME, FG, fmtCompact } from './chart-common'

export interface ProductionMailleView {
  /** Libellé prêt à afficher (ex. « juil. 26 », « S 27/07 », « 03/08 »). */
  label: string
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

export function ProductionChart({ data }: { data: ProductionMailleView[] }) {
  const geom = useMemo(() => {
    const n = data.length || 1
    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B
    const slot = plotW / n
    const barW = Math.max(Math.min(slot * 0.55, 42), 1.5)

    const maxQty = Math.max(...data.map((d) => d.qty), 0) * 1.08 || 1
    const maxH = Math.max(...data.map((d) => d.heures), 0) * 1.08 || 1
    const yQty = (v: number) => PAD_T + plotH - (v / maxQty) * plotH
    const yH = (v: number) => PAD_T + plotH - (v / maxH) * plotH

    const bars = data.map((d, i) => {
      const cx = PAD_L + slot * i + slot / 2
      return {
        label: d.label,
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
    }))
    const path = ligne.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')

    // Étiquettes espacées : en maille jour, tout afficher serait illisible.
    const pasLabel = Math.max(1, Math.ceil(n / 12))

    return { bars, ligne, path, maxQty, maxH, baseline: PAD_T + plotH, pasLabel }
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
      {geom.bars.map((b, i) => (
        <g key={`${b.label}-${i}`}>
          <rect x={b.x} y={b.y} width={b.w} height={Math.max(b.h, 0)} rx="2" fill={BRAND} />
          {/* La valeur au-dessus de la barre n'a de sens qu'en petit effectif. */}
          {geom.bars.length <= 14 && (
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
          )}
        </g>
      ))}

      {/* Ligne heures pointées. */}
      <path d={geom.path} fill="none" stroke={FERME} strokeWidth="2" strokeLinecap="round" />
      {geom.ligne.length <= 40 &&
        geom.ligne.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3" fill={FERME} />)}

      <line x1={PAD_L} x2={W - PAD_R} y1={geom.baseline} y2={geom.baseline} stroke={FG} strokeOpacity="0.2" />
      {geom.bars.map((b, i) =>
        i % geom.pasLabel === 0 ? (
          <text
            key={`${b.label}-x-${i}`}
            x={b.cx}
            y={H - 8}
            textAnchor="middle"
            fontSize="9"
            fill={FG}
            fillOpacity="0.55"
          >
            {b.label}
          </text>
        ) : null
      )}
    </svg>
  )
}
