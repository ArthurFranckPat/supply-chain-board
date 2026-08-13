import { useState } from 'react'
import {
  CalendarX,
  CircleCheck,
  CircleSlash,
  ClipboardCheck,
  Clock,
  OctagonX,
  TriangleAlert,
  Truck,
} from 'lucide-react'

import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import {
  CellDate,
  CellEvidence,
  CellNumber,
  CellStack,
  CellVerdict,
  TableCell,
  TableHead,
  TableHeadRow,
  TableRow,
  severityBarClass,
  type RowTone,
} from '@r/components/ui/table-row'
import { Card } from '@r/components/ui/card'
import { X3Link } from '@r/components/x3-link'

import { Caption, Demo, Fiche, Panel, Rule, Section, SpecTable, Sub, Tok } from './kit'

/**
 * Section 15 — Rangée de tableau.
 *
 * Le standard est tiré de la table proactive de /suivi et appliqué : les 25
 * tables du produit rendent la même rangée. L'inventaire en fin de section
 * n'est pas un programme de travail, c'est ce qui a été trouvé et corrigé — il
 * justifie chaque règle plutôt que de la décréter.
 */

/* ══ Données de démonstration — vocabulaire métier réel, valeurs inventées ══ */

interface DemoRow {
  commande: string
  client: string
  article: string
  designation: string
  qte: number
  dateExp: string
  relatif: string
  relatifTone: RowTone
  verdict: 'blocked' | 'late' | 'risk' | 'time'
  severite: RowTone
  preuve: { icon: typeof Truck; texte: string; tone: RowTone } | null
}

const VERDICTS = {
  blocked: { icon: OctagonX, label: 'Bloquée', tone: 'text-destructive' },
  late: { icon: Clock, label: 'Retard', tone: 'text-suggere' },
  risk: { icon: TriangleAlert, label: 'À risque', tone: 'text-suggere' },
  time: { icon: CircleCheck, label: 'À l’heure', tone: 'text-ferme' },
} as const

const ROWS: DemoRow[] = [
  {
    commande: 'SOAE1-24118',
    client: 'ALDES DISTRIBUTION SUD-EST',
    article: 'BDH60-HYGRO',
    designation: 'Bouche double hygro Ø60 — module hygrostat',
    qte: 480,
    dateExp: '04/08/2026',
    relatif: 'Retard 8 j',
    relatifTone: 'critical',
    verdict: 'blocked',
    severite: 'critical',
    preuve: { icon: TriangleAlert, texte: 'En retard +6 j (18/08/2026)', tone: 'critical' },
  },
  {
    commande: 'SOAE1-24203',
    client: 'BOUYGUES BÂTIMENT IDF',
    article: 'PP830-MOD',
    designation: 'Module de raccordement PP 830',
    qte: 120,
    dateExp: '13/08/2026',
    relatif: 'Demain',
    relatifTone: 'info',
    verdict: 'risk',
    severite: 'warning',
    preuve: { icon: Truck, texte: 'Arrivée 13/08/2026 · POAE1-8841', tone: null },
  },
  {
    commande: 'SOAE1-24217',
    client: 'SPIE FACILITIES',
    article: 'CAI-EASYHOME',
    designation: 'Caisson EasyHOME Compact Premium SP',
    qte: 36,
    dateExp: '19/08/2026',
    relatif: 'Dans 7 j',
    relatifTone: null,
    verdict: 'time',
    severite: null,
    preuve: null,
  },
]

/* ══ Démo 1 — la rangée canonique, tous les rôles présents ══ */

