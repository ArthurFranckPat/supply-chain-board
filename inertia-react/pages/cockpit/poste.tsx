/**
 * Cockpit poste (#119, lot 3) — ce qu'un poste a réellement produit et ce qui
 * lui est promis.
 *
 * DESIGN V3 « LE FIL » : un seul axe de temps continu. Le passé constaté
 * (réplique MFGOPETRK) et le futur engagé (OF fermes du programme, pipeline
 * #46) partagent la même échelle, la même ligne de capacité, la même maille.
 * La coupure « aujourd'hui » est la seule rupture.
 *
 * Sélecteur : la liste des postes vient de la RÉPLIQUE de pointages (6 mois
 * glissants), pas du référentiel de gammes — un poste qui a pointé mais n'est
 * plus dans les gammes reste sélectionnable. Codes à segment NUMÉRIQUE
 * seulement et égalité stricte : `PP_MECA`, `PE_PROD` et les codes suffixés
 * comme `PP_093S` sont d'autres postes, ils n'apparaissent pas et ne se
 * replient sur personne.
 *
 * Les écarts #95 et les OF à solder arrivent par un second fetch : eux seuls
 * interrogent X3, le reste de la page tient sur la réplique.
 *
 * Coquille Inertia + JSON différé, calque /controle-prod.
 */
import { useMemo, useState } from 'react'
import { Factory, PackageCheck, TriangleAlert } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { X3Link } from '@r/components/x3-link'
import {
  LeFil,
  VERDICTS,
  verdictPour,
  lundiIso,
  type AnomalieFil,
  type LeFilProps,
  type MailleFil,
  type Mesure,
} from '@r/components/cockpit/le-fil'
import {
  DettePoste,
  type AnomaliesUsineVue,
  type AnomaliesVue,
} from '@r/components/cockpit/dette-poste'
import { PILL, RefreshPill, ToolbarRow, ToolbarSpacer } from '@r/components/vision/toolbar'
import { fetchBoardFeasibility, feasibilityWindowFromDates } from '@r/lib/board/feasibility-map'
import type { FeasStatus } from '@r/lib/board/types'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import { fmtH, type EngagementRow } from '@r/lib/board/engagement-format'

interface PosteListItem {
  code: string
  label: string
}

interface ReplicaState {
  disponible: boolean
  raison: string | null
  dernierRunIso: string | null
}

interface PosteInfo {
  code: string
  label: string
  atelier: string
  atelierLabel: string
  capaciteHebdoHeures: number | null
  regimeHebdo: number[] | null
  dernierPointageIso: string | null
}

interface MailleProduction {
  date: string
  qty: number
  heures: number
  dontHeuresReglage: number
}

interface PalettesMaille {
  date: string
  /** null = absence de coefficient palette, pas zéro (#119). */
  palettes: number | null
}

interface PasseMoisHeures {
  mois: string
  capacite: number
  heuresPointees: number
  heuresConverties: number
}

interface Passe {
  nbPointages: number
  productionParJour: MailleProduction[]
  productionParSemaine: MailleProduction[]
  productionParMois: MailleProduction[]
  palettes: { parJour: PalettesMaille[]; parSemaine: PalettesMaille[]; parMois: PalettesMaille[] }
  heuresParMois: PasseMoisHeures[]
}

interface FiabiliteArticle {
  article: string
  qty: number
  heuresPointees: number
  heuresTheoriques: number
  ratio: number | null
}

interface AdherenceSemaine {
  semaine: string
  prevus: number
  pointes: number
  taux: number | null
}

interface AnalysesVue {
  fiabilite: {
    articles: FiabiliteArticle[]
    heuresPointees: number
    heuresTheoriques: number
    ratioGlobal: number | null
    exclusFauteCadence: number
  }
  adherence: AdherenceSemaine[]
}

interface PostesPayload {
  postes: PosteListItem[]
  defaut: string | null
  fenetre: { fromIso: string; toIso: string }
  replica: ReplicaState
}

interface PostePayload {
  poste: PosteInfo
  engagement: {
    poste: { code: string; label: string }
    count: number
    totalHours: number
    weeklyCapacityHours: number | null
    rows: EngagementRow[]
    x3Error: string | null
  } | null
  /** Passé constaté — null si la réplique est indisponible. */
  passe: Passe | null
  /** Anomalies de pointage — null si la réplique est indisponible. */
  anomalies: AnomaliesVue | null
  /** Fiabilité gamme, adhérence, mix articles — null si réplique indisponible. */
  analyses: AnalysesVue | null
  fenetre: { fromIso: string; toIso: string }
  replica: ReplicaState
  x3Error: string | null
}

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const

