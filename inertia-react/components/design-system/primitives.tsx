import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Factory,
  Filter,
  Gauge,
  LayoutDashboard,
  Package,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Truck,
} from 'lucide-react'

import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@r/components/ui/card'
import { DataTable, type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@r/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@r/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@r/components/ui/sheet'
import { Input } from '@r/components/ui/input'
import { Textarea } from '@r/components/ui/textarea'
import { Label } from '@r/components/ui/label'
import { Pill } from '@r/components/ui/pill'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from '@r/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@r/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@r/components/ui/select'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@r/components/ui/combobox'
import { Separator } from '@r/components/ui/separator'
import { Skeleton, SkeletonBadge, SkeletonChart, SkeletonRow } from '@r/components/ui/skeleton'
import { Spinner } from '@r/components/ui/spinner'
import { LoadingState } from '@r/components/ui/loading-state'
import { Switch } from '@r/components/ui/switch'
import { TextField, TextFieldInput, TextFieldLabel } from '@r/components/ui/text-field'
import { Tooltip, TooltipContent, TooltipTrigger } from '@r/components/ui/tooltip'
import { Calendar } from '@r/components/ui/calendar'
import { SearchBar } from '@r/components/ui/search-bar'
import {
  Toolbar,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
} from '@r/components/ui/sidebar'
import { Bubble, BubbleContent, BubbleGroup } from '@r/components/ui/bubble'
import { DynamicIcon } from '@r/components/ui/dynamic-icon'
import { useRangeCalendar } from '@r/lib/use-range-calendar'
import { cn } from '@r/lib/utils'

import { Caption, Demo, Fiche, Grid, Panel, Rule, Section, SpecTable, Sub, Tok } from './kit'

/**
 * Catalogue des primitives `inertia-react/components/ui/*`.
 * Chaque fiche rend le composant réel — jamais une réplique — et affiche son
 * état de migration vers le thème Cursor.
 */

/* ── 10 Boutons ─────────────────────────────────────────────── */

const BUTTON_SIZES = [
  { size: 'xs' as const, h: 32, cible: 20 },
  { size: 'sm' as const, h: 40, cible: 24 },
  { size: 'default' as const, h: 48, cible: 28 },
  { size: 'lg' as const, h: 56, cible: 32 },
]

export function BoutonsSection() {
  return (
    <Section
      id="boutons"
      n="10"
      title="Boutons"
      intro={
        <>
          Une action par écran mérite le bouton plein ; tout le reste est secondaire, fantôme ou
          textuel. Le skin Cursor a déjà repris le rayon (6 px) et la graisse (500) — pas encore les
          hauteurs, qui restent en densité Airbnb.
        </>
      }
    >
      <Fiche
        nom="Button"
        from="@r/components/ui/button"
        etat="partiel"
        note={
          <>
            Six variantes, huit tailles. Sous <Tok>.theme-cursor</Tok>, le sélecteur{' '}
            <Tok>[data-slot=&apos;button&apos;]</Tok> force <Tok>border-radius: 6px</Tok> et{' '}
            <Tok>font-weight: 500</Tok> ; les hauteurs et les paddings restent ceux de la grammaire
            d’origine.
          </>
        }
      >
        <Grid min={300}>
          <Demo label="Variantes" spec="default · secondary · outline · ghost · destructive · link">
            <Button>
              <ClipboardCheck />
              Faisabilité
            </Button>
            <Button variant="secondary">
              <Download />
              Exporter
            </Button>
            <Button variant="outline">Annuler</Button>
            <Button variant="ghost">
              <RefreshCw />
              X3
            </Button>
            <Button variant="destructive">
              <Trash2 />
              Supprimer
            </Button>
            <Button variant="link">Voir le détail</Button>
          </Demo>

          <Demo label="Tailles" spec="xs 32 · sm 40 · default 48 · lg 56 (px)">
            <Button size="xs">XS</Button>
            <Button size="sm">SM</Button>
            <Button>Default</Button>
            <Button size="lg">LG</Button>
          </Demo>

          <Demo
            label="Icône seule"
            spec="icon-xs · icon-sm · icon · icon-lg — aria-label obligatoire"
          >
            <Button size="icon-xs" variant="secondary" aria-label="Filtrer">
              <Filter />
            </Button>
            <Button size="icon-sm" variant="secondary" aria-label="Actualiser">
              <RefreshCw />
            </Button>
            <Button size="icon" variant="secondary" aria-label="Réglages">
              <SlidersHorizontal />
            </Button>
            <Button size="icon-lg" variant="outline" aria-label="Ajouter">
              <Plus />
            </Button>
          </Demo>

          <Demo label="États" spec="disabled · avec tooltip">
            <Button>Actif</Button>
            <Button disabled>Désactivé</Button>
            <Button variant="secondary" disabled>
              Désactivé
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button size="icon-sm" variant="outline" aria-label="Supprimer la clé">
                    <Trash2 className="text-destructive" />
                  </Button>
                }
              />
              <TooltipContent>Supprimer la clé API</TooltipContent>
            </Tooltip>
          </Demo>
        </Grid>

        <Sub title="Écart de densité" hint="hauteurs actuelles vs cible Cursor" className="mt-6" />
        <Panel padding="none">
          <SpecTable
            head={['Taille', 'Actuel', 'Cible Cursor', 'Écart']}
            rows={BUTTON_SIZES.map((b) => [
              <span className="font-mono text-[12px] text-[#141414]">{b.size}</span>,
              <span className="font-mono text-[12px] tabular-nums text-[#141414]">{b.h} px</span>,
              <span className="font-mono text-[12px] tabular-nums text-[#141414]">
                {b.cible} px
              </span>,
              <span className="font-mono text-[12px] tabular-nums text-[#be1744]">
                −{b.h - b.cible} px
              </span>,
            ])}
          />
        </Panel>
      </Fiche>

      <div className="grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Un seul bouton <Tok>default</Tok> par zone. S’il y en a deux, l’un des deux n’était pas
          l’action principale.
        </Rule>
        <Rule kind="dont">
          Un bouton <Tok>destructive</Tok> sans confirmation. Toute action irréversible passe par un{' '}
          <Tok>AlertDialog</Tok>.
        </Rule>
      </div>
    </Section>
  )
}

