import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarClock, Loader2, Package, TriangleAlert } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import { cn } from '@r/lib/utils'
import {
  CellDate,
  CellNumber,
  CellStack,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
  type RowTone,
} from '@r/components/ui/table-row'
import { Badge } from '@r/components/ui/badge'
import { Card } from '@r/components/ui/card'

/**
 * Étiquette de période dans la grille time-phased. Trois recettes de pastille
 * étaient écrites à la main (retard / message / pénurie) avec trois palettes
 * codées en dur (#c13515, sky-100, blanc sur rouge plein).
 */
function GrilleTag({
  tone,
  children,
}: {
  tone: Exclude<RowTone, null>
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'rounded px-1 py-0.5 font-mono text-3xs font-bold uppercase tracking-wide',
        tone === 'critical' && 'bg-destructive/15 text-destructive',
        tone === 'warning' && 'bg-suggere/15 text-suggere',
        tone === 'info' && 'bg-planifie/15 text-planifie',
        tone === 'ok' && 'bg-ferme/15 text-ferme'
      )}
    >
      {children}
    </span>
  )
}

/** Shape exact de `GET /api/v1/appro/article-explanation` (tickets 02 + 05). */
interface GrillePeriode {
  index: number
  label: string
  dateDebut: string | null
  dateFin: string | null
  stockDebut: number
  stockFin: number
  demande: number
  besoinMatiere: number
  reception: number
  of: number
  estPenurie: boolean
  estRetard: boolean
  contientMessage: boolean
}

interface LigneMessage {
  vcrnum: string
  vcrlin: number
  vcrseq: string
  article: string
  designation: string
  quantite: number
  echeance: string | null
  mrpdat: string | null
  mrpdatRaw: string | null
  message: number
  vcrnumori: string | null
}

interface PeggingParent {
  article: string
  of: string
  quantite: number
  echeance: string | null
}

interface DiffEntree {
  source: string
  detail: string
  jour: string
}

interface DiffTemporel {
  depuis: string | null
  entrees: DiffEntree[]
}

interface ExplanationSuccess {
  supporte: true
  article: string
  designation: string
  grille: {
    periodes: GrillePeriode[]
    ligneMessage: LigneMessage
    mrpdatCbn: string | null
    premierePenurie: string | null
    premierePenurieIndex: number | null
  }
  pegging: {
    parents: PeggingParent[]
    suggestionOrigine: { numero: string; convertieLe: string | null } | null
  }
  diff: DiffTemporel
}

interface ExplanationRefus {
  supporte: false
  raison: string
  // Diff présent même en refus (depuis peut être null), mais entrees vide — ticket 05.
  diff?: DiffTemporel
  article?: string
  cle?: string
}

type ExplanationResult = ExplanationSuccess | ExplanationRefus

const fr = (iso: string | null): string => {
  if (iso === null || iso === '') return '—'
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : '—'
}

const fmtJjMm = (iso: string | null): string => {
  if (!iso) return '—'
  const [, mm, dd] = iso.split('-')
  return mm && dd ? `${dd}/${mm}` : iso
}

const fmtQte = (n: number): string => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })

const SOURCE_LABEL: Record<string, string> = {
  stock: 'stock',
  demande_ferme: 'demande ferme',
  demande_prevision: 'demande prévision',
  appro: 'appro',
  of_ferme: 'OF ferme',
  besoin_matiere: 'besoin matière',
}

function labelSource(source: string): string {
  return SOURCE_LABEL[source] ?? source
}