const REPLICA_RAISON: Record<string, string> = {
  'disabled': 'lecture réplique désactivée (REPLICA_READS)',
  'never-ingested': 'réplique jamais alimentée',
  'last-run-failed': 'dernière ingestion en échec',
  'env-mismatch': 'réplique alimentée depuis un autre environnement X3',
  'dirty': 'réplique marquée sale après une écriture',
  'stale': 'réplique trop ancienne',
}

interface Props {
  postesHref: string
  posteInitial: string | null
}

export default function CockpitPoste(props: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [chosen, setChosen] = useState(false)
  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [bump, setBump] = useState(0)
  // Maille/mesure remontées ici : le remontage par `key` au changement de poste
  // (état faisabilité) ne doit pas faire perdre le réglage d'affichage.
  const [maille, setMaille] = useState<MailleFil>('semaine')
  const [mesure, setMesure] = useState<Mesure>('h')

  // Un seul mécanisme de refresh : le bump ajoute ?refresh=1 aux deux fetches
  // (cache-bust serveur). Avant, un router.visit en doublon rechargeait la page
  // et laissait ?refresh=1 dans l'URL (tout reload futur forçait le refresh).
  const q = bump > 0 ? '?refresh=1' : ''
  const postes = useTimedFetch<PostesPayload>(`${props.postesHref}${q}`)

  // Poste effectif : choix utilisateur > présélection ?poste= > défaut serveur.
  // Résolu seulement quand la liste est là, pour valider le code présélectionné.
  const effective = useMemo(() => {
    if (!postes.data) return null
    if (chosen && selected) return selected
    if (!chosen && props.posteInitial) {
      const known = postes.data.postes.some((p) => p.code === props.posteInitial)
      if (known) return props.posteInitial
    }
    return postes.data.defaut
  }, [postes.data, chosen, selected, props.posteInitial])

  const detailHref = effective
    ? `/api/v1/planning/cockpit/postes/${encodeURIComponent(effective)}${q}`
    : null
  const detail = useTimedFetch<PostePayload>(detailHref)

  // Écarts #95 + OF à solder : second fetch, volontairement découplé. Ces deux
  // familles interrogent X3 en direct ; le poste s'affiche sans les attendre.
  // Déclenché seulement quand le bandeau anomalies existe (réplique debout) :
  // sans lui rien ne s'affiche, inutile de réveiller X3.
  const usineHref =
    effective && detail.data?.anomalies
      ? `/api/v1/planning/cockpit/postes/${encodeURIComponent(effective)}/anomalies-usine${q}`
      : null
  const usine = useTimedFetch<AnomaliesUsineVue>(usineHref)

  const pick = (code: string) => {
    setChosen(true)
    setSelected(code)
  }

  const refresh = () => setBump((b) => b + 1)

  const replicaDown = postes.data ? !postes.data.replica.disponible : false

  return (
    <AppLayout
      title="Cockpit poste"
      active="cockpit"
      subtitle="Production constatée et engagement, poste par poste"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        postes.data && (
          <div>
            <b className="font-bold text-foreground">{postes.data.postes.length}</b> postes ·{' '}
            {dateLong(postes.data.fenetre.fromIso)} → {dateLong(postes.data.fenetre.toIso)}
          </div>
        )
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <ToolbarRow>
          {/* Sélecteur de poste — la liste est la donnée, pas un référentiel figé. */}
          <div className={cn(PILL, 'gap-2')}>
            <Factory size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <select
              className="max-w-[340px] cursor-pointer border-0 bg-transparent px-0 font-mono text-xs font-bold text-foreground shadow-none outline-none"
              value={effective ?? ''}
              onChange={(e) => pick(e.currentTarget.value)}
              disabled={!postes.data || postes.data.postes.length === 0}
              aria-label="Poste"
            >
              {!postes.data && <option value="">Chargement…</option>}
              {postes.data?.postes.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.label && p.label !== p.code ? `${p.code} — ${p.label}` : p.code}
                </option>
              ))}
            </select>
          </div>

          <ToolbarSpacer />

          <RefreshPill
            loading={(postes.loading && !postes.data) || (detail.loading && !detail.data)}
            onClick={refresh}
            title="Rafraîchir (invalide le cache serveur)"
          />
        </ToolbarRow>

        {/* Indisponibilité de la réplique : le passé constaté ne vient JAMAIS de la
            voie directe, on l'affiche au lieu de le calculer en douce. */}
        {replicaDown && postes.data && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Passé productif indisponible :</span>
            <span className="font-mono">
              {postes.data.replica.raison
                ? (REPLICA_RAISON[postes.data.replica.raison] ?? postes.data.replica.raison)
                : 'réplique de pointages hors service'}
              {postes.data.replica.dernierRunIso &&
                ` · dernier run ${dateLong(postes.data.replica.dernierRunIso)}`}
            </span>
          </div>
        )}

        {postes.loading && !postes.data ? (
          <LoadingState className="flex-1" variant="orb" orbState="searching" title="Postes…" />
        ) : detail.loading && !detail.data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title={`Chargement du poste ${effective ?? ''}…`}
          />
        ) : detail.data ? (
          <PosteDetail
            // La clé force le remontage au changement de poste : l'état local
            // (faisabilité) repart de zéro au lieu de survivre à l'ancien poste.
            key={detail.data.poste.code}
            payload={detail.data}
            usine={usine.data ?? null}
            usineLoading={usine.loading}
            onSelectOf={(num) => {
              setDetailOf(num)
              setDetailOpen(true)
            }}
            maille={maille}
            onMaille={setMaille}
            mesure={mesure}
            onMesure={setMesure}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
            Aucune donnée à afficher pour ce poste.
          </div>
        )}
      </div>

      <OfDetailSheet num={detailOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}

