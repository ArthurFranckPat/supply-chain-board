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
 *
 * Barre d'outils : standard §18 du design system, portée par la prop `toolbar`
 * d'AppLayout (filet, fond, axe px-6 et règle d'impression compris). Zone 01
 * la portée — le poste puis la fenêtre du fil ; zone 04 l'actualisation puis
 * l'action primaire. Ni filtres ni recherche : rien sur cette page ne réduit
 * une liste, et le sélecteur de poste est lui-même cherchable.
 */
import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { CircleCheck, FlaskConical, OctagonX, RefreshCw, TriangleAlert, Wand2 } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { X3Link } from '@r/components/x3-link'
import { Pill } from '@r/components/ui/pill'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import {
  ToolbarDateWindow,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import {
  CellDate,
  CellNumber,
  CellStack,
  CellVerdict,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
} from '@r/components/ui/table-row'
import {
  LeFil,
  VERDICTS,
  fenetreDisponible,
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
  /** Capacité calendaire du mois (fériés/fermetures #37) — seule lecture
   *  consommée (revue #119, round 5). */
  capacite: number
}

/** Un OF terminé du point de vue du poste (lot 4, #119) — pointé dans la
 *  fenêtre, plus en cours. `dernierJourIso` approche la date de sortie. */
interface OfTermineVue {
  numOf: string
  article: string | null
  designation: string | null
  qty: number
  heures: number
  dernierJourIso: string
  palettes: number | null
}

/** Une ligne du mix articles et cadence réelle (lot 6, #119). */
interface MixArticleVue {
  article: string
  qty: number
  palettes: number | null
  heures: number
  piecesParHeure: number | null
  cadenceGamme: number | null
}

interface Passe {
  nbPointages: number
  productionParJour: MailleProduction[]
  productionParSemaine: MailleProduction[]
  productionParMois: MailleProduction[]
  palettes: { parJour: PalettesMaille[]; parSemaine: PalettesMaille[]; parMois: PalettesMaille[] }
  heuresParMois: PasseMoisHeures[]
  /** Capacité calendaire (fériés/fermetures #37) par jour / semaine (lundi
   *  ISO) — servie par le loader, consommée telle quelle (revue #119, round 3). */
  capaciteParJour: { date: string; capacite: number }[]
  capaciteParSemaine: { date: string; capacite: number }[]
  /** OF terminés sur la fenêtre (lot 4, #119). */
  ofTermines: OfTermineVue[]
}

interface FiabiliteArticle {
  article: string
  qty: number
  heuresPointees: number
  heuresReglage: number
  heuresTheoriques: number
  ratio: number | null
}

interface AdherenceSemaine {
  semaine: string
  prevus: number
  pointes: number
}

interface AnalysesVue {
  fiabilite: {
    articles: FiabiliteArticle[]
    heuresPointees: number
    heuresTheoriques: number
    heuresReglage: number
    ratioGlobal: number | null
    exclusFauteCadence: number
  }
  adherence: AdherenceSemaine[]
  /** Mix articles et cadence réelle (lot 6, #119). */
  mix: MixArticleVue[]
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

/** Engagement restreint aux OF fermes — la seule population que ce cockpit
 *  mesure (WIPSTA=1). Le loader partagé conserve les planifiés/suggérés pour le
 *  séquenceur, mais ils ne doivent pas gonfler ce cockpit. */
type EngagementFerme = NonNullable<PostePayload['engagement']>

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
  const posteAnchor = useComboboxAnchor()
  const [selected, setSelected] = useState<string | null>(null)
  const [chosen, setChosen] = useState(false)
  const [posteQuery, setPosteQuery] = useState('')
  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [bump, setBump] = useState(0)
  // Maille/mesure remontées ici : le remontage par `key` au changement de poste
  // ne doit pas faire perdre le réglage d'affichage.
  const [maille, setMaille] = useState<MailleFil>('semaine')
  const [mesure, setMesure] = useState<Mesure>('h')
  /** Fenêtre du fil (zone 01). `undefined` = toute la période disponible. */
  const [periode, setPeriode] = useState<DayPickerRange | undefined>(undefined)

  // Un seul mécanisme de refresh : le bump ajoute ?refresh=1 aux fetches
  // (cache-bust serveur). Avant, un router.visit en doublon rechargeait la page
  // et laissait ?refresh=1 dans l'URL (tout reload futur forçait le refresh).
  // Séparateur décidé PAR URL (revue #119, round 2) : postesHref peut déjà
  // porter ?refresh=1 (navigation /cockpit?refresh=1) — les deux autres href
  // jamais. Un `q` unique dérivé de postesHref aurait collé `&refresh=1` sur
  // une URL sans `?` et cassé le paramètre de route (PP_093&refresh=1).
  const avecRefresh = (href: string) =>
    bump > 0 ? href + (href.includes('?') ? '&' : '?') + 'refresh=1' : href
  const postes = useTimedFetch<PostesPayload>(avecRefresh(props.postesHref))

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
    ? avecRefresh(`/api/v1/planning/cockpit/postes/${encodeURIComponent(effective)}`)
    : null
  const detail = useTimedFetch<PostePayload>(detailHref)

  // Écarts #95 + OF à solder : second fetch, volontairement découplé. Ces deux
  // familles interrogent X3 en direct ; le poste s'affiche sans les attendre.
  // Déclenché seulement quand le bandeau anomalies existe (réplique debout) :
  // sans lui rien ne s'affiche, inutile de réveiller X3.
  const usineHref =
    effective && detail.data?.anomalies
      ? avecRefresh(
          `/api/v1/planning/cockpit/postes/${encodeURIComponent(effective)}/anomalies-usine`
        )
      : null
  const usine = useTimedFetch<AnomaliesUsineVue>(usineHref)

  /* Engagement ferme remonté au niveau page : la faisabilité est l'action
     primaire de la rangée (zone 04), elle a besoin des mêmes lignes que la
     table qu'elle annote. Une seule dérivation, deux consommateurs. */
  const engagementFerme = useMemo<EngagementFerme | null>(() => {
    const eng = detail.data?.engagement
    if (!eng) return null
    const rows = eng.rows.filter((row) => row.status === 1)
    return {
      ...eng,
      count: rows.length,
      totalHours: rows.reduce((sum, row) => sum + row.hours, 0),
      rows,
    }
  }, [detail.data])

  /* Période couverte par la donnée du poste — le défaut de la fenêtre du fil.
     Calculée ici parce que le contrôle vit dans la rangée, plus dans la carte. */
  const fenetreFil = useMemo(() => {
    const passe = detail.data?.passe
    if (!passe) return undefined
    return fenetreDisponible(
      passe.productionParJour.map((p) => p.date),
      (engagementFerme?.rows ?? []).flatMap((r) => [r.dateDebutIso, r.livraisonIso])
    )
  }, [detail.data, engagementFerme])
  const periodeEffective = periode ?? fenetreFil

  /* Faisabilité matières — même contrat API que le séquenceur (#119 : reprise du
     bloc séquenceur sans dupliquer la logique). À la demande : le calcul est
     lourd, on ne le paie qu'à l'ouverture du cockpit d'un poste donné.
     Le résultat porte SON poste : l'état vit désormais au-dessus du remontage
     par `key`, et un verdict de PP_093 affiché sur PP_094 serait un mensonge. */
  const [feas, setFeas] = useState<{
    poste: string
    map: Record<string, FeasStatus>
    counts: { ok: number; blocked: number; qc: number }
  } | null>(null)
  const [feasLoading, setFeasLoading] = useState(false)
  const [feasError, setFeasError] = useState<string | null>(null)
  const posteCode = detail.data?.poste.code ?? null
  const feasActif = feas && posteCode && feas.poste === posteCode ? feas : null

  const runFeasibility = async () => {
    if (!posteCode || !engagementFerme || engagementFerme.rows.length === 0 || feasLoading) return
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
        workstation: posteCode,
      })
      setFeas({ poste: posteCode, map, counts: { ok: nbOk, blocked: nbBlocked, qc: nbQc } })
    } catch (e) {
      setFeasError((e as Error).message)
    } finally {
      setFeasLoading(false)
    }
  }

  const pick = (code: string) => {
    setChosen(true)
    setSelected(code)
    // La fenêtre du fil est propre au poste : la garder ferait regarder le
    // nouveau poste à travers les dates de l'ancien.
    setPeriode(undefined)
    setFeasError(null)
  }

  const refresh = () => {
    setBump((b) => b + 1)
    setFeas(null)
    setFeasError(null)
  }

  const replicaDown = postes.data ? !postes.data.replica.disponible : false

  /* Référence brute (pas de `?? []`) : un littéral en dépendance de useMemo
     change d'identité à chaque rendu et refiltre la liste pour rien. */
  const listePostes = postes.data?.postes
  const postesFiltres = useMemo(() => {
    const liste = listePostes ?? []
    const q = posteQuery.trim().toLowerCase()
    if (!q) return liste
    return liste.filter(
      (p) => p.code.toLowerCase().includes(q) || p.label.toLowerCase().includes(q)
    )
  }, [listePostes, posteQuery])

  /* ── Barre d'outils (standard §18) ───────────────────────────────────────
     Zone 01 portée : le poste, puis la fenêtre du fil. Zone 04 : actualiser
     puis l'action primaire. Pas de zone 02 (rien à filtrer) ni de zone 03 (le
     sélecteur de poste est cherchable, il EST l'interrogation de la page).
     Pas de `<Toolbar>` : la prop d'AppLayout en est déjà un. */
  const toolbar = (
    <>
      <ToolbarGroup>
        <div ref={posteAnchor}>
          <Combobox
            value={effective ?? ''}
            onValueChange={(v) => {
              const code = v ? String(v) : ''
              if (code) pick(code)
            }}
            onInputValueChange={setPosteQuery}
          >
            <ComboboxInput
              className="w-[260px]"
              aria-label="Poste"
              placeholder={postes.data ? 'Poste' : 'Chargement…'}
              disabled={!listePostes?.length}
            />
            <ComboboxContent anchor={posteAnchor}>
              <ComboboxList>
                {postesFiltres.length === 0 ? (
                  <ComboboxEmpty>Aucun poste ne correspond.</ComboboxEmpty>
                ) : (
                  postesFiltres.map((p) => (
                    <ComboboxItem key={p.code} value={p.code}>
                      <span className="font-mono text-xs font-semibold">{p.code}</span>
                      {p.label && p.label !== p.code && (
                        <span className="truncate text-muted-foreground">{p.label}</span>
                      )}
                    </ComboboxItem>
                  ))
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <ToolbarDateWindow
          value={periodeEffective}
          onCommit={setPeriode}
          disabled={!fenetreFil}
          title="Fenêtre du fil : périodes portées par l'axe du temps"
        />
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarRefresh
        loading={(postes.loading && !postes.data) || (detail.loading && !detail.data)}
        onClick={refresh}
        title="Rafraîchir (invalide le cache serveur)"
      />

      {/* Action primaire. Elle vivait dans l'en-tête de « Ce qui est engagé »,
          habillée du PILL maison de vision/toolbar — même geste que sur
          /programme et /sequenceur, trois dessins différents. */}
      <Pill
        variant="outline"
        className="gap-1.5"
        onClick={() => void runFeasibility()}
        disabled={feasLoading || !engagementFerme || engagementFerme.rows.length === 0}
        title="Couverture matières des OF engagés (même moteur que /programme)"
      >
        {feasLoading ? (
          <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <Wand2 size={14} strokeWidth={1.75} />
        )}
        {feasLoading ? 'Calcul…' : feasActif ? 'Recalculer' : 'Faisabilité'}
      </Pill>
    </>
  )

  return (
    <AppLayout
      title="Cockpit poste"
      active="cockpit"
      subtitle="Production constatée et engagement, poste par poste"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
      // Pas de `meta` : « N postes » ne bougeait d'aucun contrôle, et la
      // fenêtre est de la portée — elle est en zone 01, une seule fois.
    >
      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1` en dessous ne
          se dimensionnent contre rien. */}
      <div className="flex h-full min-h-0 flex-col">
        {/* Indisponibilité de la réplique : le passé constaté ne vient JAMAIS de la
            voie directe, on l'affiche au lieu de le calculer en douce. Ton
            `suggere` : c'est une dégradation, pas une erreur — et le brand est
            la couleur des actions de la rangée, pas celle d'un état. */}
        {replicaDown && postes.data && (
          <div className="flex flex-none items-center gap-2 border-b border-suggere/30 bg-suggere/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-suggere" />
            <span className="font-semibold">Passé productif indisponible :</span>
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
            // des cartes (tooltips du fil, familles dépliées) repart de zéro au
            // lieu de survivre à l'ancien poste.
            key={detail.data.poste.code}
            payload={detail.data}
            engagementFerme={engagementFerme}
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
            periode={periodeEffective}
            feasMap={feasActif?.map ?? null}
            feasCounts={feasActif?.counts ?? { ok: 0, blocked: 0, qc: 0 }}
            feasError={feasError}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
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
  engagementFerme: EngagementFerme | null
  usine: AnomaliesUsineVue | null
  usineLoading: boolean
  onSelectOf: (numOf: string) => void
  maille: MailleFil
  onMaille: (m: MailleFil) => void
  mesure: Mesure
  onMesure: (m: Mesure) => void
  periode: DayPickerRange | undefined
  feasMap: Record<string, FeasStatus> | null
  feasCounts: { ok: number; blocked: number; qc: number }
  feasError: string | null
}) {
  const { poste, passe, anomalies, analyses, x3Error } = props.payload
  const { engagementFerme } = props
  const loadError = x3Error ?? props.payload.engagement?.x3Error ?? null
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

  return (
    <div className="min-h-0 flex-1 animate-in overflow-auto fade-in-0 duration-200 motion-reduce:animate-none">
      {/* Identité du poste — une ligne, les 3 champs non exposés dits une fois. */}
      <div className="flex flex-none flex-wrap items-center gap-x-5 gap-y-2 border-b border-border bg-secondary px-5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[15px] font-bold text-foreground">{poste.code}</span>
          {poste.label && poste.label !== poste.code && (
            <span className="text-[13px] font-medium text-muted-foreground">{poste.label}</span>
          )}
        </div>
        {poste.atelierLabel && (
          <span className="text-xs font-medium text-muted-foreground">{poste.atelierLabel}</span>
        )}

        {poste.capaciteHebdoHeures != null && (
          <div className="flex items-baseline gap-1">
            <span className="text-[15px] font-bold tabular-nums text-foreground">
              {fmtHs(poste.capaciteHebdoHeures)}
            </span>
            <span className="font-mono text-2xs font-semibold text-muted-foreground">h/sem</span>
          </div>
        )}

        <div className="flex items-center gap-1" title={regimeTitle} aria-label={regimeTitle}>
          {regimeNet && (
            <span className="mr-1 font-mono text-3xs font-semibold text-muted-foreground">net</span>
          )}
          {regimeNet?.map((h, i) => (
            <div key={i} className="flex flex-col items-center">
              <span
                className={cn(
                  'font-mono text-2xs font-semibold tabular-nums',
                  h > 0 ? 'text-foreground' : 'text-muted-foreground/50'
                )}
              >
                {h > 0 ? fmtHs(h) : '·'}
              </span>
              <span className="font-mono text-3xs text-muted-foreground/60">{JOURS[i]}</span>
            </div>
          ))}
        </div>

        <div
          className="flex items-baseline gap-1.5"
          title="Dernier pointage dans la fenêtre"
          aria-label="Dernier pointage dans la fenêtre"
        >
          <span className="text-1.5xs font-medium text-muted-foreground">Dernier pointage</span>
          <span className="font-mono text-xs font-bold tabular-nums text-foreground">
            {dateLong(poste.dernierPointageIso)}
          </span>
        </div>

        <div className="flex-1" />

        <span
          className="cursor-help border-b border-dotted border-input text-2xs text-muted-foreground"
          title="Nature du poste, efficience et nombre de postes ne sont pas exposés par le loader (spec lot 3). Ils apparaîtront ici une fois branchés."
          aria-label="3 champs X3 non exposés : nature du poste, efficience et nombre de postes"
        >
          3 champs X3 non exposés
        </span>
      </div>

      {loadError && (
        <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
          <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
          <span className="font-semibold">Erreur chargement :</span>
          <span className="font-mono">{loadError}</span>
        </div>
      )}

      {/* LE FIL — passé constaté + futur engagé sur un seul axe (design V3). */}
      {filProps && (
        <div className="px-5 py-4">
          <LeFil
            {...filProps}
            maille={props.maille}
            onMaille={props.onMaille}
            // Palettes désactivées sans coefficient sur la fenêtre : on replie
            // l'affichage sur les heures plutôt que de montrer des trous.
            mesure={props.mesure === 'pal' && !filProps.palettesDisponibles ? 'h' : props.mesure}
            onMesure={props.onMesure}
            periode={props.periode}
          />
        </div>
      )}

      {/* Engagement — table dense avec semaines et total. */}
      <div className="px-5 pb-4">
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[15px] font-bold tracking-tight text-foreground">
            Ce qui est engagé
          </h2>
          {engagementFerme && (
            <span className="font-mono text-2xs text-muted-foreground">
              {engagementFerme.count} OF fermes · {fmtHs(engagementFerme.totalHours)} h
            </span>
          )}
        </div>

        {props.feasError && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-1.5xs text-foreground">
            <TriangleAlert size={14} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Faisabilité :</span>
            <span className="font-mono">{props.feasError}</span>
          </div>
        )}

        {!engagementFerme || engagementFerme.rows.length === 0 ? (
          <div className="rounded-lg border border-rule bg-card p-6 text-center text-[13px] text-muted-foreground">
            Aucun OF engagé sur ce poste.
          </div>
        ) : (
          <EngagementTable
            rows={engagementFerme.rows}
            feasMap={props.feasMap}
            feasCounts={props.feasCounts}
            capaciteHebdoHeures={poste.capaciteHebdoHeures}
            regimeHebdo={poste.regimeHebdo}
            onSelectOf={props.onSelectOf}
          />
        )}
      </div>

      {/* La dette du poste — 7 familles du domaine. */}
      {passe && anomalies && (
        <div className="border-t border-border px-5 py-4">
          <DettePoste
            anomalies={anomalies}
            usine={props.usine}
            usineLoading={props.usineLoading}
            onSelectOf={props.onSelectOf}
          />
        </div>
      )}

      {/* OF terminés sur la fenêtre — lot 4 (#119) : pointés ici, plus en
          cours. La date de sortie est approchée par le dernier pointage. */}
      {passe && passe.ofTermines.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[15px] font-bold tracking-tight text-foreground">
              OF terminés sur la fenêtre
            </h2>
            <span className="font-mono text-2xs text-muted-foreground">
              {passe.ofTermines.length} OF · sortie approchée par le dernier pointage
            </span>
          </div>
          <OfTerminesTable ofTermines={passe.ofTermines} />
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
): Omit<LeFilProps, 'maille' | 'onMaille' | 'mesure' | 'onMesure' | 'periode'> {
  const palJ = new Map(passe.palettes.parJour.map((p) => [p.date, p.palettes]))
  const palS = new Map(passe.palettes.parSemaine.map((p) => [p.date, p.palettes]))
  const palM = new Map(passe.palettes.parMois.map((p) => [p.date, p.palettes]))

  // Capacité calendaire par maille, servie telle quelle au fil (revue #119,
  // round 3) : le loader a déjà appliqué fériés/fermetures (#37).
  const capaciteParMaille: LeFilProps['capaciteParMaille'] = {
    jour: new Map(passe.capaciteParJour.map((c) => [c.date, c.capacite])),
    semaine: new Map(passe.capaciteParSemaine.map((c) => [c.date, c.capacite])),
    mois: new Map(passe.heuresParMois.map((m) => [m.mois, m.capacite])),
  }
  // La mesure « Palettes » n'est proposée que si au moins une maille de la
  // fenêtre porte un coefficient (critère d'acceptation #119).
  const palettesDisponibles = [
    passe.palettes.parJour,
    passe.palettes.parSemaine,
    passe.palettes.parMois,
  ].some((arr) => arr.some((p) => p.palettes !== null))

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
  // Capacité CALENDAIRE servie par le loader (fériés/fermetures #37) — la
  // fenêtre 6 mois traverse la fermeture d'août, une capacité à plat
  // (nb semaines × capHebdo) la surévaluait et faussait le verdict
  // « sous-employé » (revue #119, round 3).
  const capTotale = passe.heuresParMois.reduce((a, m) => a + m.capacite, 0)
  const sat = capTotale > 0 ? totalH / capTotale : null
  const vSat =
    sat !== null
      ? verdictPour(VERDICTS.saturation, sat)
      : { txt: 'Capacité inconnue', cls: 'mute' as const }
  const capSemaine = new Map(passe.capaciteParSemaine.map((c) => [c.date, c.capacite]))
  const semOver = passe.productionParSemaine.filter((p) => {
    const cap = capSemaine.get(p.date) ?? capHebdo
    return cap > 0 && p.heures > cap
  }).length

  const hP = analyses?.fiabilite.heuresPointees ?? 0
  const hT = analyses?.fiabilite.heuresTheoriques ?? 0
  // Le ratio affiché vient du domaine (pointé / théorique) — plus de calcul
  // local en doublon avec une définition qui aurait pu diverger (revue #119).
  const fia = analyses?.fiabilite.ratioGlobal ?? null
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
    capaciteParMaille,
    palettesDisponibles,
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
        // La charge de /programme est sous-estimée si la ligne est plus lente
        // que sa gamme (> 1), sur-estimée si plus rapide (< 1) — la phrase
        // suit le sens du ratio (revue #119, round 3).
        sub: `${fmtHs(hP)} h opératoires pointées pour ${fmtHs(hT)} h de gamme${analyses?.fiabilite.heuresReglage ? ` · ${fmtHs(analyses.fiabilite.heuresReglage)} h de réglage, non comparées` : ''}${analyses?.fiabilite.exclusFauteCadence ? ` · ${analyses.fiabilite.exclusFauteCadence} article(s) sans cadence, exclus` : ''} · ${
          fia === null
            ? 'gamme non mesurable'
            : fia > 1
              ? "la charge de /programme est sous-estimée d'autant"
              : fia < 1
                ? "la charge de /programme est sur-estimée d'autant"
                : 'la cadence déclarée est tenue'
        }`,
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

/** Tableau des OF terminés sur la fenêtre (lot 4, #119). Plafonné en hauteur,
 *  même convention que les cartes d'anomalies. */
function OfTerminesTable({ ofTermines }: { ofTermines: OfTermineVue[] }) {
  return (
    <div className="max-h-[240px] overflow-auto rounded-lg border border-rule bg-card shadow-float">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-secondary">
          <TableHeadRow>
            <TableHead>OF</TableHead>
            <TableHead>Article</TableHead>
            {/* `text-right!` : sous cursor, `.theme-cursor table th` pose
                `text-align: left` à une spécificité qu'une classe seule
                n'atteint pas (cf. ui/table-row). */}
            <TableHead align="right" className="text-right!">
              Qté
            </TableHead>
            <TableHead align="right" className="text-right!">
              Palettes
            </TableHead>
            <TableHead align="right" className="text-right!">
              Heures
            </TableHead>
            <TableHead>Dernier pointage</TableHead>
          </TableHeadRow>
        </thead>
        <tbody>
          {ofTermines.map((t) => (
            <TableRow key={t.numOf}>
              <TableCell>
                <CellStack code={t.numOf} />
              </TableCell>
              <TableCell>
                <CellStack code={t.article} label={t.designation} />
              </TableCell>
              <TableCell align="right">
                <CellNumber value={t.qty.toLocaleString('fr-FR')} />
              </TableCell>
              <TableCell align="right">
                {/* null = absence de coefficient — jamais « 0 palette » (#119). */}
                <CellNumber value={t.palettes !== null ? fmtNombre(t.palettes) : '—'} />
              </TableCell>
              <TableCell align="right">
                <CellNumber value={`${fmtHs(t.heures)} h`} />
              </TableCell>
              <TableCell>
                <CellDate date={dateLong(t.dernierJourIso)} />
              </TableCell>
            </TableRow>
          ))}
        </tbody>
      </table>
    </div>
  )
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
        <div className="flex items-center gap-3 border-b border-rule bg-secondary px-4 py-1.5 font-mono text-2xs font-semibold">
          <span className="text-ferme">{feasCounts.ok} faisables</span>
          {feasCounts.qc > 0 && <span className="text-suggere">{feasCounts.qc} sous CQ</span>}
          {feasCounts.blocked > 0 && (
            <span className="text-destructive">{feasCounts.blocked} bloqués</span>
          )}
        </div>
      )}
      <div className="max-h-[320px] overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-secondary">
            <TableHeadRow>
              <TableHead>Sem.</TableHead>
              <TableHead>OF</TableHead>
              <TableHead>Article</TableHead>
              <TableHead>Fenêtre</TableHead>
              <TableHead align="right" className="text-right!">
                Heures
              </TableHead>
              <TableHead>Faisabilité</TableHead>
              <TableHead align="right" className="text-right!" />
            </TableHeadRow>
          </thead>
          <tbody>
            {rows.map((r) => {
              const sem = r.dateDebutIso ? semaineISO(lundiIso(r.dateDebutIso)) : '—'
              const feas = feasMap?.[r.numOf] ?? null
              return (
                <TableRow
                  key={r.numOf}
                  // La faisabilité est LA gravité de la ligne : elle se lit sur
                  // le bord gauche avant même d'arriver à sa colonne.
                  tone={feas?.st === 'blocked' ? 'critical' : feas?.st === 'qc' ? 'warning' : null}
                >
                  <TableCell>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-3xs font-bold text-muted-foreground">
                      {sem}
                    </span>
                  </TableCell>
                  <TableCell>
                    {/* Hit-area ≥ 44 px (WCAG 2.5.5) — le texte reste compact, un
                        pseudo-élément étend la zone de tap sans changer le rendu. */}
                    <CellStack
                      code={
                        <button
                          type="button"
                          className="relative cursor-pointer py-[3px] text-brand underline decoration-dotted decoration-brand/40 underline-offset-2 before:absolute before:-inset-x-1 before:-inset-y-[8px] before:content-[''] hover:text-brand/70"
                          onClick={() => onSelectOf(r.numOf)}
                        >
                          {r.numOf}
                        </button>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <CellStack code={r.article} />
                  </TableCell>
                  <TableCell>
                    <CellDate
                      date={`${fmtDateFr(r.dateDebutIso)} → ${fmtDateFr(r.livraisonIso)}`}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <CellNumber value={`${fmtHs(r.hours)} h`} />
                  </TableCell>
                  <TableCell>
                    {feas ? (
                      <CellVerdict
                        icon={
                          feas.st === 'ok'
                            ? CircleCheck
                            : feas.st === 'qc'
                              ? FlaskConical
                              : OctagonX
                        }
                        label={
                          feas.st === 'ok' ? 'faisable' : feas.st === 'qc' ? 'sous CQ' : 'bloqué'
                        }
                        tone={
                          feas.st === 'ok'
                            ? 'text-ferme'
                            : feas.st === 'qc'
                              ? 'text-suggere'
                              : 'text-destructive'
                        }
                        title={
                          feas.st === 'blocked'
                            ? `Composants manquants : ${feas.missing.join(', ') || '—'}`
                            : feas.st === 'qc'
                              ? `Couvert grâce au stock sous contrôle qualité : ${Object.keys(feas.qcComponents ?? {}).join(', ')}`
                              : 'Faisable'
                        }
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <X3Link
                      fonction="GESMFG"
                      cle={r.numOf}
                      iconOnly
                      title={`Ouvrir ${r.numOf} dans Sage X3`}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-rule bg-secondary font-mono text-1.5xs font-bold">
              <TableCell colSpan={4}>Total engagé</TableCell>
              <TableCell align="right">
                <CellNumber value={`${fmtHs(totHrs)} h`} />
              </TableCell>
              <TableCell className="text-muted-foreground" colSpan={2}>
                {joursEquivalents !== null && semainesEquivalentes !== null
                  ? `${fmtNombre(joursEquivalents)} j ouvrés équiv. · ${fmtNombre(semainesEquivalentes)} sem. de capacité · base ${fmtHs(capaciteJourMoy ?? 0)} h/j`
                  : 'Équivalent capacité indisponible'}
              </TableCell>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

/** Analyses V3 : écart de cadence par article (axe 0,75→1,25) + adhérence. */
function AnalysesSection({ analyses }: { analyses: AnalysesVue }) {
  const { fiabilite, adherence, mix } = analyses
  const MIN = 0.75
  const MAX = 1.25
  const pos = (r: number) => ((Math.min(MAX, Math.max(MIN, r)) - MIN) / (MAX - MIN)) * 100
  const z = pos(1)

  const couleur = (r: number) =>
    r > 1.1
      ? 'var(--color-destructive)'
      : r > 1.02
        ? 'var(--color-suggere)'
        : r < 0.9
          ? 'var(--color-planifie)'
          : 'var(--color-ferme)'

  const maxAdh = Math.max(1, ...adherence.map((a) => Math.max(a.prevus, a.pointes)))

  return (
    <div className="border-t border-border px-5 py-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-bold tracking-tight text-foreground">
          Ce que ça dit des gammes
        </h2>
        <span className="font-mono text-2xs text-muted-foreground">
          affichage seul · aucune écriture vers X3
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        {/* Écart de cadence par article — pointé ÷ gamme. */}
        <div className="rounded-lg border border-rule bg-card p-4 shadow-float">
          <h3 className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
            Écart de cadence par article · pointé ÷ gamme
          </h3>
          {/* Axe aligné sur les colonnes des lignes de données (article, qty,
              barre, valeur) — pas de px en dur, responsive par construction. */}
          <div className="mt-2 flex items-center gap-2.5 font-mono text-4xs font-semibold text-muted-foreground">
            <span className="w-[84px] shrink-0" />
            <span className="w-[62px] shrink-0" />
            <span className="flex min-w-0 flex-1 justify-between">
              <span>0,75×</span>
              <span>1,00×</span>
              <span>1,25×</span>
            </span>
            <span className="w-[52px] shrink-0" />
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {fiabilite.articles.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                Aucune production avec cadence de gamme.
              </div>
            ) : (
              fiabilite.articles.slice(0, 6).map((a) => {
                const r = a.ratio
                if (r === null) return null
                const p = pos(r)
                const gauche = Math.min(p, z)
                const largeur = Math.max(1.5, Math.abs(p - z))
                return (
                  <div key={a.article} className="flex items-center gap-2.5 text-2xs">
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
          <p className="mt-3 text-2xs leading-snug text-muted-foreground">
            Un article à droite de 1,00× consomme plus d'heures que sa gamme n'en prévoit :{' '}
            <b>la charge calculée sur /programme et /charge est sous-estimée d'autant</b>. Seul
            endroit de l'app où l'écart se constate.
            {fiabilite.exclusFauteCadence > 0 &&
              ` ${fiabilite.exclusFauteCadence} article(s) sans cadence exploitable, exclus.`}
          </p>
        </div>

        {/* Adhérence au programme. */}
        <div className="rounded-lg border border-rule bg-card p-4 shadow-float">
          <h3 className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
            Adhérence au programme
          </h3>
          {adherence.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Pas de semaine complète dans la fenêtre.
            </div>
          ) : (
            <>
              <div className="mt-3 flex h-11 items-end gap-1">
                {adherence.map((s) => {
                  const hPrevu = (s.prevus / maxAdh) * 100
                  const hPointe = (s.pointes / maxAdh) * 100
                  return (
                    <div
                      key={s.semaine}
                      className="group relative flex flex-1 items-end justify-center gap-[2px]"
                    >
                      <div
                        className="w-1/3 rounded-t-[3px] bg-planifie opacity-40"
                        style={{ height: `${Math.max(4, hPrevu)}%` }}
                        title={`${s.prevus} prévu(s)`}
                      />
                      <div
                        className="w-1/3 rounded-t-[3px] bg-ferme"
                        style={{ height: `${Math.max(4, hPointe)}%` }}
                        title={`${s.pointes} pointé(s)`}
                      />
                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-3xs font-semibold text-background group-hover:block">
                        {semaineLabel(s.semaine)} · {s.pointes} pointés / {s.prevus} prévus
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-1 font-mono text-4xs font-semibold text-muted-foreground">
                {adherence.map((s) => (
                  <span key={s.semaine} className="flex-1 text-center">
                    {s.semaine.slice(5).replace('-', '/')}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex justify-between gap-2 text-2xs">
                <span className="text-muted-foreground">Dernière semaine</span>
                <span className="font-bold">
                  {adherence[adherence.length - 1].pointes} pointés /{' '}
                  {adherence[adherence.length - 1].prevus} prévus
                </span>
              </div>
              <div className="flex justify-between gap-2 text-2xs">
                <span className="text-muted-foreground">Total fenêtre</span>
                <span className="font-bold">
                  {adherence.reduce((a, s) => a + s.pointes, 0)} pointés /{' '}
                  {adherence.reduce((a, s) => a + s.prevus, 0)} prévus
                </span>
              </div>
              <p className="mt-3 text-2xs leading-snug text-muted-foreground">
                Barre claire : OF ouverts du poste dont le lancement tombe la semaine (ORDERS).
                Barre pleine : OF distincts ayant pointé ici cette semaine. Pas de pourcentage :
                ORDERS ne garde pas les OF soldés, un taux mélangerait des populations différentes.{' '}
                {adherence.length} semaines récentes seulement.
              </p>
            </>
          )}
        </div>

        {/* Mix articles et cadence réelle — lot 6 (#119). */}
        <div className="mt-4 rounded-lg border border-rule bg-card p-4 shadow-float xl:col-span-2">
          <h3 className="text-3xs font-bold uppercase tracking-wider text-muted-foreground">
            Mix articles · cadence constatée vs gamme
          </h3>
          {mix.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              Aucune production quantifiée sur la fenêtre.
            </div>
          ) : (
            <div className="mt-2 max-h-[240px] overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-secondary">
                  <TableHeadRow>
                    <TableHead>Article</TableHead>
                    <TableHead align="right" className="text-right!">
                      Qté
                    </TableHead>
                    <TableHead align="right" className="text-right!">
                      Palettes
                    </TableHead>
                    <TableHead align="right" className="text-right!">
                      Heures op.
                    </TableHead>
                    <TableHead align="right" className="text-right!">
                      Pièces/h constatées
                    </TableHead>
                    <TableHead align="right" className="text-right!">
                      Cadence gamme
                    </TableHead>
                  </TableHeadRow>
                </thead>
                <tbody>
                  {mix.map((m) => (
                    <TableRow key={m.article}>
                      <TableCell>
                        <CellStack code={m.article} />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber value={m.qty.toLocaleString('fr-FR')} />
                      </TableCell>
                      <TableCell align="right">
                        {/* null = absence de coefficient, jamais « 0 palette ». */}
                        <CellNumber value={m.palettes !== null ? fmtNombre(m.palettes) : '—'} />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber value={`${fmtHs(m.heures)} h`} />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber
                          value={m.piecesParHeure !== null ? fmtNombre(m.piecesParHeure) : '—'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <CellNumber
                          value={m.cadenceGamme !== null ? fmtNombre(m.cadenceGamme) : '—'}
                          emphasis="plain"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-2xs leading-snug text-muted-foreground">
            Cadence constatée = pièces pointées / heures opératoires. Affichage seul en v1 — aucune
            boucle de retour vers la charge.
          </p>
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

/** fmtH sans le « ,00 » des entiers — 40 h au lieu de 40,00 h. */
const fmtHs = (h: number) => fmtH(h).replace(/,00$/, '')
const fmtNombre = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
