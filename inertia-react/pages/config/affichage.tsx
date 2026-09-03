/**
 * Configuration de l'affichage (issue #186) — réglages de confort visuel.
 *
 * Rien ici ne touche aux données ni aux calculs : ce sont des réglages de
 * POSTE, stockés dans le navigateur (`lib/display-prefs-store.ts`). L'écran le
 * dit en clair plutôt que de laisser croire à un réglage de compte — un
 * utilisateur qui change de machine ne doit pas chercher pourquoi son réglage
 * a « disparu ».
 */
import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import ConfigNav from '@r/components/config/config-nav'
import { Switch } from '@r/components/ui/switch'
import { useDisplayPrefsStore, DISPLAY_PREFS_DEFAULTS } from '@r/lib/display-prefs-store'
import { useDataStatusStore } from '@r/lib/data-status-store'
import { FLASH_MS } from '@r/lib/diff-flash'

/** Une ligne de réglage : libellé, explication, interrupteur à droite. */
function SettingRow(props: {
  id: string
  title: string
  description: ReactNode
  checked: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-rule-soft px-5 py-4 last:border-b-0">
      <div className="min-w-0">
        <label htmlFor={props.id} className="cursor-pointer text-[13px] font-bold text-foreground">
          {props.title}
        </label>
        <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-muted-foreground">
          {props.description}
        </p>
      </div>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onChange}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

export default function Affichage() {
  const diffFlash = useDisplayPrefsStore((s) => s.diffFlash)
  const setDiffFlash = useDisplayPrefsStore((s) => s.setDiffFlash)
  const reset = useDisplayPrefsStore((s) => s.reset)

  // Éteindre le réglage doit aussi retirer le récap déjà affiché dans la barre
  // d'état : sans ça, « 12 changements » resterait à l'écran après avoir coupé
  // la fonctionnalité qui l'a produit.
  const onDiffFlash = (on: boolean) => {
    setDiffFlash(on)
    if (!on) useDataStatusStore.getState().clearDiff()
  }

  const isDefault = diffFlash === DISPLAY_PREFS_DEFAULTS.diffFlash

  return (
    <AppLayout
      title="Affichage"
      active="config"
      subtitle="Configuration · Affichage"
      theme="airbnb"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-6">
        <ConfigNav active="affichage" />

        <div>
          <h1 className="mb-1 font-fraunces text-[24px] font-extrabold tracking-tight">
            Affichage
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Réglages de confort visuel. Ils sont enregistrés{' '}
            <b className="text-foreground">sur ce poste</b> (dans ce navigateur) et ne suivent pas
            votre compte d'une machine à l'autre. Aucun n'a d'effet sur les données ni sur les
            calculs.
          </p>
        </div>

        <section className="overflow-hidden rounded-xl border border-rule bg-card shadow-float">
          <header className="flex items-center justify-between gap-4 border-b border-rule bg-secondary px-5 py-2.5">
            <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              Rechargement des données
            </h2>
            {!isDefault && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold text-muted-foreground transition-colors hover:text-foreground"
                title="Remettre les réglages d'affichage à leur valeur par défaut"
              >
                <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />
                Valeurs par défaut
              </button>
            )}
          </header>

          <SettingRow
            id="pref-diff-flash"
            title="Signaler ce qui a changé au rechargement"
            description={
              <>
                Après un clic sur <b className="text-foreground">Recharger</b>, les cellules dont la
                valeur a bougé s'allument en ambre pendant {FLASH_MS / 1000} s, les lignes apparues
                en vert et les lignes disparues en rouge avant de partir. La barre d'état des
                données résume le tout («&nbsp;n changements · n nouvelles · n sorties&nbsp;»), y
                compris pour ce qui est hors écran. À couper si le clignotement gêne — écran de
                supervision affiché en continu, sensibilité au mouvement, capture vidéo.
              </>
            }
            checked={diffFlash}
            onChange={onDiffFlash}
          />
        </section>
      </div>
    </AppLayout>
  )
}