/** Le fil du poste + engagement + dette + analyses (design V3). */
function PosteDetail(props: {
  payload: PostePayload
  usine: AnomaliesUsineVue | null
  usineLoading: boolean
  onSelectOf: (numOf: string) => void
  maille: MailleFil
  onMaille: (m: MailleFil) => void
  mesure: Mesure
  onMesure: (m: Mesure) => void
}) {
  const { poste, engagement, passe, anomalies, analyses, x3Error } = props.payload
  const loadError = x3Error ?? engagement?.x3Error ?? null
  // Le cockpit mesure la charge réellement engagée : uniquement les OF fermes
  // (WIPSTA=1). Le loader partagé conserve les planifiés/suggérés pour le
  // séquenceur, mais ils ne doivent pas gonfler ce cockpit.
  const engagementFerme = useMemo(() => {
    if (!engagement) return null
    const rows = engagement.rows.filter((row) => row.status === 1)
    return {
      ...engagement,
      count: rows.length,
      totalHours: rows.reduce((sum, row) => sum + row.hours, 0),
      rows,
    }
  }, [engagement])
  const regimeBrutTotal = poste.regimeHebdo?.reduce((sum, h) => sum + Math.max(0, h), 0) ?? 0
  const regimeNetFactor =
    regimeBrutTotal > 0 && poste.capaciteHebdoHeures
      ? poste.capaciteHebdoHeures / regimeBrutTotal
      : 1
  const regimeNet = poste.regimeHebdo?.map((h) => h * regimeNetFactor) ?? null
  const regimeTitle =
    regimeNet && regimeBrutTotal > 0
      ? `Régime net : ${fmtHs(poste.capaciteHebdoHeures ?? regimeBrutTotal)} h/sem · régime brut X3 : ${fmtHs(regimeBrutTotal)} h/sem`
      : 'Régime horaire déclaré par X3'

  // Props du fil construites hors condition (passe peut être null → pas de fil).
  const filProps = useMemo(
    () =>
      passe
        ? construireFilProps(poste, passe, engagementFerme, anomalies, props.usine, analyses)
        : null,
    [poste, passe, engagementFerme, anomalies, props.usine, analyses]
  )

  // Faisabilité matières — même contrat API que le séquenceur (#119 : reprise du
  // bloc séquenceur sans dupliquer la logique). À la demande : le calcul est
  // lourd, on ne le paie qu'à l'ouverture du cockpit d'un poste donné.
  const [feasMap, setFeasMap] = useState<Record<string, FeasStatus> | null>(null)
  const [feasLoading, setFeasLoading] = useState(false)
  const [feasError, setFeasError] = useState<string | null>(null)
  const [feasCounts, setFeasCounts] = useState({ ok: 0, blocked: 0, qc: 0 })

  const runFeasibility = async () => {
    if (!engagementFerme || engagementFerme.rows.length === 0 || feasLoading) return
    setFeasLoading(true)
    setFeasError(null)
    try {
      const { from, to } = feasibilityWindowFromDates(
        engagementFerme.rows.map((r) => r.dateDebutIso)
      )
      const { map, nbOk, nbBlocked, nbQc } = await fetchBoardFeasibility({
        from,
        to,
        mode: 'sequential',
        workstation: poste.code,
      })
      setFeasMap(map)
      setFeasCounts({ ok: nbOk, blocked: nbBlocked, qc: nbQc })
    } catch (e) {
      setFeasError((e as Error).message)
    } finally {
      setFeasLoading(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* Identité du poste — une ligne, les 3 champs non exposés dits une fois. */}
      <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-secondary px-7 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-bold text-foreground">{poste.code}</span>
          {poste.label && poste.label !== poste.code && (
            <span className="text-[13px] font-medium text-muted-foreground">{poste.label}</span>
          )}
        </div>
        {poste.atelierLabel && (
          <span className="text-[12px] font-medium text-muted-foreground">
            {poste.atelierLabel}
          </span>
        )}

        {poste.capaciteHebdoHeures != null && (
          <div className="flex items-baseline gap-1">
            <span className="text-[15px] font-bold tabular-nums text-foreground">
              {fmtHs(poste.capaciteHebdoHeures)}
            </span>
            <span className="font-mono text-[10px] font-semibold text-muted-foreground">h/sem</span>
          </div>
        )}

        <div className="flex items-center gap-1" title={regimeTitle}>
          {regimeNet && (
            <span className="mr-1 font-mono text-[9px] font-semibold text-muted-foreground">
              net
            </span>
          )}
          {regimeNet?.map((h, i) => (
            <div key={i} className="flex flex-col items-center">
              <span
                className={cn(
                  'font-mono text-[10px] font-semibold tabular-nums',
                  h > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                )}
              >
                {h > 0 ? fmtHs(h) : '·'}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground/60">{JOURS[i]}</span>
            </div>
          ))}
        </div>

        <div className="flex items-baseline gap-1.5" title="Dernier pointage dans la fenêtre">
          <span className="text-[11px] font-medium text-muted-foreground">Dernier pointage</span>
          <span className="font-mono text-[12px] font-bold tabular-nums text-foreground">
            {dateLong(poste.dernierPointageIso)}
          </span>
        </div>

        <div className="flex-1" />

        <span
          className="cursor-help border-b border-dotted border-input text-[10px] text-muted-foreground"
          title="Nature du poste, efficience et nombre de postes ne sont pas exposés par le loader (spec lot 3). Ils apparaîtront ici une fois branchés."
        >
          3 champs X3 non exposés
        </span>
      </div>

      {loadError && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
          <span className="font-bold">Erreur chargement :</span>
          <span className="font-mono">{loadError}</span>
        </div>
      )}

      {/* LE FIL — passé constaté + futur engagé sur un seul axe (design V3). */}
      {filProps && (
        <div className="px-7 py-4">
          <LeFil
            {...filProps}
            maille={props.maille}
            onMaille={props.onMaille}
            mesure={props.mesure}
            onMesure={props.onMesure}
          />
        </div>
      )}

      {/* Engagement — table dense avec semaines et total. */}
      <div className="px-7 pb-4">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Ce qui est engagé
          </span>
          {engagementFerme && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {engagementFerme.count} OF fermes · {fmtHs(engagementFerme.totalHours)} h
            </span>
          )}
          <span className="flex-1" />
          {engagementFerme && engagementFerme.rows.length > 0 && (
            <button
              type="button"
              onClick={() => void runFeasibility()}
              disabled={feasLoading}
              className={cn(
                PILL,
                'cursor-pointer px-3 font-mono text-[11px] font-semibold text-foreground hover:border-brand/50 disabled:opacity-60'
              )}
              title="Couverture matières des OF engagés (même moteur que /programme)"
            >
              <PackageCheck
                size={14}
                strokeWidth={1.75}
                className={cn(feasLoading && 'animate-pulse')}
              />
              {feasLoading ? 'Calcul…' : feasMap ? 'Recalculer la faisabilité' : 'Faisabilité'}
            </button>
          )}
        </div>

        {feasError && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-[11px] text-foreground">
            <TriangleAlert size={14} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Faisabilité :</span>
            <span className="font-mono">{feasError}</span>
          </div>
        )}

        {!engagementFerme || engagementFerme.rows.length === 0 ? (
          <div className="rounded-lg border border-rule bg-card p-6 text-center font-fraunces text-[13px] italic text-muted-foreground">
            Aucun OF engagé sur ce poste.
          </div>
        ) : (
          <EngagementTable
            rows={engagementFerme.rows}
            feasMap={feasMap}
            feasCounts={feasCounts}
            capaciteHebdoHeures={poste.capaciteHebdoHeures}
            regimeHebdo={poste.regimeHebdo}
            onSelectOf={props.onSelectOf}
          />
        )}
      </div>

      {/* La dette du poste — 7 familles du domaine. */}
      {passe && anomalies && (
        <div className="border-t border-border px-7 py-4">
          <DettePoste
            anomalies={anomalies}
            usine={props.usine}
            usineLoading={props.usineLoading}
            onSelectOf={props.onSelectOf}
          />
        </div>
      )}

      {/* Analyses — ce que ça dit des gammes (design V3). */}
      {passe && analyses && <AnalysesSection analyses={analyses} />}
    </div>
  )
}