/* ── 11 Badges & pills ──────────────────────────────────────── */

export function BadgesSection() {
  return (
    <Section
      id="badges"
      n="11"
      title="Badges & pills"
      intro={
        <>
          Le badge <em>qualifie</em> une donnée : il est en lecture seule et ne réagit pas au
          survol. La pill <em>agit</em> : c’est un bouton rond, cliquable, qui porte un état
          sélectionné. Confondre les deux fait cliquer sur ce qui n’est pas cliquable.
        </>
      }
    >
      <Fiche
        nom="Badge"
        from="@r/components/ui/badge"
        etat="airbnb"
        note="Hauteur fixe 20 px, rayon plein, texte 12 px medium. Huit variantes — dont trois sémantiques qui portent l'alphabet de statut du board."
      >
        <Grid min={300}>
          <Demo label="Neutres" spec="default · secondary · outline · ghost">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="ghost">Ghost</Badge>
          </Demo>
          <Demo label="Sémantiques" spec="success · warning · destructive">
            <Badge variant="success">
              <Check />
              Ferme
            </Badge>
            <Badge variant="warning">Suggéré</Badge>
            <Badge variant="destructive">
              <AlertTriangle />
              Rupture
            </Badge>
          </Demo>
          <Demo label="Lien" spec='variant="link"'>
            <Badge variant="link">Ouvrir dans X3</Badge>
          </Demo>
          <Demo label="Avec icône de fin" spec='data-icon="inline-end" ajuste le padding'>
            <Badge variant="secondary">
              12 composants
              <ChevronRight data-icon="inline-end" />
            </Badge>
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="Pill"
        from="@r/components/ui/pill"
        etat="airbnb"
        note={
          <>
            Toujours rendue en <Tok>&lt;button&gt;</Tok> — ce n’est pas un composant polymorphique.
            Utilisée pour les filtres de barre d’outils et les sélecteurs de fenêtre.
          </>
        }
      >
        <Grid min={300}>
          <Demo label="Variantes" spec="default · active · outline · ghost · soft">
            <Pill>Default</Pill>
            <Pill variant="active">Active</Pill>
            <Pill variant="outline">Outline</Pill>
            <Pill variant="ghost">Ghost</Pill>
            <Pill variant="soft" dot>
              Soft + dot
            </Pill>
          </Demo>
          <Demo label="Tailles" spec="sm 28 · default 30 · lg 40 (px)">
            <Pill size="sm">SM</Pill>
            <Pill size="default">Default</Pill>
            <Pill size="lg">LG</Pill>
          </Demo>
        </Grid>
      </Fiche>
    </Section>
  )
}

/* ── 12 Champs ──────────────────────────────────────────────── */

const ARTICLES = [
  'BDH60 — Bouche hygro 60',
  'PP830 — Caisson VMC',
  'ESH10 — Entrée d’air',
  'ESH30 — Entrée d’air acoustique',
  'D250 — Conduit Ø250',
]

