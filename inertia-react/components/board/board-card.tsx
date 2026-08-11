import { Pencil, TriangleAlert } from 'lucide-react'
import { cn } from '@r/lib/utils'
import { TYPO_META } from '@r/lib/board/types'
import { peutOuvrirCommande } from '@r/lib/x3-link'
import { X3Link } from '../x3-link'
import { DynamicIcon } from '../ui/dynamic-icon'

/**
 * BoardCard — carte unifiée du board.
 *
 * Un composant, deux variantes :
 *  • commande — board planification (numCommande·ligne, client, type MTS/MTO).
 *  • of       — board ordonnancement (OF, progression qty fait/lancé, poste,
 *               alerte rupture quand bloqué).
 *
 * Refonte « Cursor » (chantier BoardCard, 2026-08-11) : le motif « bande
 * Listing » de la variante OF est conservé comme concept (bande de statut
 * tenant lieu de « photo ») mais rejoué sur la grammaire Cursor — tons
 * succès/alerte/danger/marque, bande plate en wash 24 % du ton (dégradé et
 * motif code produit retirés), survol en wash (mix 6 %, token
 * --cursor-bg-card) au lieu du flottement, liseré haut de la variante
 * commande réduit de 3 px à 1 px (filet en ton du statut). Tous les signaux
 * existants sont préservés : faisabilité au coin, cours → point pulsant,
 * terminé → atténué, bloqué → rouge + alerte rupture.
 *
 * Statut → ton : ferme/planifié = succès (le thème Cursor fait déjà
 * `--planifie: #007041` — collapse acté), suggéré = alerte, cours = marque
 * (rare), terminé = encre secondaire, bloqué = danger.
 */

export type CardStatus = 'ferme' | 'planifie' | 'suggere' | 'cours' | 'termine' | 'bloque'

/**
 * Ton du statut — grammaire Cursor (DESIGN.md) : succès / alerte / danger,
 * marque rare, encre secondaire pour le soldé. Un seul alphabet sert au
 * filet haut (variante commande), à la barre de progression et à la bande
 * « Listing » (variante OF).
 */
const TONE: Record<CardStatus, string> = {
  ferme: '#007041' /* --success */,
  planifie: '#007041' /* --success — collapse acté par le thème Cursor */,
  suggere: '#a46700' /* --warn */,
  cours: '#f54e00' /* --brand, rare : point pulsant + bande */,
  termine: 'color-mix(in oklab, #141414 74%, transparent)' /* encre secondaire */,
  bloque: '#be1744' /* --danger */,
}
/** Badge faisabilité (coin haut-droit) — tons Cursor pleins, icône claire. */
const FEAS_COLOR: Record<'ok' | 'qc' | 'bad', string> = {
  ok: '#007041',
  qc: '#a46700',
  bad: '#be1744',
}
/**
 * Type commande → chip lavé (MTS/MTO/NOR). Reprend l'alphabet statut décliné
 * en recette badge Cursor : fond mix 12 %, texte ton plein (lot 2).
 *  • MTS (Make To Stock)   → succès (production sur stock, stable)
 *  • MTO (Make To Order)   → alerte (production sur commande spécifique)
 *  • NOR (standard)        → succès (mode normal)
 * Type inconnu → pastille neutre (wash 8 % + encre secondaire).
 */
const TYPE_META: Record<string, { background: string; color: string }> = {
  MTS: { background: 'color-mix(in oklab, #007041 12%, transparent)', color: '#007041' },
  MTO: { background: 'color-mix(in oklab, #a46700 12%, transparent)', color: '#a46700' },
  NOR: { background: 'color-mix(in oklab, #007041 12%, transparent)', color: '#007041' },
}

/** Pastille statut OF alloué (même alphabet que filtre OF / bande Listing). */
const OF_STATUS_DOT: Record<'ferme' | 'planifie' | 'suggere', string> = {
  ferme: '#007041',
  planifie: '#007041',
  suggere: '#a46700',
}
const OF_STATUS_LABEL: Record<'ferme' | 'planifie' | 'suggere', string> = {
  ferme: 'ferme',
  planifie: 'planifié',
  suggere: 'suggéré',
}

type Common = {
  status: CardStatus
  /** En-tête mono (numOf ou code article). */
  article: string
  /** Désignation. */
  title: string
  /** Charge (heures), à droite du pied. */
  hours: string
  /**
   * Badge faisabilité au coin : ✓ réalisable / ⚗ réalisable mais tributaire du contrôle
   * qualité (stock statut Q) / ! rupture.
   */
  feas?: 'ok' | 'qc' | 'bad'
  /** Infobulle du badge `qc` : composants sous CQ à faire libérer (réf → quantité). */
  feasQcComponents?: Record<string, number>
  className?: string
}