/** Construit les props du fil depuis le payload réel — fonction pure, aucun hook. */
function construireFilProps(
  poste: PosteInfo,
  passe: Passe,
  engagement: PostePayload['engagement'],
  anomalies: AnomaliesVue | null,
  usine: AnomaliesUsineVue | null,
  analyses: AnalysesVue | null
): Omit<LeFilProps, 'maille' | 'onMaille' | 'mesure' | 'onMesure'> {
  const palJ = new Map(passe.palettes.parJour.map((p) => [p.date, p.palettes]))
  const palS = new Map(passe.palettes.parSemaine.map((p) => [p.date, p.palettes]))
  const palM = new Map(passe.palettes.parMois.map((p) => [p.date, p.palettes]))

  const passeParMaille: LeFilProps['passeParMaille'] = {
    jour: passe.productionParJour.map((p) => ({
      date: p.date,
      heures: p.heures,
      qty: p.qty,
      palettes: palJ.get(p.date) ?? null,
    })),
    semaine: passe.productionParSemaine.map((p) => ({
      date: p.date,
      heures: p.heures,
      qty: p.qty,
      palettes: palS.get(p.date) ?? null,
    })),
    mois: passe.productionParMois.map((p) => ({
      date: p.date,
      heures: p.heures,
      qty: p.qty,
      palettes: palM.get(p.date) ?? null,
    })),
  }

  const totaux = passe.productionParSemaine.reduce(
    (a, p) => ({ heures: a.heures + p.heures, qty: a.qty + p.qty }),
    { heures: 0, qty: 0 }
  )

  const ofsEngages =
    engagement?.rows.map((r) => ({
      numOf: r.numOf,
      dateDebutIso: r.dateDebutIso,
      livraisonIso: r.livraisonIso,
      hours: r.hours,
    })) ?? []

  // Anomalies → pastilles datées sur le fil.
  const filAnomalies: AnomalieFil[] = []
  const pousser = (
    a: { numOf: string; dateDebutIso: string | null; dernierPointageIso: string | null },
    crit: boolean,
    texte: string
  ) => {
    const dateIso = a.dernierPointageIso ?? a.dateDebutIso
    if (dateIso) filAnomalies.push({ dateIso, crit, texte })
  }
  anomalies?.jamaisPointes.forEach((a) =>
    pousser(a, true, `Jamais pointé · ${a.numOf} (${a.jours ?? '—'} j)`)
  )
  anomalies?.silences.forEach((a) =>
    pousser(a, false, `Silence · ${a.numOf} (${a.jours ?? '—'} j)`)
  )
  anomalies?.heures.forEach((a) =>
    pousser(a, false, `${a.kind === 'sans_heures' ? 'Sans heures' : 'Heures faibles'} · ${a.numOf}`)
  )
  usine?.ecartsDeclaration.forEach((a) => pousser(a, false, `Écart de déclaration · ${a.numOf}`))
  usine?.ofsASolder.forEach((a) => pousser(a, false, `OF à solder · ${a.numOf}`))

  // Verdicts — seuils explicites (maquette V3).
  const capHebdo = poste.capaciteHebdoHeures ?? 0
  const totalH = totaux.heures
  const capTotale = capHebdo > 0 ? passe.productionParSemaine.length * capHebdo : 0
  const sat = capTotale > 0 ? totalH / capTotale : null
  const vSat =
    sat !== null
      ? verdictPour(VERDICTS.saturation, sat)
      : { txt: 'Capacité inconnue', cls: 'mute' as const }
  const semOver = passe.productionParSemaine.filter(
    (p) => capHebdo > 0 && p.heures > capHebdo
  ).length

  const hP = analyses?.fiabilite.heuresPointees ?? 0
  const hT = analyses?.fiabilite.heuresTheoriques ?? 0
  const fia = hT > 0 ? hP / hT : null
  const vFia =
    fia !== null
      ? verdictPour(VERDICTS.fiabilite, fia)
      : { txt: 'Gamme non mesurable', cls: 'mute' as const }

  const hEng = engagement?.totalHours ?? 0
  const semNonVides = ofsEngages.filter((o) => o.hours > 0).length
  const carnet = capHebdo > 0 && semNonVides > 0 ? hEng / (semNonVides * capHebdo) : null
  const vCarnet =
    carnet !== null
      ? verdictPour(VERDICTS.carnet, carnet)
      : { txt: 'Rien d’engagé', cls: 'mute' as const }

  return {
    passeParMaille,
    totaux,
    ofsEngages,
    capaciteHebdoHeures: poste.capaciteHebdoHeures,
    regimeHebdo: poste.regimeHebdo,
    anomalies: filAnomalies,
    verdicts: {
      saturation: {
        big: `${sat !== null ? Math.round(sat * 100) : '—'} <em>%</em>`,
        txt: vSat.txt,
        cls: vSat.cls,
        sub: `${fmtHs(totalH)} h pointées pour ${fmtHs(capTotale)} h déclarées · ${semOver} semaine${semOver > 1 ? 's' : ''} sur ${passe.productionParSemaine.length} au-dessus`,
      },
      fiabilite: {
        big: `${fia !== null ? fia.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} <em>× std</em>`,
        txt: vFia.txt,
        cls: vFia.cls,
        sub: `${fmtHs(hP)} h pointées pour ${fmtHs(hT)} h de gamme${analyses?.fiabilite.exclusFauteCadence ? ` · ${analyses.fiabilite.exclusFauteCadence} article(s) sans cadence, exclus` : ''} · la charge de /programme est sous-estimée d'autant`,
      },
      carnet: {
        big: `${fmtHs(hEng)} <em>h</em>`,
        txt: vCarnet.txt,
        cls: vCarnet.cls,
        sub: `${engagement?.count ?? 0} OF fermes · ${carnet !== null ? Math.round(carnet * 100) : '—'} % de la capacité sur les semaines engagées`,
      },
    },
  }
}