export function ChampsSection() {
  const [name, setName] = useState('')
  const [scope, setScope] = useState('poste')
  const [q, setQ] = useState('')

  return (
    <Section
      id="champs"
      n="12"
      title="Champs de saisie"
      intro={
        <>
          Un champ se lit avant d’être rempli : le libellé est toujours visible, jamais remplacé par
          un placeholder. Le placeholder donne un exemple de format, pas le nom du champ.
        </>
      }
    >
      <Fiche
        nom="Input · Textarea · Label"
        from="@r/components/ui/input · textarea · label"
        etat="airbnb"
        note="Input à 56 px de haut, rayon 8 px, bordure qui s'épaissit au focus. La cible Cursor est un champ de 28 px à rayon 6 px avec un anneau de focus accent — l'écart est le plus important du catalogue."
      >
        <Grid min={280}>
          <Demo label="Input">
            <div className="w-full">
              <Label htmlFor="ds-input" className="mb-2 block text-xs">
                Recherche
              </Label>
              <Input id="ds-input" placeholder="Article, OF, commande…" />
            </div>
          </Demo>
          <Demo label="Input désactivé">
            <div className="w-full">
              <Label htmlFor="ds-input-d" className="mb-2 block text-xs">
                Site
              </Label>
              <Input id="ds-input-d" defaultValue="AE1" disabled />
            </div>
          </Demo>
          <Demo label="Textarea">
            <div className="w-full">
              <Label htmlFor="ds-ta" className="mb-2 block text-xs">
                Commentaire d’arbitrage
              </Label>
              <Textarea id="ds-ta" placeholder="Motif du décalage…" rows={3} />
            </div>
          </Demo>
          <Demo label="État invalide" spec="aria-invalid → bordure destructive">
            <div className="w-full">
              <Label htmlFor="ds-input-e" className="mb-2 block text-xs">
                Quantité
              </Label>
              <Input id="ds-input-e" defaultValue="-12" aria-invalid />
            </div>
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="TextField"
        from="@r/components/ui/text-field"
        etat="airbnb"
        note="Composition contrôlée libellé + champ, quand le libellé doit rester solidaire de la saisie."
      >
        <Demo label="TextField">
          <div className="w-full max-w-[320px]">
            <TextField value={name} onChange={setName}>
              <TextFieldLabel>Désignation</TextFieldLabel>
              <TextFieldInput placeholder="Caisse VMC D250" />
            </TextField>
          </div>
        </Demo>
      </Fiche>

      <Fiche
        nom="Field"
        from="@r/components/ui/field"
        etat="airbnb"
        note="La structure complète d'un champ de formulaire : légende, libellé, aide, erreur, séparateur. Trois orientations."
      >
        <Panel>
          <FieldSet>
            <FieldLegend>Fenêtre de planification</FieldLegend>
            <FieldGroup>
              <Field orientation="vertical">
                <FieldLabel htmlFor="ds-f1">Horizon</FieldLabel>
                <Input id="ds-f1" defaultValue="14 jours" />
                <FieldDescription>
                  Nombre de jours ouvrés projetés à partir d’aujourd’hui.
                </FieldDescription>
              </Field>
              <FieldSeparator />
              <Field orientation="horizontal">
                <FieldLabel htmlFor="ds-f2">Inclure les suggérés</FieldLabel>
                <Switch id="ds-f2" defaultChecked />
              </Field>
              <FieldSeparator />
              <Field orientation="vertical" data-invalid>
                <FieldLabel htmlFor="ds-f3">Seuil de couverture</FieldLabel>
                <Input id="ds-f3" defaultValue="-3" aria-invalid />
                <FieldError>Le seuil doit être un nombre de jours positif.</FieldError>
              </Field>
            </FieldGroup>
          </FieldSet>
        </Panel>
      </Fiche>

      <Fiche
        nom="InputGroup"
        from="@r/components/ui/input-group"
        etat="airbnb"
        note="Un champ augmenté d'affixes : unité, préfixe, bouton d'action. Quatre positions d'ancrage."
      >
        <Grid min={300}>
          <Demo label="Affixes latéraux">
            <div className="w-full">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <InputGroupText>OF</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput placeholder="F126-44429" />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton size="icon-xs" aria-label="Rechercher">
                    <Search />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </Demo>
          <Demo label="Unité en fin">
            <div className="w-full">
              <InputGroup>
                <InputGroupInput defaultValue="1 240" />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>u</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="Select"
        from="@r/components/ui/select"
        etat="partiel"
        note="Le seul contrôle déjà à la densité Cursor : déclencheur à 32 px (28 px en taille sm), panneau à rayon 12 px."
      >
        <Grid min={280}>
          <Demo label="Taille default — 32 px">
            <Select value={scope} onValueChange={(v) => v && setScope(v)}>
              <SelectTrigger className="w-[220px]" aria-label="Portée">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Regrouper par</SelectLabel>
                  {['poste', 'commande', 'article', 'client'].map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Demo>
          <Demo label="Taille sm — 28 px">
            <Select defaultValue="AE1">
              <SelectTrigger size="sm" className="w-[160px]" aria-label="Site">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AE1">Site AE1</SelectItem>
                <SelectItem value="AE2">Site AE2</SelectItem>
              </SelectContent>
            </Select>
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="Combobox"
        from="@r/components/ui/combobox"
        etat="airbnb"
        note="Sélection avec filtrage au clavier. À préférer au Select dès que la liste dépasse une dizaine d'entrées."
      >
        <Demo label="Combobox">
          <div className="w-full max-w-[320px]">
            <Combobox items={ARTICLES}>
              <ComboboxInput placeholder="Article…" showTrigger showClear />
              <ComboboxContent>
                <ComboboxList>
                  {ARTICLES.map((a) => (
                    <ComboboxItem key={a} value={a}>
                      {a}
                    </ComboboxItem>
                  ))}
                  <ComboboxEmpty>Aucun article ne correspond.</ComboboxEmpty>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </Demo>
      </Fiche>

      <Fiche
        nom="Switch"
        from="@r/components/ui/switch"
        etat="airbnb"
        note="Effet immédiat, sans validation. Si le changement nécessite un « Appliquer », c'est une case à cocher qu'il faut, pas un interrupteur."
      >
        <Demo label="Switch">
          <div className="flex items-center gap-2">
            <Switch id="ds-switch" defaultChecked />
            <Label htmlFor="ds-switch" className="cursor-pointer text-sm">
              Masquer les OF terminés
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ds-switch-off" />
            <Label htmlFor="ds-switch-off" className="cursor-pointer text-sm">
              Inclure les prévisions
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ds-switch-d" disabled />
            <Label htmlFor="ds-switch-d" className="text-sm opacity-50">
              Désactivé
            </Label>
          </div>
        </Demo>
      </Fiche>

      <Fiche
        nom="SearchBar"
        from="@r/components/ui/search-bar"
        etat="airbnb"
        note="Barre de recherche segmentée à 64 px, rayon plein, ombre au repos — l'objet le plus marqué « Airbnb » du catalogue. À reconsidérer entièrement pour Cursor."
      >
        <Demo label="SearchBar segmentée">
          <div className="w-full">
            <SearchBar
              segments={[
                { label: 'Article', placeholder: 'Référence…', value: q, onChange: setQ },
                { label: 'Poste', placeholder: 'Ligne ou poste' },
              ]}
              onSubmit={() => {}}
            />
          </div>
        </Demo>
      </Fiche>

      <Fiche
        nom="Separator"
        from="@r/components/ui/separator"
        etat="airbnb"
        note="Filet de 1 px. À n'utiliser que quand un changement de surface ne suffit pas."
      >
        <Panel>
          <div className="text-[13px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
            Horizontal
          </div>
          <Separator className="my-3" />
          <div className="flex h-8 items-center gap-3 text-[13px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
            <span>Fermes</span>
            <Separator orientation="vertical" />
            <span>Planifiés</span>
            <Separator orientation="vertical" />
            <span>Suggérés</span>
          </div>
        </Panel>
      </Fiche>
    </Section>
  )
}

/* ── 13 Calendrier ──────────────────────────────────────────── */

export function CalendrierSection() {
  const [range, setRange] = useState<{ start: Date | null; end: Date | null }>({
    start: new Date(2026, 7, 1),
    end: new Date(2026, 7, 11),
  })
  const rangeCal = useRangeCalendar({
    value: range.start ? { from: range.start, to: range.end ?? undefined } : undefined,
    onCommit: (r) => setRange({ start: r.from ?? null, end: r.to ?? null }),
  })

  return (
    <Section
      id="calendrier"
      n="13"
      title="Calendrier"
      intro={
        <>
          Toutes les dates de l’application s’affichent en <strong>jj/mm/aaaa</strong>. L’ISO reste
          côté machine — il n’apparaît jamais à l’écran.
        </>
      }
    >
      <Fiche
        nom="Calendar"
        from="@r/components/ui/calendar"
        etat="airbnb"
        note={
          <>
            Bâti sur <Tok>react-day-picker</Tok>. Le mode plage passe obligatoirement par{' '}
            <Tok>useRangeCalendar</Tok>, qui gère le second clic et ne valide qu’une plage complète.
          </>
        }
      >
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          <Panel padding="sm" className="w-fit">
            <Calendar
              mode="range"
              selected={rangeCal.selected}
              onSelect={rangeCal.onSelect}
              numberOfMonths={1}
            />
          </Panel>
          <div className="pt-1">
            <Caption className="mb-1">Plage retenue</Caption>
            <div className="text-[20px] font-medium tracking-[-0.26px] tabular-nums text-[#141414]">
              {range.start?.toLocaleDateString('fr-FR') ?? '—'} →{' '}
              {range.end?.toLocaleDateString('fr-FR') ?? '…'}
            </div>
            <p className="mt-3 max-w-[260px] text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
              Le calendrier ne connaît pas les jours fériés ni les fermetures d’usine : c’est le
              calendrier de capacité qui les porte, côté domaine.
            </p>
          </div>
        </div>
      </Fiche>
    </Section>
  )
}

/* ── 14 Surfaces & tableaux ─────────────────────────────────── */

type OfRow = {
  of: string
  article: string
  poste: string
  qte: number
  charge: string
  statut: 'Ferme' | 'Planifié' | 'Suggéré'
  besoin: string
}

const OF_ROWS: OfRow[] = [
  {
    of: 'F126-44429',
    article: 'PP830',
    poste: 'MONT-2',
    qte: 120,
    charge: '6,0 h',
    statut: 'Ferme',
    besoin: '14/08/2026',
  },
  {
    of: 'F126-44502',
    article: 'BDH60',
    poste: 'BDH-1',
    qte: 1240,
    charge: '3,7 h',
    statut: 'Planifié',
    besoin: '18/08/2026',
  },
  {
    of: 'F126-44518',
    article: 'ESH10',
    poste: 'MONT-1',
    qte: 96,
    charge: '1,2 h',
    statut: 'Suggéré',
    besoin: '21/08/2026',
  },
  {
    of: 'F126-44530',
    article: 'D250',
    poste: 'FAB-3',
    qte: 480,
    charge: '9,4 h',
    statut: 'Ferme',
    besoin: '22/08/2026',
  },
]

const STATUT_BADGE: Record<OfRow['statut'], 'success' | 'secondary' | 'warning'> = {
  Ferme: 'success',
  Planifié: 'secondary',
  Suggéré: 'warning',
}

const ofColumns: ColumnDef<OfRow>[] = [
  {
    id: 'of',
    accessorKey: 'of',
    header: 'OF',
    cell: ({ getValue }) => (
      <span className="font-mono text-base font-medium text-foreground">{String(getValue())}</span>
    ),
  },
  {
    id: 'article',
    accessorKey: 'article',
    header: 'Article',
    cell: ({ getValue }) => (
      <span className="font-mono text-base text-muted-foreground">{String(getValue())}</span>
    ),
  },
  {
    id: 'poste',
    accessorKey: 'poste',
    header: 'Poste',
  },
  {
    id: 'qte',
    accessorKey: 'qte',
    header: 'Quantité',
    meta: { thClass: 'text-right', tdClass: 'text-right whitespace-nowrap' },
    cell: ({ getValue }) => (
      <span className="tabular-nums text-foreground">
        {Number(getValue()).toLocaleString('fr-FR')}
      </span>
    ),
  },
  {
    id: 'charge',
    accessorKey: 'charge',
    header: 'Charge',
    meta: { thClass: 'text-right', tdClass: 'text-right whitespace-nowrap' },
    cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
  },
  {
    id: 'statut',
    accessorKey: 'statut',
    header: 'Statut',
    cell: ({ getValue }) => {
      const v = getValue() as OfRow['statut']
      return <Badge variant={STATUT_BADGE[v]}>{v}</Badge>
    },
  },
  {
    id: 'besoin',
    accessorKey: 'besoin',
    header: 'Besoin',
    meta: { thClass: 'whitespace-nowrap', tdClass: 'whitespace-nowrap' },
    cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span>,
  },
]

export function SurfacesSection() {
  const [sorting, setSorting] = useState<SortingState[]>([])

  return (
    <Section
      id="surfaces"
      n="14"
      title="Surfaces & tableaux"
      intro={
        <>
          La card et le tableau sont les deux objets déjà entièrement passés en grammaire Cursor.
          Ils fixent la référence : filet de 1 px en <Tok>box-shadow</Tok>, rayon 12 px, cellules à
          12 × 16 px, en-têtes en tertiaire non gras.
        </>
      }
    >
      <Fiche
        nom="Card"
        from="@r/components/ui/card"
        etat="cursor"
        note={
          <>
            Sous <Tok>.theme-cursor</Tok>, la card est réécrite intégralement : fond{' '}
            <Tok>#fcfcfc</Tok>, rayon 12 px, filet <Tok>--border-quaternary</Tok> en ombre, aucune
            bordure. Les props <Tok>padding</Tok> et <Tok>elevation</Tok> restent disponibles.
          </>
        }
      >
        <Grid min={240}>
          <Card padding="sm" className="border-0">
            <CardHeader>
              <CardTitle>OTIF</CardTitle>
              <CardDescription>Livraisons dans les délais</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mt-2 text-[28px] font-medium tracking-[-0.46px] tabular-nums">
                94,2 %
              </div>
            </CardContent>
          </Card>
          <Card padding="sm" className="border-0">
            <CardHeader>
              <CardTitle>Retard</CardTitle>
              <CardDescription>Lignes hors fenêtre</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mt-2 text-[28px] font-medium tracking-[-0.46px] tabular-nums text-destructive">
                18
              </div>
            </CardContent>
          </Card>
          <Card padding="sm" elevation="raised" className="border-0">
            <CardHeader>
              <CardTitle>Charge semaine</CardTitle>
              <CardDescription>elevation=&quot;raised&quot;</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mt-2 text-[28px] font-medium tracking-[-0.46px] tabular-nums">
                412 h
              </div>
            </CardContent>
            <CardFooter>
              <Button size="xs" variant="ghost">
                Ouvrir /charge
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        </Grid>
        <div className="mt-3 font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
          rounded-[12px] · bg #fcfcfc · shadow 0 0 0 1px mix(#141414 4%) · p-4
        </div>
      </Fiche>

      <Fiche
        nom="DataTable"
        from="@r/components/ui/data-table"
        etat="cursor"
        note={
          <>
            Markup TanStack inchangé — le skin est purement CSS, sous <Tok>.theme-cursor table</Tok>
            . Virtualisation activée par défaut (<Tok>@tanstack/react-virtual</Tok>) ;{' '}
            <Tok>virtualize=&#123;false&#125;</Tok> pour l’impression et les petits jeux.
          </>
        }
      >
        <Card padding="none" className="overflow-hidden border-0">
          <DataTable
            columns={ofColumns}
            rows={OF_ROWS}
            sorting={sorting}
            onSortingChange={setSorting}
            virtualize={false}
            tableClass="w-full min-w-[720px] border-collapse text-left"
            scrollContainerClass="overflow-auto rounded-none border-0 bg-transparent shadow-none"
            theadRowClass="bg-transparent"
            getRowClass={() => 'group/row'}
            getRowKey={(r) => r.of}
          />
        </Card>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Rule kind="do">
            Colonnes numériques alignées à droite en <Tok>tabular-nums</Tok> — c’est ce qui rend une
            colonne lisible en diagonale.
          </Rule>
          <Rule kind="dont">
            Zébrer les lignes. La séparation se fait par un filet quaternary ; le survol suffit à
            suivre la ligne.
          </Rule>
        </div>
      </Fiche>

      <Fiche
        nom="Tableau vide"
        from="prop emptyState"
        etat="cursor"
        note="Un tableau vide dit pourquoi il l'est et propose la sortie."
      >
        <Card padding="none" className="overflow-hidden border-0">
          <DataTable
            columns={ofColumns}
            rows={[]}
            sorting={[]}
            onSortingChange={() => {}}
            virtualize={false}
            tableClass="w-full min-w-[720px] border-collapse text-left"
            scrollContainerClass="overflow-auto rounded-none border-0 bg-transparent shadow-none"
            theadRowClass="bg-transparent"
            emptyState={
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Package className="size-5 text-[color-mix(in_oklab,#141414_36%,transparent)]" />
                <div className="text-[13px] font-medium text-[#141414]">
                  Aucun OF sur cette fenêtre
                </div>
                <div className="max-w-[320px] text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                  Élargissez la plage de dates ou retirez le filtre de poste.
                </div>
                <Button size="xs" variant="secondary" className="mt-1">
                  Réinitialiser les filtres
                </Button>
              </div>
            }
          />
        </Card>
      </Fiche>
    </Section>
  )
}

/* ── 15 Overlays ────────────────────────────────────────────── */

export function OverlaysSection() {
  return (
    <Section
      id="overlays"
      n="15"
      title="Overlays"
      intro={
        <>
          Quatre niveaux, empilés dans un ordre verrouillé : sheet (55/60) sous select et combobox
          (50, relevés à 62 depuis un sheet), eux-mêmes sous dialog et alerte (65/70). Une alerte
          ouverte depuis un panneau doit toujours passer au-dessus de lui.
        </>
      }
    >
      <Fiche
        nom="Dialog"
        from="@r/components/ui/dialog"
        etat="airbnb"
        note="Modale courte, largeur 440 px. Un titre, une description, deux actions au plus."
      >
        <Demo label="Dialog">
          <Dialog>
            <DialogTrigger render={<Button variant="secondary">Ouvrir un dialog</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Appliquer la fenêtre</DialogTitle>
                <DialogDescription>
                  Les KPI du dashboard seront recalculés sur la plage du 01/08/2026 au 11/08/2026.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">Annuler</Button>
                <Button>Appliquer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Demo>
      </Fiche>

      <Fiche
        nom="AlertDialog"
        from="@r/components/ui/alert-dialog"
        etat="airbnb"
        note="Réservé à l'irréversible. Le bouton de confirmation nomme l'action — jamais « OK »."
      >
        <Demo label="AlertDialog">
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="destructive">Supprimer la clé</Button>} />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer la clé API ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Action irréversible. Les intégrations qui utilisent cette clé cesseront de
                  fonctionner immédiatement.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction>Supprimer la clé</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Demo>
      </Fiche>

      <Fiche
        nom="Sheet"
        from="@r/components/ui/sheet"
        etat="airbnb"
        note="Panneau latéral pour le détail d'un objet — fiche article, engagement d'un poste. Quatre côtés d'ancrage."
      >
        <Demo label="Sheet" spec="side = right | left | top | bottom">
          <Sheet>
            <SheetTrigger render={<Button variant="secondary">Panneau droit</Button>} />
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>PP830 — Caisson VMC</SheetTitle>
                <SheetDescription>
                  Stock, couverture et OF rattachés sur les 14 prochains jours ouvrés.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <SpecTable
                  head={['Indicateur', 'Valeur']}
                  rows={[
                    ['Stock disponible', <span className="tabular-nums">1 240 u</span>],
                    ['Couverture', <span className="tabular-nums">6 jours</span>],
                    ['OF rattachés', <span className="tabular-nums">4</span>],
                  ]}
                />
              </div>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger render={<Button variant="outline">Panneau bas</Button>} />
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>Détail de la sélection</SheetTitle>
                <SheetDescription>Trois OF sélectionnés sur le board.</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>
        </Demo>
      </Fiche>

      <Fiche
        nom="Tooltip"
        from="@r/components/ui/tooltip"
        etat="airbnb"
        note={
          <>
            Précise, jamais indispensable : ce qui est nécessaire à la compréhension doit être
            visible. Exige un <Tok>TooltipProvider</Tok> en ancêtre.
          </>
        }
      >
        <Demo label="Tooltip" spec="side = top | right | bottom | left">
          <Tooltip>
            <TooltipTrigger render={<Button variant="outline">Survolez</Button>} />
            <TooltipContent>Recalculé à chaque rafraîchissement X3</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button size="icon-sm" variant="ghost" aria-label="Aide">
                  <Gauge />
                </Button>
              }
            />
            <TooltipContent side="right">Charge du poste sur la semaine</TooltipContent>
          </Tooltip>
        </Demo>
      </Fiche>
    </Section>
  )
}