export type CommandeCardProps = Common & {
  variant: 'commande'
  /** Réf. commande·ligne (ex. AR24518·L2). */
  ord?: string
  /** Client (ligne italique). */
  client?: string
  /** Type MTS/MTO/NOR (pastille terra). */
  type?: string
  /**
   * Nature du besoin (COMMANDE / PREVISION / INDUIT) — filtre du lien X3 (#118).
   * Requise : sans elle le lien tomberait en silence, et un appelant qui
   * l'oublie doit s'en apercevoir au typecheck, pas en production.
   */
  nature: string
  /** Flag « modifié » (override local). */
  mod?: boolean
  /** Article dont la nomenclature contient un composant BDH (issue #28). */
  consommeBouche?: boolean
  /** Typologie X3 (TSICOD_4) du PF (issue #42). */
  typologie?: string
  /** Quantité (reste à livrer) — footer. */
  qty?: number
  /** Carte induite (besoin brut depth-1) : ghost hachuré, non-draggable. */
  induit?: boolean
  /** Alerte rupture (composants manquants des OF rattachés, agrégés côté store). */
  alert?: string
  /**
   * Statut de l'OF alloué par le matcher (pastille). Distinct du liseré haut
   * (nature COMMANDE/PRÉVISION) et du peg contremarque.
   */
  ofStatus?: 'ferme' | 'planifie' | 'suggere' | null
}

export type OfCardProps = Common & {
  variant: 'of'
  /** Réf. article PF (code article, sous le n° d'OF). */
  articleRef?: string
  /** Poste de charge (pied gauche, point = ton). */
  poste?: string
  /** Progression qty fait/lancé (barre). */
  progress?: { done: number; total: number }
  /** Alerte rupture (ligne, statut bloqué). */
  alert?: string
  /** OF dont la nomenclature contient un composant BDH (issue #28). */
  consommeBouche?: boolean
  /** Typologie fine X3 (TSICOD_4) du PF — ex: ESH10, ESH30 (issue #42). */
  typologie?: string
  /** Forme produit : KIT vs GPE (issue #42). */
  kitGpe?: 'KIT' | 'GPE'
  /** Issue #23 : écart (jours) au besoin de la commande — badge « +N j » si > 0 (retard).
   *  null/undefined = pas de verdict (OF sans lien / donnée manquante). */
  retardJours?: number | null
}

export type BoardCardProps = CommandeCardProps | OfCardProps

export function BoardCard(props: BoardCardProps) {
  return props.variant === 'of' ? <OfListingCard {...props} /> : <CommandeCard {...props} />
}

/* ── Variante commande — coquille refondue Cursor ── */
function CommandeCard(props: CommandeCardProps) {
  // commande modifiée (override local) → anneau marque autour de la carte
  const ring = props.mod
  // carte induite (ghost) → fond hachuré neutre
  const ghost = props.induit

  return (
    <div
      className={cn(
        'relative w-full rounded-[12px] border border-border bg-card px-3 pb-2 pt-2.5',
        'border-t transition-shadow duration-100',
        'hover:shadow-[inset_0_0_0_999px_color-mix(in_oklab,#141414_6%,transparent)]',
        ring && 'shadow-[0_0_0_1px_#f54e00]',
        props.status === 'termine' && 'opacity-60',
        props.className
      )}
      style={{
        // Filet haut 1 px en ton du statut (réinterprétation du liseré 3 px).
        borderTopColor: TONE[props.status],
        ...(ghost
          ? {
              backgroundColor: 'color-mix(in oklab, #141414 4%, transparent)',
              backgroundImage:
                'repeating-linear-gradient(45deg, color-mix(in oklab, #141414 8%, transparent) 0 2px, transparent 2px 8px)',
            }
          : undefined),
      }}
    >
      {/* coin haut-droit : faisabilité, ou coche terminé */}
      {props.feas === 'ok' && <CornerBadge color={FEAS_COLOR.ok} icon="check" />}
      {props.feas === 'qc' && (
        <CornerBadge
          color={FEAS_COLOR.qc}
          icon="science"
          title={qcBadgeTitle(props.feasQcComponents)}
        />
      )}
      {props.feas === 'bad' && <CornerBadge color={FEAS_COLOR.bad} icon="priority_high" />}
      {!props.feas && props.status === 'termine' && (
        <CornerBadge color={TONE.termine} icon="check" />
      )}
      {/* cours : point marque pulsant (intérieur) */}
      {props.status === 'cours' && (
        <span
          className="absolute right-2.5 top-2.5 size-[7px] animate-pulse rounded-full"
          style={{ backgroundColor: TONE.cours }}
        />
      )}
      <CommandeBody
        article={props.article}
        title={props.title}
        ord={props.ord}
        client={props.client}
        type={props.type}
        nature={props.nature}
        mod={props.mod}
        hours={props.hours}
        consommeBouche={props.consommeBouche}
        typologie={props.typologie}
        qty={props.qty}
        induit={props.induit}
        alert={props.alert}
        ofStatus={props.ofStatus}
      />
    </div>
  )
}