/** Table engagement dense : sem, OF, article, fenêtre, heures, faisabilité. */
function EngagementTable(props: {
  rows: EngagementRow[]
  feasMap: Record<string, FeasStatus> | null
  feasCounts: { ok: number; blocked: number; qc: number }
  capaciteHebdoHeures: number | null
  regimeHebdo: number[] | null
  onSelectOf: (numOf: string) => void
}) {
  const { rows, feasMap, feasCounts, capaciteHebdoHeures, regimeHebdo, onSelectOf } = props
  const totHrs = rows.reduce((a, r) => a + (r.hours ?? 0), 0)
  // Les jours équivalents utilisent la capacité nette du poste, jamais une
  // constante générique de 7 h/j. Les DAYCAP résiduels (< 0,1 h) ne comptent
  // pas comme journée active.
  const joursActifs = regimeHebdo?.filter((h) => h > 0.1).length || 5
  const capaciteJourMoy =
    capaciteHebdoHeures && capaciteHebdoHeures > 0 ? capaciteHebdoHeures / joursActifs : null
  const joursEquivalents = capaciteJourMoy ? totHrs / capaciteJourMoy : null
  const semainesEquivalentes =
    capaciteHebdoHeures && capaciteHebdoHeures > 0 ? totHrs / capaciteHebdoHeures : null

  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-float">
      {feasMap && (
        <div className="flex items-center gap-3 border-b border-rule bg-secondary px-4 py-1.5 font-mono text-[10px] font-semibold">
          <span className="text-ferme">{feasCounts.ok} faisables</span>
          {feasCounts.qc > 0 && <span className="text-suggere">{feasCounts.qc} sous CQ</span>}
          {feasCounts.blocked > 0 && (
            <span className="text-destructive">{feasCounts.blocked} bloqués</span>
          )}
        </div>
      )}
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-secondary">
            <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">Sem.</th>
              <th className="px-4 py-2">OF</th>
              <th className="px-4 py-2">Article</th>
              <th className="px-4 py-2">Fenêtre</th>
              <th className="px-4 py-2 text-right">Heures</th>
              <th className="px-4 py-2">Faisabilité</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule-soft">
            {rows.map((r) => {
              const sem = r.dateDebutIso ? semaineISO(lundiIso(r.dateDebutIso)) : '—'
              const feas = feasMap?.[r.numOf] ?? null
              return (
                <tr key={r.numOf} className="font-mono text-[11px] tabular-nums hover:bg-secondary">
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                      {sem}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="cursor-pointer font-bold tracking-tight text-brand hover:underline"
                      onClick={() => onSelectOf(r.numOf)}
                    >
                      {r.numOf}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.article}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {fmtDateFr(r.dateDebutIso)} → {fmtDateFr(r.livraisonIso)}
                  </td>
                  <td className="px-4 py-2 text-right font-bold">{fmtHs(r.hours)} h</td>
                  <td className="px-4 py-2">
                    {feas ? (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                          feas.st === 'ok' && 'bg-ferme/15 text-ferme',
                          feas.st === 'qc' && 'bg-suggere/15 text-suggere',
                          feas.st === 'blocked' && 'bg-destructive/15 text-destructive'
                        )}
                        title={
                          feas.st === 'blocked'
                            ? `Composants manquants : ${feas.missing.join(', ') || '—'}`
                            : feas.st === 'qc'
                              ? `Couvert grâce au stock sous contrôle qualité : ${Object.keys(feas.qcComponents ?? {}).join(', ')}`
                              : 'Faisable'
                        }
                      >
                        {feas.st === 'ok' ? 'faisable' : feas.st === 'qc' ? 'sous CQ' : 'bloqué'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <X3Link
                      fonction="GESMFG"
                      cle={r.numOf}
                      iconOnly
                      title={`Ouvrir ${r.numOf} dans Sage X3`}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-secondary font-mono text-[11px] font-bold">
              <td className="px-4 py-2" colSpan={4}>
                Total engagé
              </td>
              <td className="px-4 py-2 text-right">{fmtHs(totHrs)} h</td>
              <td className="px-4 py-2 text-muted-foreground" colSpan={2}>
                {joursEquivalents !== null && semainesEquivalentes !== null
                  ? `${fmtNombre(joursEquivalents)} j ouvrés équiv. · ${fmtNombre(semainesEquivalentes)} sem. de capacité · base ${fmtHs(capaciteJourMoy ?? 0)} h/j`
                  : 'Équivalent capacité indisponible'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Analyses V3 : écart de cadence par article (axe 0,75→1,25) + adhérence. */
function AnalysesSection({ analyses }: { analyses: AnalysesVue }) {
  const { fiabilite, adherence } = analyses
  const MIN = 0.75
  const MAX = 1.25
  const pos = (r: number) => ((Math.min(MAX, Math.max(MIN, r)) - MIN) / (MAX - MIN)) * 100
  const z = pos(1)

  const ratioAff = (a: FiabiliteArticle): number | null =>
    a.heuresPointees > 0 && a.heuresTheoriques > 0 ? a.heuresPointees / a.heuresTheoriques : null
  const couleur = (r: number) =>
    r > 1.1
      ? 'var(--color-destructive)'
      : r > 1.02
        ? 'var(--color-arches)'
        : r < 0.9
          ? 'var(--color-babu)'
          : 'var(--color-ferme)'

  const maxAdh = Math.max(1, ...adherence.map((a) => (a.taux ?? 0) * 100))

  return (
    <div className="border-t border-border px-7 py-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          Ce que ça dit des gammes
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          affichage seul · aucune écriture vers X3
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        {/* Écart de cadence par article — pointé ÷ gamme. */}
        <div className="rounded-lg border border-rule bg-card p-4 shadow-float">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Écart de cadence par article · pointé ÷ gamme
          </h3>
          <div
            className="mt-2 flex justify-between px-0 font-mono text-[8px] font-semibold text-muted-foreground"
            style={{ paddingLeft: '196px', paddingRight: '112px' }}
          >
            <span>0,75×</span>
            <span>1,00×</span>
            <span>1,25×</span>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {fiabilite.articles.length === 0 ? (
              <div className="py-4 text-center font-fraunces text-[12px] italic text-muted-foreground">
                Aucune production avec cadence de gamme.
              </div>
            ) : (
              fiabilite.articles.slice(0, 6).map((a) => {
                const r = ratioAff(a)
                if (r === null) return null
                const p = pos(r)
                const gauche = Math.min(p, z)
                const largeur = Math.max(1.5, Math.abs(p - z))
                return (
                  <div key={a.article} className="flex items-center gap-2.5 text-[10px]">
                    <span className="w-[84px] shrink-0 font-bold">{a.article}</span>
                    <span className="w-[62px] shrink-0 text-right text-muted-foreground">
                      {a.qty.toLocaleString('fr-FR')} pc
                    </span>
                    <span className="relative h-3.5 flex-1 overflow-hidden rounded-[3px] bg-muted">
                      <span className="absolute bottom-0 left-1/2 top-0 w-px bg-input" />
                      <span
                        className="absolute bottom-1 top-1 rounded-[2px]"
                        style={{ left: `${gauche}%`, width: `${largeur}%`, background: couleur(r) }}
                      />
                    </span>
                    <span
                      className="w-[52px] shrink-0 text-right font-bold"
                      style={{ color: couleur(r) }}
                    >
                      {r.toLocaleString('fr-FR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      ×
                    </span>
                  </div>
                )
              })
            )}
          </div>
          <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
            Un article à droite de 1,00× consomme plus d'heures que sa gamme n'en prévoit :{' '}
            <b>la charge calculée sur /programme et /charge est sous-estimée d'autant</b>. Seul
            endroit de l'app où l'écart se constate.
            {fiabilite.exclusFauteCadence > 0 &&
              ` ${fiabilite.exclusFauteCadence} article(s) sans cadence exploitable, exclus.`}
          </p>
        </div>

        {/* Adhérence au programme. */}
        <div className="rounded-lg border border-rule bg-card p-4 shadow-float">
          <h3 className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Adhérence au programme
          </h3>
          {adherence.length === 0 ? (
            <div className="py-4 text-center font-fraunces text-[12px] italic text-muted-foreground">
              Pas de semaine complète dans la fenêtre.
            </div>
          ) : (
            <>
              <div className="mt-3 flex h-11 items-end gap-1">
                {adherence.map((s) => (
                  <div
                    key={s.semaine}
                    className="group relative flex-1 rounded-t-[3px] bg-planifie opacity-75 hover:opacity-100"
                    style={{ height: `${Math.max(8, (((s.taux ?? 0) * 100) / maxAdh) * 100)}%` }}
                  >
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[9px] font-semibold text-white group-hover:block">
                      {semaineLabel(s.semaine)} ·{' '}
                      {s.taux !== null ? `${Math.round(s.taux * 100)} %` : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1 font-mono text-[8px] font-semibold text-muted-foreground">
                {adherence.map((s) => (
                  <span key={s.semaine} className="flex-1 text-center">
                    {s.semaine.slice(5).replace('-', '/')}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex justify-between gap-2 text-[10px]">
                <span className="text-muted-foreground">Dernière semaine</span>
                <span className="font-bold">
                  {adherence[adherence.length - 1].taux !== null
                    ? `${Math.round((adherence[adherence.length - 1].taux ?? 0) * 100)} %`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-2 text-[10px]">
                <span className="text-muted-foreground">Moyenne fenêtre</span>
                <span className="font-bold" id="adh-moy">
                  {Math.round(
                    (adherence.reduce((a, s) => a + (s.taux ?? 0), 0) / adherence.length) * 100
                  )}{' '}
                  %
                </span>
              </div>
              <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
                Part des OF planifiés sur le poste une semaine donnée qui y ont effectivement reçu
                un pointage cette semaine-là. {adherence.length} semaines récentes seulement (ORDERS
                ne garde pas les OF soldés).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** ISO → JJ/MM/AAAA — le critère d'acceptation #119 pour les dates du cockpit. */
const dateLong = (iso: string | null) => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}
const fmtDateFr = (iso: string | null): string => {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : iso
}
/** « S 03/08 » — l'année entière rendait les libellés trop larges pour l'axe. */
const semaineLabel = (lundiIso: string) => `S ${dateLong(lundiIso).slice(0, 5)}`

/** Numéro de semaine ISO (S32) depuis un lundi ISO. */
const semaineISO = (lundiIso: string): string => {
  const d = new Date(`${lundiIso}T00:00:00`)
  const jour = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() + (4 - jour))
  const debutAnnee = new Date(d.getFullYear(), 0, 1)
  const semaine = Math.ceil(((d.getTime() - debutAnnee.getTime()) / 86400000 + 1) / 7)
  return `S${semaine}`
}

const aujourdhuiIso = (): string => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}
const plusSeptJours = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + 7)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

/** fmtH sans le « ,00 » des entiers — 40 h au lieu de 40,00 h. */
const fmtHs = (h: number) => fmtH(h).replace(/,00$/, '')
const fmtNombre = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