function RangeeCanonique() {
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'dateExp', desc: false }])

  const columns: ColumnDef<DemoRow>[] = [
    {
      accessorKey: 'commande',
      header: 'Commande · Client',
      cell: ({ row }) => (
        <CellStack
          code={row.original.commande}
          label={row.original.client}
          action={
            <X3Link
              fonction="GESSOH"
              cle={row.original.commande}
              iconOnly
              title={`Ouvrir ${row.original.commande} dans Sage X3`}
              className="align-middle text-muted-foreground hover:text-brand"
            />
          }
        />
      ),
      meta: { thClass: 'w-[190px]' },
    },
    {
      accessorKey: 'article',
      header: 'Article · Désignation',
      cell: ({ row }) => <CellStack code={row.original.article} label={row.original.designation} />,
      meta: { thClass: 'w-[210px]' },
    },
    {
      accessorKey: 'qte',
      header: 'Qté',
      cell: ({ row }) => <CellNumber value={row.original.qte} title="unités" />,
      meta: { thClass: 'w-[80px] text-right!', tdClass: 'text-right' },
    },
    {
      accessorKey: 'dateExp',
      header: 'Expé',
      cell: ({ row }) => (
        <CellDate
          date={row.original.dateExp}
          relative={row.original.relatif}
          tone={row.original.relatifTone}
        />
      ),
      meta: { thClass: 'w-[110px]' },
    },
    {
      id: 'verdict',
      header: 'Verdict',
      enableSorting: false,
      cell: ({ row }) => {
        const v = VERDICTS[row.original.verdict]
        return <CellVerdict icon={v.icon} label={v.label} tone={v.tone} />
      },
      meta: { thClass: 'w-[120px]' },
    },
    {
      id: 'preuve',
      header: 'Couverture',
      enableSorting: false,
      cell: ({ row }) => {
        const p = row.original.preuve
        if (!p) return <span className="text-2xs text-muted-foreground">—</span>
        return (
          <CellEvidence icon={p.icon} tone={p.tone}>
            {p.texte}
          </CellEvidence>
        )
      },
      meta: { thClass: 'w-[200px]' },
    },
  ]

  return (
    <Card padding="none" className="overflow-hidden border-0">
      <DataTable
        columns={columns}
        rows={ROWS}
        sorting={sorting}
        onSortingChange={setSorting}
        virtualize={false}
        getRowKey={(r) => r.commande}
        indexColumn={{
          headerLabel: 'N°',
          thClass: 'w-[38px]',
          tdClass: (r) =>
            `font-sans font-bold tracking-tight tabular-nums ${severityBarClass(r.severite)}`,
        }}
        tableClass="w-full min-w-[900px] table-fixed border-collapse"
        scrollContainerClass="overflow-auto rounded-none border-0 bg-transparent shadow-none"
        theadRowClass="bg-transparent"
      />
    </Card>
  )
}

/* ══ Démo 2 — les quatre états de la rangée ══ */

function EtatsRangee() {
  return (
    <table className="w-full min-w-[420px] border-collapse text-left text-sm">
      <thead>
        <TableHeadRow>
          <TableHead className="w-[38px]">N°</TableHead>
          <TableHead>Article</TableHead>
          <TableHead align="right">Qté</TableHead>
          <TableHead>État</TableHead>
        </TableHeadRow>
      </thead>
      <tbody>
        <TableRow>
          <TableCell className="font-sans font-bold tabular-nums">01</TableCell>
          <TableCell>
            <CellStack code="CAI-EASYHOME" label="Repos" />
          </TableCell>
          <TableCell align="right">
            <CellNumber value={36} />
          </TableCell>
          <TableCell className="text-2xs text-muted-foreground">filet seul</TableCell>
        </TableRow>
        <TableRow tone="warning">
          <TableCell className="font-sans font-bold tabular-nums">02</TableCell>
          <TableCell>
            <CellStack code="PP830-MOD" label="Gravité — attention" />
          </TableCell>
          <TableCell align="right">
            <CellNumber value={120} tone="warning" />
          </TableCell>
          <TableCell className="text-2xs text-muted-foreground">
            <Tok>tone=&quot;warning&quot;</Tok>
          </TableCell>
        </TableRow>
        <TableRow tone="critical">
          <TableCell className="font-sans font-bold tabular-nums">03</TableCell>
          <TableCell>
            <CellStack code="BDH60-HYGRO" label="Gravité — alerte" />
          </TableCell>
          <TableCell align="right">
            <CellNumber value={480} tone="critical" />
          </TableCell>
          <TableCell className="text-2xs text-muted-foreground">
            <Tok>tone=&quot;critical&quot;</Tok>
          </TableCell>
        </TableRow>
        <TableRow selected clickable>
          <TableCell className="font-sans font-bold tabular-nums">04</TableCell>
          <TableCell>
            <CellStack code="BDH60-STD" label="Sélectionnée (détail ouvert)" />
          </TableCell>
          <TableCell align="right">
            <CellNumber value={64} />
          </TableCell>
          <TableCell className="text-2xs text-muted-foreground">
            <Tok>selected</Tok>
          </TableCell>
        </TableRow>
      </tbody>
    </table>
  )
}

