/**
 * Encart PP_830 (ligne EASY HOME) — partagé par le board OF et le board Commandes.
 *
 * Les deux grilles rendaient jusqu'ici le même bloc en double, à quelques classes
 * près ; l'ajout du récap moteurs aurait fait un troisième exemplaire à maintenir.
 * Contenu : barre de charge par typologie (plein = sans bouche, clair = consomme
 * bouche), stock bouches hygro, et besoins moteurs sur l'horizon affiché.
 */
import { TYPO_META } from '@r/lib/board/types'

export interface PP830Data {
  chargeByTypo: { typo: string; sans: number; bouche: number }[]
  stockBouchesHygro: number | null
  moteurs: {
    total: number
    byRef: { article: string; label: string; qty: number }[]
  } | null
}

const nf = new Intl.NumberFormat('fr-FR')

export function PP830Header({ pp830 }: { pp830: PP830Data }) {
  const total = pp830.chargeByTypo.reduce((s, t) => s + t.sans + t.bouche, 0) || 1
  const seg = (h: number) => `${(h / total) * 100}%`

  return (
    <div className="mt-1.5">
      <div className="flex h-[6px] overflow-hidden rounded-full bg-rule-soft">
        {pp830.chargeByTypo.map((t) => (
          <div key={t.typo} className="flex">
            <span
              className="block h-full"
              style={{
                width: seg(t.sans),
                background: TYPO_META[t.typo]?.color ?? 'var(--border)',
              }}
            />
            {t.bouche > 0 && (
              <span
                className="block h-full"
                style={{
                  width: seg(t.bouche),
                  background: TYPO_META[t.typo]?.light ?? 'var(--rule-soft)',
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-2xs font-bold uppercase tracking-wider">
        {pp830.chargeByTypo.map((t) => (
          <span key={t.typo} className="inline-flex items-center gap-1">
            <span className="inline-flex items-center gap-0.5">
              <span
                className="size-[7px] rounded-[1px]"
                style={{ background: TYPO_META[t.typo]?.color ?? 'var(--border)' }}
              />
              {t.bouche > 0 && (
                <span
                  className="size-[7px] rounded-[1px]"
                  style={{ background: TYPO_META[t.typo]?.light ?? 'var(--rule-soft)' }}
                />
              )}
            </span>
            <span className="text-muted-foreground">{TYPO_META[t.typo]?.label ?? t.typo}</span>
            <span className="tabular-nums text-foreground">{t.sans + t.bouche}h</span>
          </span>
        ))}
      </div>
      {pp830.stockBouchesHygro !== null && (
        <div className="mt-1 flex items-baseline gap-1 text-2xs text-muted-foreground">
          <span>Bouches hygro</span>
          <span
            className="font-fraunces text-sm font-bold tabular-nums"
            style={{ color: 'var(--color-brand)' }}
          >
            {nf.format(pp830.stockBouchesHygro)}
          </span>
          <span>pcs</span>
        </div>
      )}
      {pp830.moteurs && <MoteursRecap moteurs={pp830.moteurs} />}
    </div>
  )
}

/**
 * Besoins moteurs sur l'horizon. Le total est le chiffre à retenir (c'est lui qu'on
 * confronte au stock et aux réceptions) ; le détail par référence suit, trié par
 * quantité décroissante, parce que « 1 200 moteurs » ne dit pas s'il en manque un seul
 * modèle ou tous.
 */
function MoteursRecap({ moteurs }: { moteurs: NonNullable<PP830Data['moteurs']> }) {
  return (
    <div className="mt-1.5 border-t border-rule-soft pt-1.5">
      <div className="flex items-baseline gap-1 text-2xs text-muted-foreground">
        <span>Besoin moteurs</span>
        <span
          className="font-fraunces text-sm font-bold tabular-nums"
          style={{ color: 'var(--color-brand)' }}
        >
          {nf.format(moteurs.total)}
        </span>
        <span>pcs</span>
      </div>
      <div className="mt-0.5 flex flex-col gap-px">
        {moteurs.byRef.map((m) => (
          <div
            key={m.article}
            className="flex items-baseline justify-between gap-2 font-mono text-3xs"
            title={`${m.article} — ${m.label}`}
          >
            <span className="truncate text-muted-foreground">{m.article}</span>
            <span className="shrink-0 font-bold tabular-nums text-foreground">
              {nf.format(m.qty)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