/* ── 16 Navigation ──────────────────────────────────────────── */

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Tableau de bord', badge: null, active: true },
  { icon: Factory, label: 'Programme', badge: '12', active: false },
  { icon: Gauge, label: 'Charge', badge: null, active: false },
  { icon: AlertTriangle, label: 'Ruptures', badge: '3', active: false },
  { icon: Truck, label: 'Réceptions', badge: null, active: false },
]

export function NavigationSection() {
  const [seg, setSeg] = useState('tous')
  const [q, setQ] = useState('')

  return (
    <Section
      id="navigation"
      n="16"
      title="Navigation"
      intro={
        <>
          Le rail de gauche répond à « où suis-je », la barre d’outils à « que puis-je filtrer ».
          Les deux ne se mélangent jamais : aucun filtre dans la sidebar, aucune navigation dans la
          toolbar.
        </>
      }
    >
      <Fiche
        nom="Sidebar"
        from="@r/components/ui/sidebar"
        etat="cursor"
        note={
          <>
            Le fond <Tok>#f3f3f3</Tok> et l’item actif en wash 16 % sont déjà retargetés sous{' '}
            <Tok>.theme-cursor</Tok>. Exige <Tok>SidebarProvider</Tok> — déjà posé globalement par{' '}
            <Tok>layouts/app.tsx</Tok>.
          </>
        }
      >
        <SidebarProvider className="!min-h-0 block">
          <div
            data-sidebar="sidebar"
            className="w-[248px] rounded-[8px] p-2 shadow-[0_0_0_1px_color-mix(in_oklab,#141414_8%,transparent)]"
          >
            <SidebarGroup>
              <SidebarGroupLabel>Pilotage</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => (
                    <SidebarMenuItem key={item.label}>
                      <SidebarMenuButton isActive={item.active}>
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                    </SidebarMenuItem>
                  ))}
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        </SidebarProvider>
      </Fiche>

      <Fiche
        nom="Toolbar"
        from="@r/components/ui/toolbar"
        etat="airbnb"
        note="Segments, recherche, rafraîchissement. L'ordre est stable d'une page à l'autre : segments à gauche, actions à droite."
      >
        <Panel padding="sm">
          <Toolbar gap="2.5" py="2">
            <ToolbarGroup>
              <ToolbarSegmented>
                {['tous', 'retard', 'bloqués'].map((s) => (
                  <ToolbarSegment key={s} active={seg === s} onClick={() => setSeg(s)}>
                    {s}
                  </ToolbarSegment>
                ))}
              </ToolbarSegmented>
            </ToolbarGroup>
            <ToolbarSeparator />
            <ToolbarSearch value={q} onChange={setQ} placeholder="OF, article…" />
            <ToolbarSpacer />
            <ToolbarRefresh label="Actualiser" />
          </Toolbar>
        </Panel>
      </Fiche>

      <Fiche
        nom="DynamicIcon"
        from="@r/components/ui/dynamic-icon"
        etat="airbnb"
        note={
          <>
            Résout une ligature Material en <Tok>snake_case</Tok> vers une icône lucide. Clé
            inconnue → <Tok>CircleHelp</Tok> silencieux : une faute de frappe ne casse rien, elle se
            voit à l’écran.
          </>
        }
      >
        <Demo label="DynamicIcon">
          {['search', 'refresh', 'check_circle', 'warning', 'inventory_2', 'cle_inexistante'].map(
            (n) => (
              <span key={n} className="inline-flex items-center gap-1.5 text-[12px]">
                <DynamicIcon name={n} size={16} />
                <code className="font-mono text-[10px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
                  {n}
                </code>
              </span>
            )
          )}
        </Demo>
      </Fiche>
    </Section>
  )
}