/* ══ Démo 3 — la preuve en sous-ligne ══ */

function Preuves() {
  return (
    <div className="flex flex-col gap-1.5">
      <CellEvidence icon={Truck}>Arrivée 13/08/2026 · POAE1-8841</CellEvidence>
      <CellEvidence icon={TriangleAlert} tone="critical">
        En retard +6 j (18/08/2026)
      </CellEvidence>
      <CellEvidence icon={CircleSlash}>
        Bloqué par <span className="font-bold text-foreground">80001</span>{' '}
        <span className="font-bold text-muted-foreground">−240</span>
      </CellEvidence>
      <CellEvidence icon={ClipboardCheck}>
        dont <span className="font-bold text-foreground">48</span> en statut Q (contrôle réception)
      </CellEvidence>
      <CellEvidence icon={CalendarX}>Aucune couverture prévue</CellEvidence>
    </div>
  )
}

/* ══ Section ══ */

export function TableRowSection() {
  return (
    <Section
      id="table-row"
      n="15"
      title="Rangée de tableau"
      intro={
        <>
          Le produit rend <strong>25 tables</strong> sur 14 écrans, et la rangée y existait en{' '}
          <strong>quatre grammaires concurrentes</strong> : celle du <Tok>DataTable</Tok>, une
          chaîne recopiée telle quelle dans <strong>11 fichiers</strong>, le HTML à la main des
          tables statiques, et une couche CSS sous <Tok>.theme-cursor</Tok> qui écrase les trois
          autres — mais sur 5 pages seulement. Les deux premières se superposaient — <Tok>cn()</Tok>{' '}
          est un tailwind-merge, <Tok>border-t</Tok> et <Tok>border-b</Tok> ne sont pas le même
          groupe : ces 11 tables portaient un filet <em>en haut et en bas</em>, soit un double trait
          entre deux lignes voisines. Elles zébraient aussi leurs lignes, ce que la section 14
          interdit depuis qu’elle existe. Le modèle retenu est la table proactive de{' '}
          <Tok>/suivi</Tok>, la seule où chaque décision avait été prise puis vérifiée au
          navigateur.
        </>
      }
    >
      <Sub
        title="Anatomie"
        hint="Une rangée, cinq décisions. Elles se tiennent : retirer la barre de gravité oblige à teinter le fond, et le fond entre en concurrence avec le survol."
      />
      <Panel className="mb-4">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Regle
            n="01"
            titre="Séparer par un filet"
            role="Un hairline quaternary sous la rangée, et le survol pour la suivre. Jamais de zébrure : elle occupe le canal du fond, qui sert déjà à la sélection."
          />
          <Regle
            n="02"
            titre="La gravité au bord"
            role="Une barre de 3 px sur la première cellule. Un fond teinté sur toute la largeur colore la moitié du tableau — sur un écran où le retard est la norme, une couleur partout n’est plus un signal."
          />
          <Regle
            n="03"
            titre="Empiler l’identité"
            role="Code métier en chasse fixe, jamais tronqué ; libellé secondaire en dessous, tronqué toujours. Sur une seule ligne, le navigateur coupe dans le code."
          />
          <Regle
            n="04"
            titre="Coder par la forme"
            role="Le verdict porte une icône dont la SILHOUETTE le distingue. La couleur double l’information, elle ne la porte pas seule."
          />
        </div>
      </Panel>

      <Fiche
        nom="TableRow"
        from="@r/components/ui/table-row"
        etat="cursor"
        note={
          <>
            La rangée canonique, rendue par le <Tok>DataTable</Tok> — qui tire ses classes de ce
            module, et ne laisse donc plus rien à redire à ses appelants. La première ligne est
            bloquée, la deuxième à risque : leur gravité se lit au bord gauche avant même
            d’atteindre la colonne Verdict.
          </>
        }
      >
        <Demo spec="TableRow › indexColumn(severityBarClass) · CellStack · CellNumber · CellDate · CellVerdict · CellEvidence">
          <div className="w-full min-w-0 overflow-x-auto">
            <RangeeCanonique />
          </div>
        </Demo>

        <Sub
          title="Les quatre états"
          hint="Repos, gravité, sélection. Rien d’autre — et ils ne se superposent jamais sur le même canal visuel."
          className="mt-6"
        />
        <Demo>
          <div className="w-full min-w-0 overflow-x-auto">
            <EtatsRangee />
          </div>
        </Demo>
      </Fiche>

      <Fiche
        nom="CellEvidence"
        from="@r/components/ui/table-row"
        etat="cursor"
        note={
          <>
            La preuve sous la donnée qu’elle explique : pourquoi cette ligne est bloquée, ce qui
            arrive et quand. Toujours sous sa valeur, jamais dans une colonne à elle — une colonne «
            raison » se lit une fois puis devient du bruit sur les lignes qui vont bien.
          </>
        }
      >
        <Demo spec="icône 11 px · mono 9 px · ton critique = gras destructif">
          <Preuves />
        </Demo>
      </Fiche>

      <Sub
        title="Géométrie"
        hint="Un seul padding, un seul filet. Cinq paddings sur cinq écrans se lisent comme un défaut d’alignement, jamais comme une convention."
        className="mt-8"
      />
      <Panel padding="none" className="mb-4">
        <SpecTable
          head={['Élément', 'Avant', 'Standard']}
          rows={[
            [
              <Tok key="a">th</Tok>,
              '4 recettes : mono 9 px capitales / sans 10 px / xs medium / mono 10 px capitales',
              'px-4 py-3 · sans xs normal · tracking-wider · pas de capitales',
            ],
            [
              <Tok key="b">td</Tok>,
              '5 paddings : py-2, py-[9px], py-[7px], py-[5px], py-1.5',
              'px-4 py-3 · align-top',
            ],
            [
              <Tok key="c">tr</Tok>,
              'border-t ET border-b superposés · zébrure 1,5 %',
              'border-b rule-soft · hover muted/50 · pas de zébrure',
            ],
            [
              'Filet d’en-tête',
              <span key="d">
                <Tok>border-b</Tok> nu, couleur héritée
              </span>,
              <span key="e">
                <Tok>border-rule</Tok> — plus marqué que l’inter-ligne
              </span>,
            ],
            [
              'Gravité',
              'fonds à 4 / 5 / 6 / 10 / 15 % selon l’écran',
              'barre inset de 3 px sur la 1ʳᵉ cellule',
            ],
            [
              <Tok key="f">group/row</Tok>,
              'déclaré au cas par cas (5 copies), sans aucun consommateur',
              'toujours posé — point d’ancrage disponible, encore inutilisé',
            ],
          ]}
        />
      </Panel>

      <Sub
        title="Le doublon qu’il faut connaître"
        hint="Ces valeurs sont écrites à deux endroits, et rien ne le vérifie."
        className="mt-8"
      />
      <Panel className="mb-4">
        <p className="max-w-[620px] text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
          Sous <Tok>.theme-cursor</Tok>, une couche CSS d’<Tok>app.css</Tok> redéclare{' '}
          <Tok>table th</Tok> et <Tok>table td</Tok> en sélecteur d’élément, avec des{' '}
          <Tok>!important</Tok> sur les couleurs, les bordures et les fonds de rangée. Elle{' '}
          <strong>gagne</strong> sur les utilitaires de <Tok>ui/table-row</Tok>. Deux conséquences
          qu’on ne devine pas en lisant le TSX :
        </p>
        <ul className="mt-3 flex max-w-[620px] flex-col gap-2 text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
          <li>
            • C’est cette couche qui masquait le défaut. Sur les 5 pages en thème cursor,{' '}
            <Tok>border-top: 0</Tok> et <Tok>background-color: transparent</Tok> effaçaient le
            double filet et la zébrure. Les 9 autres pages, elles, les rendaient vraiment — le même
            code produisait deux tableaux différents.
          </li>
          <li>
            • <Tok>.theme-cursor table th</Tok> pose <Tok>text-align: left</Tok> à une spécificité
            qu’une classe seule n’atteint pas. Un en-tête aligné à droite s’écrit{' '}
            <Tok>text-right!</Tok> — pas par goût, par nécessité.
          </li>
        </ul>
        <p className="mt-3 max-w-[620px] text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
          Les deux recettes portent donc les mêmes valeurs, tenues à la main. Modifier l’une sans
          l’autre fabrique un écran qui rend autrement que ce que cette page annonce, et rien ne le
          signalera.
        </p>
      </Panel>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Poser la gravité sur le bord gauche et laisser le fond à la sélection. Deux signaux, deux
          canaux : ils restent lisibles ensemble.
        </Rule>
        <Rule kind="dont">
          Teinter le fond d’une rangée pour dire qu’elle va mal. Le survol l’efface, la sélection
          entre en conflit, et à 40 % de lignes en retard la couleur ne signale plus rien.
        </Rule>
      </div>

      <Sub
        title="Ce que la dérive avait produit"
        hint="Relevé sur les 25 tables avant standardisation. Chaque ligne est la raison d’être d’une règle ci-dessus."
      />
      <Panel padding="none">
        <SpecTable
          head={['Constat', 'Ampleur', 'Détail']}
          rows={[
            [
              'Grammaires de rangée concurrentes',
              '4',
              <span key="a">
                <Tok>DataTable</Tok> · une chaîne recopiée 11 fois · HTML à la main (5 écrans) ·
                couche CSS <Tok>.theme-cursor</Tok> (5 pages)
              </span>,
            ],
            [
              'Même code, deux rendus',
              '5 pages contre 9',
              'la couche cursor effaçait double filet et zébrure ; les pages en thème Airbnb les rendaient',
            ],
            [
              'Filet du haut ET du bas sur la même rangée',
              '11 tables',
              <span key="b">
                <Tok>border-t</Tok> ajouté par-dessus le <Tok>border-b</Tok> du DataTable —
                tailwind-merge ne les arbitre pas
              </span>,
            ],
            [
              'Zébrure malgré la règle de la section 14',
              '11 tables',
              <span key="c">
                <Tok>even:bg-foreground/[0.015]</Tok>, recopié à l’identique
              </span>,
            ],
            [
              'Gravité rendue en fond de ligne',
              '6 écrans',
              'expéditions, conditionnements, impressions, détail OF, séquenceur, grille appro',
            ],
            [
              'Recettes d’en-tête',
              '4',
              'dont deux en capitales, illisibles à 9 px sur des groupes nominaux',
            ],
            [
              'Paddings de cellule',
              '5',
              <span key="d">
                <Tok>py-[9px]</Tok>, <Tok>py-[7px]</Tok> et <Tok>py-[5px]</Tok> — trois valeurs
                arbitraires hors de l’échelle
              </span>,
            ],
            [
              'Constantes TH/TD locales',
              '4 jeux',
              <span key="e">
                <Tok>shortage-math</Tok>, <Tok>camion-detail-sheet</Tok>,{' '}
                <Tok>jour-detail-sheet</Tok>, <Tok>conditionnements-views</Tok>
              </span>,
            ],
            [
              'Statut codé par la couleur seule',
              '3 écrans',
              'pastille de 6 px sur /suivi réactif, pilules pleines sur le cockpit poste et /appro',
            ],
            [
              'Filets en hexadécimal codé en dur',
              '2 écrans',
              <span key="f">
                <Tok>#ebebeb</Tok> et <Tok>#f2f2f0</Tok> sur /approvisionnements, hors tokens
              </span>,
            ],
          ]}
        />
      </Panel>
      <Caption className="mt-3">25 tables · 14 écrans · les 3 grammaires ramenées à 1</Caption>
    </Section>
  )
}

/** Carte de règle numérotée (anatomie de la rangée). */
function Regle({ n, titre, role }: { n: string; titre: string; role: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-medium tabular-nums text-[color-mix(in_oklab,#141414_36%,transparent)]">
          {n}
        </span>
        <span className="text-[13px] font-medium tracking-[-0.08px] text-[#141414]">{titre}</span>
      </div>
      <p className="text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
        {role}
      </p>
    </div>
  )
}