/* ── Variante commande ── */
interface CommandeBodyProps {
  article: string
  title: string
  ord?: string
  client?: string
  type?: string
  nature: string
  mod?: boolean
  hours: string
  consommeBouche?: boolean
  typologie?: string
  qty?: number
  induit?: boolean
  alert?: string
  ofStatus?: 'ferme' | 'planifie' | 'suggere' | null
}

function CommandeBody(p: CommandeBodyProps) {
  const typo = p.typologie ? TYPO_META[p.typologie] : undefined
  const typeMeta = p.type ? TYPE_META[p.type.toUpperCase()] : undefined
  // p.article au format « numCommande·Ligne » (fmtRef) → on sépare pour bolder le n°.
  const refParts = p.article.split('·')
  const cmd = refParts[0] ?? p.article
  const ligne = refParts[1]

  return (
    <>
      {/* Type (MTS/MTO/NOR) à gauche + pastille statut OF alloué + n° commande.
          Pleine largeur (le tampon BDH est sur la ligne de l'article, pas ici). */}
      <div className="flex items-center gap-1.5 overflow-hidden" title={p.article}>
        {p.type && (
          <span
            className="shrink-0 rounded px-1 py-0.5 font-mono text-3xs font-medium uppercase tracking-wider"
            style={
              typeMeta ?? {
                background: 'color-mix(in oklab, #141414 8%, transparent)',
                color: 'color-mix(in oklab, #141414 74%, transparent)',
              }
            }
          >
            {p.type}
          </span>
        )}
        {p.ofStatus && (
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: OF_STATUS_DOT[p.ofStatus] }}
            title={`OF ${OF_STATUS_LABEL[p.ofStatus]}`}
            aria-label={`OF ${OF_STATUS_LABEL[p.ofStatus]}`}
          />
        )}
        {/* N° commande (ancre). La carte est draggable : le lien est
            stopPropagation-eur, il ne prend pas le drag ni l'ouverture du détail.
            Cartes sans lien : induite (pas de commande réelle) et prévision
            (cf. peutOuvrirCommande). */}
        {p.induit || !peutOuvrirCommande(p.nature) ? (
          <span className="shrink-0 whitespace-nowrap font-mono text-xs font-medium leading-tight text-foreground">
            {cmd}
          </span>
        ) : (
          <X3Link
            fonction="GESSOH"
            cle={cmd}
            title={`Ouvrir la commande ${cmd} dans Sage X3`}
            className="shrink-0 whitespace-nowrap font-mono text-xs font-medium leading-tight text-foreground"
          >
            {cmd}
          </X3Link>
        )}
        {ligne && (
          <span className="shrink-0 font-mono text-2xs font-medium leading-tight text-muted-foreground">
            ·{ligne}
          </span>
        )}
      </div>
      {/* Article (PF) + tampon « BDH » (consomme bouche, issue #42) sur la même ligne. */}
      {(p.ord || p.consommeBouche) && (
        <div className="mt-1 flex items-center justify-between gap-1.5">
          <div
            className="truncate font-mono text-xs font-medium leading-tight text-foreground"
            title={p.ord}
          >
            {p.ord}
          </div>
          {p.consommeBouche && (
            <span
              className="shrink-0 rotate-[-7deg] rounded border bg-card px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider opacity-70"
              style={{
                color: '#f54e00',
                borderColor: '#f54e00',
                textShadow: '0 0 1px rgba(0,0,0,.35)',
              }}
            >
              BDH
            </span>
          )}
        </div>
      )}
      <div className="truncate text-xs leading-tight text-muted-foreground" title={p.title}>
        {p.title}
      </div>
      {p.client && (
        <div className="mt-0.5 truncate text-xs italic text-muted-foreground">{p.client}</div>
      )}
      {p.alert && (
        <div className="mt-1.5 flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-[3px] font-mono text-3xs font-medium text-destructive">
          <TriangleAlert size={12} strokeWidth={1.75} />
          {p.alert}
        </div>
      )}
      {/* Footer V1 (issue #42) : pastille typo pleine + type (gauche), qté mise en
          avant + heures (droite). flex-wrap pour éviter l'overflow horizontal. */}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[color-mix(in_oklab,#141414_4%,transparent)] pt-1.5">
        {p.mod && (
          <span className="inline-flex items-center gap-0.5 font-mono text-3xs font-semibold uppercase tracking-wider text-[#a46700]">
            <Pencil size={12} strokeWidth={1.75} />
          </span>
        )}
        {typo && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider"
            style={{ background: typo.color, color: typo.text }}
          >
            {typo.label}
          </span>
        )}
        <span className="ml-auto flex items-baseline gap-1">
          {p.qty !== undefined && (
            <span className="text-[14px] font-medium leading-none tabular-nums text-foreground">
              {p.qty}
            </span>
          )}
          <span className="text-2xs font-medium tabular-nums text-muted-foreground">
            {p.hours}h
          </span>
        </span>
      </div>
    </>
  )
}