/* ── 17 États ───────────────────────────────────────────────── */

export function EtatsSection() {
  return (
    <Section
      id="etats"
      n="17"
      title="États"
      intro={
        <>
          Une requête X3 se compte en secondes, pas en millisecondes : l’attente est la norme, pas
          l’exception. Le squelette est préférable au spinner dès que la forme du résultat est
          connue d’avance — il évite le saut de mise en page à l’arrivée des données.
        </>
      }
    >
      <Fiche
        nom="Spinner"
        from="@r/components/ui/spinner"
        etat="airbnb"
        note="Cinq tailles, cinq tons. Le seul élément de l'interface autorisé à s'animer en boucle."
      >
        <Grid min={280}>
          <Demo label="Tailles" spec="xs · sm · md · lg · xl">
            <Spinner size="xs" />
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <Spinner size="xl" />
          </Demo>
          <Demo label="Tons" spec="default · brand · muted · current">
            <Spinner variant="default" size="md" />
            <Spinner variant="brand" size="md" />
            <Spinner variant="muted" size="md" />
            <span className="text-[#2778c1]">
              <Spinner variant="current" size="md" />
            </span>
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="Skeleton"
        from="@r/components/ui/skeleton"
        etat="airbnb"
        note="Quatre formes prêtes : ligne, badge, graphe, carte. Le squelette doit avoir la taille exacte du contenu attendu."
      >
        <Grid min={280}>
          <Demo label="Primitives">
            <div className="flex w-full flex-col gap-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-20 w-full rounded-[12px]" />
            </div>
          </Demo>
          <Demo label="SkeletonRow · SkeletonBadge">
            <div className="flex w-full flex-col gap-3">
              <SkeletonRow count={3} />
              <div className="flex gap-2">
                <SkeletonBadge />
                <SkeletonBadge />
              </div>
            </div>
          </Demo>
          <Demo label="SkeletonChart">
            <div className="w-full">
              <SkeletonChart />
            </div>
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="LoadingState"
        from="@r/components/ui/loading-state"
        etat="airbnb"
        note="Attente pleine page, avec un titre qui dit ce qu'on attend. Variante orb réservée au copilote."
      >
        <Grid min={280}>
          <Demo label="Compact" align="center">
            <LoadingState title="Interrogation de X3…" compact />
          </Demo>
          <Demo label="Pleine page" align="center">
            <LoadingState
              title="Calcul de la faisabilité"
              description="Descente de nomenclature sur 4 niveaux — environ 20 s."
            />
          </Demo>
        </Grid>
      </Fiche>

      <Fiche
        nom="État vide"
        from="composition"
        etat="cursor"
        note="Pas un composant : une composition. Icône tertiaire, phrase qui explique, action qui débloque."
      >
        <Panel>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Search className="size-5 text-[color-mix(in_oklab,#141414_36%,transparent)]" />
            <div className="text-[13px] font-medium text-[#141414]">Aucune rupture détectée</div>
            <div className="max-w-[340px] text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
              Sur la fenêtre sélectionnée, tous les composants des OF fermes sont couverts par le
              stock ou par une réception attendue à temps.
            </div>
            <Button size="xs" variant="secondary" className="mt-1">
              Élargir à 30 jours
            </Button>
          </div>
        </Panel>
      </Fiche>
    </Section>
  )
}