function useExplanation(article: string | null, cle: string | null, enabled: boolean) {
  const [data, setData] = useState<ExplanationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !article || !cle) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    fetch(
      `/api/v1/appro/article-explanation?article=${encodeURIComponent(article)}&cle=${encodeURIComponent(cle)}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
            raison?: string
          } | null
          // Le serveur rend {supporte:false, raison} en 200, pas en erreur — mais un 404/400 reste possible.
          if (body && 'raison' in (body as Record<string, unknown>)) {
            return body as unknown as ExplanationRefus
          }
          throw new Error(body?.error ?? `HTTP ${res.status}`)
        }
        return (await res.json()) as ExplanationResult
      })
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Échec du chargement')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [article, cle, enabled])

  return { data, loading, error }
}

interface Props {
  article: string | null
  cle: string | null
  /** Code MRPMES_0 de la ligne cliquée — 2 = avancer, 3/6 = hors périmètre. */
  messageCode: number | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

/**
 * Drawer d'explication CBN — question A primaire (ticket 03) + diff temporel (ticket 05).
 *
 * Pattern Sheet dédié (PAS StockArticleSheet — celui-ci rend le KPI Stock).
 * Clic « avancer » → grille time-phased + pegging natif WIPTYP=6 + section diff
 * « Depuis l'apparition du message (JJ/MM) : » (ticket 05, Q14 cache journalier).
 * Clic 3/6 → refus explicite hors périmètre V1, jamais une grille lue à l'envers.
 */
export function ArticleExplanationSheet({ article, cle, messageCode, open, onOpenChange }: Props) {
  const isHorsPerimetre = messageCode === 3 || messageCode === 6
  const shouldFetch = open && article !== null && cle !== null && !isHorsPerimetre
  const { data, loading, error } = useExplanation(article, cle, shouldFetch)

  // Titre accessible
  const titleLabel = useMemo(() => {
    if (article === null) return 'Explication CBN'
    return `Explication — ${article}`
  }, [article])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:w-[560px] sm:max-w-[560px] [&>button]:top-3 [&>button]:right-3"
      >
        <SheetHeader className="shrink-0 border-b border-border bg-card px-5 py-4 pr-10">
          <div className="flex items-center gap-2">
            <Package size={16} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
            <SheetTitle className="truncate text-sm font-semibold tracking-tight">
              {titleLabel}
            </SheetTitle>
          </div>
          {article && (
            <SheetDescription className="text-left text-xs text-muted-foreground">
              Grille time-phased telle que le CBN vient de la calculer — présentation des lignes
              ORDERS bucketisées, pas de recalcul MRP.
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Hors périmètre V1 — rendu SANS appel réseau, message explicite. */}
          {isHorsPerimetre ? (
            <div className="mx-4 mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-900">
                  Explication non disponible pour ce type de message — hors périmètre V1
                </p>
                <p className="text-xs leading-snug text-amber-800">
                  Le module V1 n’explique que les messages « avancer » (MRPMES_0 = 2). Les messages
                  « retarder » (3) et « inutile » (6) demanderaient une autre lecture de la grille
                  et sont différés. Aucune grille n’est interprétée à l’envers.
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center gap-3 px-5 py-16">
              <Loader2 size={22} className="animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Lecture de l’équation CBN…</span>
            </div>
          ) : error !== null ? (
            <div className="mx-4 mt-4 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-destructive">Chargement impossible</p>
                <p className="break-all text-xs text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : data !== null && data.supporte === false ? (
            <>
              <div className="mx-4 mt-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Explication non disponible pour ce type de message — hors périmètre V1
                  </p>
                  <p className="text-xs leading-snug text-amber-800">{data.raison}</p>
                </div>
              </div>
              {data.diff ? <DiffSection diff={data.diff} /> : null}
            </>
          ) : data !== null && data.supporte === true ? (
            <>
              <SuccessContent data={data} />
              <DiffSection diff={data.diff} />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-5 py-16 text-muted-foreground">
              <CalendarClock size={22} strokeWidth={1.5} />
              <span className="text-sm">Sélectionnez une ligne « avancer » dans la file.</span>
            </div>
          )}

          {/* Fallback vide quand aucun diff n'est affichable (état initial sans données).
              DiffSection porte déjà data-slot quand il y a un diff ; ce fallback n'existe
              que quand data === null pour garder un seul data-slot dans le DOM (empty:hidden). */}
          {data === null && !loading && error === null && !isHorsPerimetre ? (
            <div
              data-slot="explanation-diff"
              className="border-t border-dashed border-border bg-secondary/30 px-5 py-4 empty:hidden"
            />
          ) : null}
        </div>

        {/* Pied discret — étalon rappelé même hors scroll. */}
        {data !== null && data.supporte === true && data.grille.mrpdatCbn && (
          <div className="shrink-0 border-t border-border bg-secondary/50 px-5 py-2">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Étalon CBN :{' '}
              <span className="font-semibold text-foreground">{fr(data.grille.mrpdatCbn)}</span>{' '}
              (MRPDAT_0 — date que le CBN réclame). Première pénurie :{' '}
              <span className="font-semibold text-foreground">
                {data.grille.premierePenurie ?? '—'}
              </span>
              .
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DiffSection({ diff }: { diff: DiffTemporel }) {
  const depuisJjMm = fmtJjMm(diff.depuis)
  return (
    <div
      data-slot="explanation-diff"
      className="border-t border-dashed border-border bg-secondary/30 px-5 py-4"
      // DiffSection n'est jamais vide visuellement (titre + message ou liste) —
      // empty:hidden inutile ici, réservé au fallback vide ci-dessus.
    >
      <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Depuis l&apos;apparition du message ({depuisJjMm}) :
      </h3>
      {diff.entrees.length === 0 ? (
        <p className="text-xs leading-snug text-muted-foreground">
          aucune entrée terrain n&apos;a bougé depuis l&apos;apparition
        </p>
      ) : (
        <ul className="space-y-1.5">
          {diff.entrees.map((e, i) => (
            <li
              key={`${e.source}-${e.jour}-${e.detail.slice(0, 24)}-${i}`}
              className="flex gap-2 text-xs"
            >
              <span className="inline-flex h-5 shrink-0 items-center rounded bg-secondary px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {labelSource(e.source)}
              </span>
              <span className="leading-5 text-foreground">{e.detail}</span>
              <span className="ml-auto whitespace-nowrap font-mono leading-5 text-[11px] tabular-nums text-muted-foreground">
                {fr(e.jour)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SuccessContent({ data }: { data: ExplanationSuccess }) {
  const { grille, pegging } = data
  const premierePenurieIdx = grille.premierePenurieIndex

  return (
    <div className="space-y-5 px-5 py-4">
      {/* En-tête ligne du message */}
      <Card className="gap-0 px-3 py-2.5 hover:shadow-none">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <CellStack
            code={grille.ligneMessage.vcrnum}
            label={`ligne ${grille.ligneMessage.vcrlin}${grille.ligneMessage.vcrseq ? ` · séq. ${grille.ligneMessage.vcrseq}` : ''}`}
          />
          <CellNumber value={fmtQte(grille.ligneMessage.quantite)} />
          <CellDate date={fr(grille.ligneMessage.echeance)} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
          <Badge variant="destructive">Avancer</Badge>
          <span className="text-muted-foreground">
            MRPDAT_0 :{' '}
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {fr(grille.mrpdatCbn)}
            </span>
          </span>
          {grille.premierePenurie && (
            <span className="text-muted-foreground">
              · pénurie :{' '}
              <span className="font-mono font-semibold tabular-nums text-destructive">
                {grille.premierePenurie}
              </span>
            </span>
          )}
        </div>
      </Card>

      {/* Grille time-phased */}
      <section>
        <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Grille time-phased
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-left text-xs">
            <caption className="sr-only">Grille time-phased de l’article</caption>
            <thead>
              <TableHeadRow className="bg-secondary/50">
                <TableHead>Période</TableHead>
                <TableHead align="right" className="text-right!">
                  Stock début
                </TableHead>
                <TableHead align="right" className="text-right!">
                  Demande
                </TableHead>
                <TableHead align="right" className="text-right!">
                  Besoin mat.
                </TableHead>
                <TableHead align="right" className="text-right!">
                  Réception
                </TableHead>
                <TableHead align="right" className="text-right!">
                  OF
                </TableHead>
                <TableHead align="right" className="text-right!">
                  Stock fin
                </TableHead>
              </TableHeadRow>
            </thead>
            <tbody>
              {grille.periodes.map((p) => {
                const isPenurie = premierePenurieIdx !== null && p.index === premierePenurieIdx
                const isMessage = p.contientMessage
                return (
                  // Trois fonds de ligne concurrents (pénurie, message, et leur
                  // combinaison) coloraient jusqu'à la moitié de la grille. La
                  // rupture passe en barre de bord ; le message garde son badge,
                  // qui le disait déjà.
                  <TableRow key={p.index} tone={p.estPenurie ? 'critical' : null}>
                    <TableCell className="whitespace-nowrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1',
                          (p.estRetard || isPenurie) && 'font-bold text-destructive',
                          isMessage && !isPenurie && 'font-semibold text-planifie'
                        )}
                      >
                        {p.label}
                        {p.estRetard && <GrilleTag tone="critical">retard</GrilleTag>}
                        {isMessage && <GrilleTag tone="info">message</GrilleTag>}
                        {isPenurie && <GrilleTag tone="critical">pénurie</GrilleTag>}
                      </span>
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber
                        value={fmtQte(p.stockDebut)}
                        emphasis="plain"
                        tone={p.stockDebut < 0 ? 'critical' : null}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={p.demande ? fmtQte(-p.demande) : '—'} emphasis="plain" />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber
                        value={p.besoinMatiere ? fmtQte(-p.besoinMatiere) : '—'}
                        emphasis="plain"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber
                        value={p.reception ? fmtQte(p.reception) : '—'}
                        emphasis="plain"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={p.of ? fmtQte(p.of) : '—'} emphasis="plain" />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber
                        value={fmtQte(p.stockFin)}
                        tone={p.stockFin < 0 ? 'critical' : null}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">
          Lecture des lignes ORDERS bucketisées — la période où le stock passe négatif est
          surlignée, la période du message aussi. Étalon : MRPDAT_0 = {fr(grille.mrpdatCbn)}.
        </p>
      </section>

      {/* Pegging natif WIPTYP=6 */}
      <section>
        <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Pegging — besoin matière
        </h3>
        {pegging.parents.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-secondary/30 px-3 py-2.5 text-xs text-muted-foreground">
            Aucun besoin matière ferme (WIPTYP=6 WIPSTA=1) sur l’horizon — article à demande directe
            ou sans OF parent.
          </p>
        ) : (
          <Card className="gap-0 overflow-hidden hover:shadow-none">
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-foreground">
                Besoin matière de :{' '}
                {(() => {
                  const uniqParents = [...new Set(pegging.parents.map((p) => p.article))]
                  return uniqParents.join(', ')
                })()}{' '}
                <span className="font-normal text-muted-foreground">(OF fermes)</span>
              </p>
            </div>
            <table className="w-full border-collapse border-t border-border text-left text-sm">
              <thead>
                <TableHeadRow>
                  <TableHead>Article</TableHead>
                  <TableHead>OF</TableHead>
                  <TableHead align="right" className="text-right!">
                    Qté
                  </TableHead>
                  <TableHead>Échéance</TableHead>
                </TableHeadRow>
              </thead>
              <tbody>
                {pegging.parents.map((par, i) => (
                  <TableRow key={`${par.of}-${par.article}-${i}`}>
                    <TableCell>
                      <CellStack code={par.article} />
                    </TableCell>
                    <TableCell>
                      <CellStack code={par.of} />
                    </TableCell>
                    <TableCell align="right">
                      <CellNumber value={fmtQte(par.quantite)} />
                    </TableCell>
                    <TableCell>
                      <CellDate date={fr(par.echeance)} />
                    </TableCell>
                  </TableRow>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {pegging.suggestionOrigine && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Suggestion d’origine :{' '}
            <span className="font-mono font-semibold text-foreground">
              {pegging.suggestionOrigine.numero}
            </span>
            {pegging.suggestionOrigine.convertieLe
              ? ` convertie le ${fr(pegging.suggestionOrigine.convertieLe)}`
              : ' — date de conversion non retrouvée dans les photos'}
            .
          </p>
        )}
      </section>
    </div>
  )
}

export default ArticleExplanationSheet