/* ── Variante OF — carte « Listing » (bande plate, refonte Cursor) ──
 *
 * Bande de statut en guise de « photo » : wash plat 24 % du ton (échelle
 * --bg-*-secondary de DESIGN.md), sans dégradé ni motif. Le statut vit dans
 * la couleur de la bande ET dans la pastille à côté du n° OF ; la réf.
 * article, elle, est relue en mono dans le corps, sous le n° OF. Puis
 * hiérarchie claire : n° OF en emphase, désignation, progression, alerte, et
 * l'heure de charge en ancre au pied. Survol = wash mix 6 % (token
 * --cursor-bg-card) — pas d'élévation. Tous les signaux existants sont
 * préservés : faisabilité, point cours, badge retard, tampon BDH, typologie,
 * progression, alerte rupture.
 */
function OfListingCard(p: OfCardProps) {
  const typo = p.typologie ? TYPO_META[p.typologie] : undefined
  const tone = TONE[p.status]
  const pct =
    p.progress && p.progress.total > 0
      ? Math.min(100, Math.round((p.progress.done / p.progress.total) * 100))
      : 0

  return (
    <div
      className={cn(
        'relative w-full rounded-[12px] border border-border bg-card',
        'transition-shadow duration-100',
        'hover:shadow-[inset_0_0_0_999px_color-mix(in_oklab,#141414_6%,transparent)]',
        p.status === 'termine' && 'opacity-60',
        p.className
      )}
    >
      {/* Bandeau = tag de statut (la COULEUR porte l'état) portant la réf.
          article en mono (le « sujet » de la carte) : wash plat 24 % du ton,
          sans dégradé ni motif. overflow-hidden + coins arrondis pour ne pas
          rogner les badges saillants (faisabilité/retard). */}
      <div
        className="flex h-7 items-center overflow-hidden rounded-t-[11px] px-2.5"
        title={p.articleRef ?? undefined}
        style={{
          backgroundColor: `color-mix(in oklab, ${tone} 24%, #fcfcfc)`,
        }}
      >
        {p.articleRef && (
          <span
            className="truncate font-mono text-2xs font-medium leading-none"
            style={{ color: tone }}
          >
            {p.articleRef}
          </span>
        )}
      </div>

      {/* Badges saillants, positionnés sur la bande. */}
      {p.feas === 'ok' && <CornerBadge color={FEAS_COLOR.ok} icon="check" />}
      {p.feas === 'qc' && (
        <CornerBadge
          color={FEAS_COLOR.qc}
          icon="science"
          title={qcBadgeTitle(p.feasQcComponents)}
        />
      )}
      {p.feas === 'bad' && <CornerBadge color={FEAS_COLOR.bad} icon="priority_high" />}
      {!p.feas && p.status === 'termine' && <CornerBadge color={TONE.termine} icon="check" />}
      {/* Issue #23 : badge retard « +N j » (chevauche le haut de la bande). */}
      {(p.retardJours ?? null) !== null && p.retardJours! > 0 && (
        <span className="absolute -top-1.5 left-2 z-10 flex h-4 items-center justify-center rounded-full bg-[#be1744] px-1 font-mono text-2xs font-medium tabular-nums text-[#fcfcfc]">
          +{p.retardJours}j
        </span>
      )}

      {/* Corps */}
      <div className="relative px-2.5 pb-2 pt-1.5">
        {/* Tampon « BDH » (issue #42) — dans le corps, sous la bande. */}
        {p.consommeBouche && (
          <span
            className="absolute right-1.5 top-1 rotate-[-7deg] rounded border bg-card px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-wider opacity-70"
            style={{
              color: '#f54e00',
              borderColor: '#f54e00',
              textShadow: '0 0 1px rgba(0,0,0,.35)',
            }}
          >
            BDH
          </span>
        )}
        {/* N° OF (ancre) + pastille de statut. Réserve à droite la place du
            tampon BDH si présent. OF suggéré : pas de MFGNUM, pas de lien (#118). */}
        <div className="flex items-center gap-1.5">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: tone }}
            aria-hidden
          />
          {p.status === 'suggere' ? (
            <div
              title={p.article}
              className={cn(
                'truncate font-mono text-[13px] font-medium leading-tight text-foreground',
                p.consommeBouche && 'pr-9'
              )}
            >
              {p.article}
            </div>
          ) : (
            <X3Link
              fonction="GESMFG"
              cle={p.article}
              title={`Ouvrir l'OF ${p.article} dans Sage X3`}
              className={cn(
                'truncate font-mono text-[13px] font-medium leading-tight text-foreground',
                p.consommeBouche && 'pr-9'
              )}
            >
              {p.article}
            </X3Link>
          )}
        </div>
        {/* Désignation (la réf. article, elle, vit en texte lisible dans le bandeau). */}
        <div
          className="mt-0.5 truncate text-xs leading-tight text-muted-foreground"
          title={p.title}
        >
          {p.title}
        </div>
        {p.progress && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,#141414_6%,transparent)]">
              <span
                className="block h-full rounded-full"
                style={{ backgroundColor: tone, width: `${pct}%` }}
              />
            </span>
            <span className="font-mono text-3xs font-medium text-secondary-foreground">
              {p.progress.done}/{p.progress.total}
            </span>
          </div>
        )}
        {p.alert && (
          <div className="mt-1.5 flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-[3px] font-mono text-3xs font-medium text-destructive">
            <TriangleAlert size={12} strokeWidth={1.75} />
            {p.alert}
          </div>
        )}
        {/* Pied : typologie à gauche, heure de charge en ancre à droite (le
            « prix » de l'annonce). */}
        <div className="mt-1.5 flex items-baseline justify-between gap-1.5 border-t border-[color-mix(in_oklab,#141414_4%,transparent)] pt-1">
          {typo ? (
            <span
              title={typo.label}
              className="inline-flex min-w-0 items-center gap-1 font-mono text-3xs font-medium uppercase text-secondary-foreground"
            >
              <span
                className="size-[8px] shrink-0 rounded-[2px]"
                style={{ background: typo.color }}
              />
              <span className="truncate">{typo.label}</span>
            </span>
          ) : (
            <span className="min-w-0" />
          )}
          <span className="shrink-0 text-[14px] font-medium leading-none tabular-nums text-foreground">
            {p.hours}
            <span className="ml-0.5 text-2xs font-medium text-muted-foreground">h</span>
          </span>
        </div>
      </div>
    </div>
  )
}