/* ── 18 Conversation ────────────────────────────────────────── */

export function ConversationSection() {
  return (
    <Section
      id="conversation"
      n="18"
      title="Conversation"
      intro={
        <>
          Le copilote est en lecture seule : il explique, il ne décide pas. Ses réponses citent
          toujours la source (OF, article, requête), ce qui impose une bulle assez large pour
          contenir un tableau.
        </>
      }
    >
      <Fiche
        nom="Bubble"
        from="@r/components/ui/bubble"
        etat="airbnb"
        note="Sept tons, deux alignements. L'utilisateur à droite, le copilote à gauche — jamais l'inverse."
      >
        <Panel>
          <BubbleGroup>
            <Bubble variant="default" align="end">
              <BubbleContent>Pourquoi l’OF F126-44429 est-il bloqué ?</BubbleContent>
            </Bubble>
            <Bubble variant="muted" align="start">
              <BubbleContent>
                Il consomme 480 BDH60 équipées hygro. Le stock disponible est de 210 u et la
                prochaine réception est attendue le 19/08/2026, soit cinq jours après le besoin.
              </BubbleContent>
            </Bubble>
            <Bubble variant="tinted" align="start">
              <BubbleContent>
                Source : ORDERS WIPTYP=5, STOCK site AE1, POH réception 90 jours.
              </BubbleContent>
            </Bubble>
          </BubbleGroup>
        </Panel>
        <Demo label="Tons disponibles" className="mt-4">
          {(
            ['default', 'secondary', 'muted', 'tinted', 'outline', 'ghost', 'destructive'] as const
          ).map((v) => (
            <Bubble key={v} variant={v} align="start">
              <BubbleContent>{v}</BubbleContent>
            </Bubble>
          ))}
        </Demo>
      </Fiche>
    </Section>
  )
}

export { cn }