interface CornerBadgeProps {
  color: string
  icon: string
  /** Infobulle native (aucun portail : la carte est draggable, un Tooltip casserait le drag). */
  title?: string
}

/**
 * Libellé d'infobulle du badge CQ — dit l'action, pas seulement l'état : l'ordonnanceur
 * doit appeler le contrôle réception pour faire lever le statut Q.
 */
export function qcBadgeTitle(qcComponents?: Record<string, number>): string {
  const entries = Object.entries(qcComponents ?? {})
  const detail = entries
    .slice(0, 4)
    .map(([ref, qty]) => `${ref} (${Math.round(qty)})`)
    .join(', ')
  const reste = entries.length > 4 ? `, +${entries.length - 4} autre(s)` : ''
  return (
    `Réalisable UNIQUEMENT grâce à du stock sous contrôle qualité (statut Q)` +
    (detail ? ` : ${detail}${reste}` : '') +
    `\nAction : contacter le contrôle réception pour faire libérer le stock.`
  )
}

function CornerBadge(p: CornerBadgeProps) {
  return (
    <span
      title={p.title}
      className="absolute -top-1.5 right-2 flex size-4 items-center justify-center rounded-full text-card"
      style={{ backgroundColor: p.color }}
    >
      <DynamicIcon name={p.icon} size={12} strokeWidth={1.75} />
    </span>
  )
}

export default BoardCard
