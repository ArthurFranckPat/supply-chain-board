import { useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Printer, Wand2 } from 'lucide-react'

import {
  Toolbar,
  ToolbarGroup,
  ToolbarSegmented,
  ToolbarSegment,
  ToolbarSearch,
  ToolbarRefresh,
  ToolbarSpacer,
  ToolbarDateWindow,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarFilterChip,
  ToolbarMetric,
} from '@r/components/ui/toolbar'
import { Pill } from '@r/components/ui/pill'
import { Separator } from '@r/components/ui/separator'

import { Caption, Demo, Fiche, Panel, Rule, Section, SpecTable, Sub, Tok } from './kit'

/**
 * Section 17 — Barre d'outils.
 *
 * Proposition de standard, soumise à critique. L'inventaire des 17 pages est
 * dans la dernière sous-section : il justifie chaque règle plutôt que de la
 * décréter. Tant que le standard n'est pas validé, aucune page n'a été
 * refondue — seules les primitives manquantes ont été ajoutées à
 * `@r/components/ui/toolbar`.
 */

const AUJ = new Date()
const DANS_7_J = new Date(AUJ.getFullYear(), AUJ.getMonth(), AUJ.getDate() + 7)

/* ══ Démo 1 — la rangée canonique, tous les rôles présents ══ */

function ToolbarCanonique() {
  const [vue, setVue] = useState<'reactif' | 'proactif'>('proactif')
  const [range, setRange] = useState<DayPickerRange | undefined>({ from: AUJ, to: DANS_7_J })
  const [q, setQ] = useState('')
  const [verdict, setVerdict] = useState<string | null>(null)
  const [types, setTypes] = useState<Set<string>>(new Set(['MTS', 'MTO', 'NOR']))
  const [chargement, setChargement] = useState(false)

  const toggleType = (t: string) =>
    setTypes((prev) => {
      const n = new Set(prev)
      n.has(t) ? n.delete(t) : n.add(t)
      return n
    })

  const actifs = (verdict ? 1 : 0) + (types.size < 3 ? 1 : 0)

  return (
    <Toolbar className="rounded-[8px] border-b-0 px-6 py-2 min-h-[48px] flex-nowrap shadow-[0_0_0_1px_color-mix(in_oklab,#141414_6%,transparent)]">
      <ToolbarGroup>
        <ToolbarSegmented>
          <ToolbarSegment active={vue === 'reactif'} onClick={() => setVue('reactif')}>
            Réactif
          </ToolbarSegment>
          <ToolbarSegment active={vue === 'proactif'} onClick={() => setVue('proactif')}>
            Proactif
          </ToolbarSegment>
        </ToolbarSegmented>

        <ToolbarDateWindow value={range} onCommit={setRange} />

        <ToolbarFilterMenu activeCount={actifs}>
          <ToolbarFilterSection>Verdict</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            {(
              [
                ['blocked', 'Bloquée', 'critical', 174],
                ['uncov', 'Sans couverture', 'critical', 40],
                ['late', 'Retard', 'warning', 5],
                ['risk', 'À risque', 'warning', 23],
              ] as const
            ).map(([k, l, tone, n]) => (
              <ToolbarFilterChip
                key={k}
                label={l}
                count={n}
                tone={tone}
                active={verdict === k}
                onClick={() => setVerdict(verdict === k ? null : k)}
              />
            ))}
          </ToolbarSegmented>
          <Separator className="my-2" />
          <ToolbarFilterSection>Type</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full">
            {['MTS', 'MTO', 'NOR'].map((t) => (
              <ToolbarSegment key={t} active={types.has(t)} onClick={() => toggleType(t)}>
                {t}
              </ToolbarSegment>
            ))}
          </ToolbarSegmented>
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarSearch value={q} onChange={setQ} placeholder="Commande, article, composant…" />
      <ToolbarMetric emphasis>
        12 <span className="font-normal text-muted-foreground">/ 675</span>
      </ToolbarMetric>
      <ToolbarMetric title="Données chargées à 14:32:07 · durée 320ms">14:32</ToolbarMetric>
      <ToolbarRefresh
        loading={chargement}
        onClick={() => {
          setChargement(true)
          window.setTimeout(() => setChargement(false), 900)
        }}
      />
    </Toolbar>
  )
}

/* ══ Démo 2 — /receptions recomposée ══ */

function ToolbarReceptions() {
  const [vue, setVue] = useState('tableau')
  const [range, setRange] = useState<DayPickerRange | undefined>({ from: AUJ, to: DANS_7_J })
  const [q, setQ] = useState('')

  return (
    <Toolbar className="rounded-[8px] border-b-0 px-6 py-2 min-h-[48px] flex-nowrap shadow-[0_0_0_1px_color-mix(in_oklab,#141414_6%,transparent)]">
      <ToolbarGroup>
        <ToolbarSegmented>
          {['tableau', 'charge', 'board'].map((v) => (
            <ToolbarSegment key={v} active={vue === v} onClick={() => setVue(v)}>
              {v === 'tableau' ? 'Tableau' : v === 'charge' ? 'Charge' : 'Board'}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>
        <ToolbarDateWindow value={range} onCommit={setRange} />
        <ToolbarFilterMenu activeCount={2}>
          <ToolbarFilterSection>Criticité</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            <ToolbarFilterChip label="Critiques" count={9} tone="critical" active />
            <ToolbarFilterChip label="En retard" count={31} tone="warning" />
          </ToolbarSegmented>
          <Separator className="my-2" />
          <ToolbarFilterSection>Regroupement</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full">
            <ToolbarSegment active>Jour</ToolbarSegment>
            <ToolbarSegment>Fournisseur</ToolbarSegment>
          </ToolbarSegmented>
        </ToolbarFilterMenu>
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarSearch value={q} onChange={setQ} placeholder="Article, fournisseur…" />
      <ToolbarMetric title="Données chargées à 14:28:41 · durée 1.2s">14:28</ToolbarMetric>
      <Pill size="sm" variant="outline" className="gap-1.5">
        <Printer size={13} strokeWidth={1.75} />
        Imprimer
      </Pill>
      <ToolbarRefresh />
    </Toolbar>
  )
}

/* ══ Démo 3 — /sequenceur recomposée (ni fenêtre, ni actualisation) ══ */

function ToolbarSequenceur() {
  const [q, setQ] = useState('')
  const [atelier, setAtelier] = useState('S3P')

  return (
    <Toolbar className="rounded-[8px] border-b-0 px-6 py-2 min-h-[48px] flex-nowrap shadow-[0_0_0_1px_color-mix(in_oklab,#141414_6%,transparent)]">
      <ToolbarGroup>
        <ToolbarSegmented>
          {['S3P', 'S4P', 'S9P'].map((a) => (
            <ToolbarSegment key={a} active={atelier === a} onClick={() => setAtelier(a)}>
              {a}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>
        <ToolbarFilterMenu activeCount={3}>
          <ToolbarFilterSection>Poste</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            <ToolbarSegment active>PF</ToolbarSegment>
            <ToolbarSegment>S-E</ToolbarSegment>
          </ToolbarSegmented>
          <Separator className="my-2" />
          <ToolbarFilterSection>Faisabilité</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            <ToolbarSegment active>Faisable</ToolbarSegment>
            <ToolbarSegment active>Partiel</ToolbarSegment>
            <ToolbarSegment>Bloqué</ToolbarSegment>
          </ToolbarSegmented>
        </ToolbarFilterMenu>
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarSearch value={q} onChange={setQ} placeholder="OF, article…" />
      <Pill size="sm" variant="outline" className="gap-1.5">
        <Wand2 size={13} strokeWidth={1.75} />
        Faisabilité
      </Pill>
    </Toolbar>
  )
}

/* ══ Anatomie ══ */

function Zone({ n, titre, role }: { n: string; titre: string; role: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] tabular-nums text-[color-mix(in_oklab,#141414_36%,transparent)]">
          {n}
        </span>
        <span className="text-[13px] font-medium tracking-[-0.08px] text-[#141414]">{titre}</span>
      </div>
      <p className="mt-0.5 text-[12px] leading-[16px] text-[color-mix(in_oklab,#141414_60%,transparent)]">
        {role}
      </p>
    </div>
  )
}

export function ToolbarSection() {
  return (
    <Section
      id="toolbar"
      n="17"
      title="Barre d'outils"
      intro={
        <>
          Proposition de standard, soumise à validation. Aujourd'hui 17 pages portent une barre de
          contrôles et il en existe <strong>deux familles concurrentes</strong> :{' '}
          <Tok>vision/toolbar</Tok> (14 pages) et <Tok>ui/toolbar</Tok> (1 page). Le champ de
          recherche est recopié à la main 9 fois en 6 largeurs différentes, l'action « actualiser »
          existe en 4 mécanismes, le conteneur en 3 paddings, et le déclencheur de filtres en 2
          implémentations d'accessibilité. Rien de tout cela n'est un choix : c'est de la dérive.
        </>
      }
    >
      <Sub
        title="Anatomie"
        hint="Une seule rangée, quatre zones, un ordre non négociable — gauche = ce qu'on regarde, droite = ce qu'on en fait."
      />
      <Panel className="mb-4">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Zone
            n="01"
            titre="Portée"
            role="Ce que la page montre : bascule de vue, puis fenêtre de dates. Toujours en premier, toujours dans cet ordre."
          />
          <Zone
            n="02"
            titre="Filtres"
            role="Un déclencheur unique, et rien d'autre. TOUT ce qui filtre vit dessous — verdicts, statuts, types, ateliers. Le nombre d'actifs est porté par le déclencheur."
          />
          <Zone
            n="03"
            titre="Interrogation"
            role="La recherche, ancrée à droite. Jamais consolidée derrière un clic : ce n'est pas un filtre secondaire."
          />
          <Zone
            n="04"
            titre="État et actions"
            role="Compteur filtré, fraîcheur du chargement, actualiser, puis les actions. Lecture d'abord, gestes ensuite."
          />
        </div>
      </Panel>

      <Fiche
        nom="Toolbar"
        from="@r/components/ui/toolbar"
        etat="cursor"
        note={
          <>
            La rangée canonique. Cinq contrôles, pas un de plus : ce qu'on regarde à gauche, ce
            qu'on en fait à droite, et tout le filtrage replié derrière un seul déclencheur.
            Ouvrez-le : les chips y portent leur gravité et leur volume, ce que trois pills dans la
            rangée disaient moins bien en prenant quatre fois la place.
          </>
        }
      >
        <Demo spec="Toolbar › ToolbarGroup(ToolbarSegmented · ToolbarDateWindow · ToolbarFilterMenu) › ToolbarSpacer › ToolbarSearch · ToolbarMetric×2 · ToolbarRefresh">
          <div className="w-full min-w-0 overflow-x-auto">
            <ToolbarCanonique />
          </div>
        </Demo>

        <Sub
          title="La grammaire tient les cas réels"
          hint="Deux pages recomposées sans rien inventer — les rôles absents disparaissent, l'ordre ne bouge pas."
          className="mt-6"
        />
        <div className="flex flex-col gap-4">
          <Demo
            label="/receptions — action d'impression en zone 04"
            spec="la fenêtre passe APRÈS la bascule de vue : aujourd'hui l'inverse (receptions.tsx:230)"
          >
            <div className="w-full min-w-0 overflow-x-auto">
              <ToolbarReceptions />
            </div>
          </Demo>
          <Demo
            label="/sequenceur — ni fenêtre de dates ni actualisation"
            spec="5 contrôles permanents consolidés en 1 déclencheur ; l'action primaire reste en zone 04, après la recherche"
          >
            <div className="w-full min-w-0 overflow-x-auto">
              <ToolbarSequenceur />
            </div>
          </Demo>
        </div>
      </Fiche>

      <Sub
        title="Géométrie"
        hint="Une hauteur unique. Quatre hauteurs sur une même ligne se lisent comme un défaut d'alignement, jamais comme une convention."
        className="mt-8"
      />
      <Panel padding="none" className="mb-4">
        <SpecTable
          head={['Élément', 'Aujourd’hui (cursor)', 'Standard', 'Écart à combler']}
          rows={[
            [
              <Tok key="a">Toolbar</Tok>,
              'px-4 / px-5 / px-7 selon la page',
              'px-6 · py-2 · min-h-48px',
              'aligner sur l’axe du TopBar (px-6) et du contenu',
            ],
            [<Tok key="b">ToolbarSegment</Tok>, '20 px · r4', '20 px · r4', '—'],
            [<Tok key="c">ToolbarSegmented</Tok>, '24 px · r6', '24 px · r6', '—'],
            [<Tok key="d">Pill</Tok>, '24 px · r6', '24 px · r6', '—'],
            [
              <Tok key="e">toolbar-pill (vision)</Tok>,
              '28 px · r6',
              'à supprimer',
              'seule géométrie divergente restante',
            ],
            [
              <Tok key="f">ToolbarSearch</Tok>,
              '24 px · r6',
              '24 px · r6',
              'largeur d’input à figer (6 valeurs en circulation)',
            ],
            [<Tok key="g">ToolbarRefresh</Tok>, '24 px · r6', '24 px · r6', '—'],
            ['Gap intra-groupe', 'gap-1.5 (6 px)', 'gap-1.5', '—'],
            ['Gap inter-groupe', 'gap-2.5 (10 px)', 'gap-2.5', '—'],
            [
              'Nombre de contrôles',
              'jusqu’à 8 dans la rangée',
              '5 au plus',
              'tout filtre supplémentaire descend dans le panneau, pas à côté',
            ],
          ]}
        />
      </Panel>
      <Sub
        title="Hiérarchie chromatique"
        hint="Trois niveaux, pas un de plus. Une rangée monochrome met tout à égalité ; une rangée bariolée aussi."
        className="mt-8"
      />
      <Panel padding="none" className="mb-3">
        <SpecTable
          head={['Niveau', 'Ce qu’il porte', 'Traitement', 'Pourquoi']}
          rows={[
            [
              <span key="1" className="font-medium text-[#141414]">
                Encre
              </span>,
              'Ce que la page montre en ce moment : le segment actif',
              'pouce #fcfcfc élevé sur piste creusée, texte #141414',
              'le seul état que l’œil doit trouver sans chercher',
            ],
            [
              <span key="2" style={{ color: '#cd4500', fontWeight: 500 }}>
                Marque
              </span>,
              'Un contrôle engagé : la vue est filtrée',
              'fond #f54e00 à 10 %, filet à 26 %, encre #cd4500',
              'change la lecture de tout ce qui est en dessous — c’est le seul avertissement qui compte dans la rangée',
            ],
            [
              <span key="3" style={{ color: 'color-mix(in oklab, #141414 60%, transparent)' }}>
                Tertiaire
              </span>,
              'Ce qui se lit sans agir : compteurs, durées, segments au repos',
              '#141414 à 60 %, mono, tabulaire',
              'un chiffre ne réclame pas d’attention, il attend qu’on le cherche',
            ],
            [
              <span key="4" className="text-[#be1744]">
                Gravité
              </span>,
              'La sévérité d’un palier — uniquement DANS le panneau',
              'point de 6 px : destructive, suggere, ferme',
              'dans la rangée, quatre couleurs de statut annulent les trois niveaux ci-dessus',
            ],
          ]}
        />
      </Panel>
      <p className="mb-4 max-w-[620px] text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
        Le segment actif était rendu par un lavis gris plus sombre que sa piste blanche : l'état
        sélectionné se lisait comme un creux, pas comme un relief. La piste est maintenant creusée
        et le pouce élevé — la hiérarchie passe par l'élévation, comme partout ailleurs dans le
        thème, et la marque reste disponible pour la seule chose qui la mérite.
      </p>

      <Sub
        title="Les neuf rôles"
        hint="Inventoriés sur les 17 pages. Un rôle = un composant = une zone. Rien d’autre n’entre dans la rangée."
        className="mt-8"
      />
      <Panel padding="none" className="mb-4">
        <SpecTable
          head={['Rôle', 'Composant', 'Zone', 'Pages concernées']}
          rows={[
            ['Bascule de vue', <Tok key="1">ToolbarSegmented</Tok>, '01', '9'],
            ['Fenêtre de dates', <Tok key="2">ToolbarDateWindow</Tok>, '01', '5'],
            ['Filtres secondaires', <Tok key="3">ToolbarFilterMenu</Tok>, '02', '11'],
            [
              'Chip de filtre à gravité',
              <Tok key="4">ToolbarFilterChip</Tok>,
              'panneau',
              'remplace les raccourcis en rangée',
            ],
            ['Recherche', <Tok key="5">ToolbarSearch</Tok>, '03', '10'],
            ['Compteur filtré', <Tok key="6">ToolbarMetric</Tok>, '04', '9'],
            ['Fraîcheur de la donnée', <Tok key="7">ToolbarMetric</Tok>, '04', '4'],
            ['Actualiser', <Tok key="8">ToolbarRefresh</Tok>, '04', '10'],
            ['Action primaire', <Tok key="9">Pill</Tok>, '04', '4'],
            ['Impression', <Tok key="10">data-print-keep</Tok>, '—', '12 (structurel)'],
          ]}
        />
      </Panel>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Tout ce qui filtre descend sous le déclencheur « Filtres ». La rangée ne garde que la
          portée, la recherche et l'état — cinq contrôles au plus.
        </Rule>
        <Rule kind="dont">
          Sortir un filtre du panneau parce qu'il est « important ». Le compteur du déclencheur dit
          déjà qu'il y en a ; le panneau dit lesquels. Deux endroits pour un même réglage, c'est
          deux endroits à tenir d'accord.
        </Rule>
        <Rule kind="do">
          Laisser les chips du panneau porter leur gravité : un point coloré et un volume. C'est ce
          qui rend le clic d'ouverture rentable.
        </Rule>
        <Rule kind="dont">
          Afficher une durée de chargement en permanence. « 320 ms » est un instrument de
          développeur — personne ne décide de rien avec. Ce qui se décide, c'est de QUAND date ce
          qu'on lit : une heure. La durée reste au survol, et pendant le chargement où elle dit que
          ça travaille encore.
        </Rule>
        <Rule kind="dont">
          Compter deux fois. Un volume affiché à la fois dans le masthead et dans la rangée, c'est
          le même nombre dans deux formats — et celui du masthead devient faux dès qu'un filtre est
          posé. Le volume appartient là où on le fait varier.
        </Rule>
        <Rule kind="dont">
          Passer la barre en <Tok>children</Tok> d'AppLayout. La prop <Tok>toolbar</Tok> existe et
          porte déjà le filet, le fond et la règle d'impression — 16 pages sur 17 la contournent et
          réimplémentent son conteneur.
        </Rule>
      </div>

      <Sub
        title="État des lieux"
        hint="Ce que l’inventaire des 17 pages a trouvé. C’est ce qui justifie chaque règle ci-dessus."
        className="mt-8"
      />
      <Panel padding="none">
        <SpecTable
          head={['Divergence', 'Mesure', 'Où']}
          rows={[
            [
              'Deux familles de primitives concurrentes',
              '14 pages vision/toolbar · 1 page ui/toolbar',
              <span key="a">
                <Tok>dashboard.tsx</Tok> importe les deux et les mélange dans la même rangée
              </span>,
            ],
            [
              'La prop toolbar d’AppLayout est contournée',
              '1 usage sur 17 pages',
              <span key="b">
                seul <Tok>react_lab.tsx:171</Tok> — et il y gagne deux bordures imbriquées
              </span>,
            ],
            [
              'Paddings du conteneur',
              '3 valeurs : px-4, px-5, px-7',
              'aucune n’est le px-6 du TopBar',
            ],
            [
              'Champ de recherche recopié à la main',
              '9 copies · 6 largeurs (160/180/190/200/220 px)',
              'alors que ToolbarSearch existe et ne sert qu’une fois',
            ],
            [
              'Mécanismes d’« actualiser »',
              '4',
              'RefreshPill · ToolbarRefresh · 2 boutons faits main',
            ],
            [
              'Déclencheur de filtres',
              '2 implémentations d’accessibilité',
              <span key="c">
                <Tok>&lt;details&gt;</Tok> (vision) contre Popover Base UI (suivi)
              </span>,
            ],
            [
              'Ordre gauche→droite non respecté',
              '5 pages',
              'fenêtre avant la bascule de vue, actions avant la recherche',
            ],
            [
              'Deuxième rangée improvisée',
              '2 pages',
              'expeditions et receptions, en py-1.5 sous un py-2',
            ],
            [
              'Focus visible absent',
              'toute la famille vision/toolbar',
              'la plus utilisée (14 pages) est celle qui n’a aucun style de focus',
            ],
            [
              'Tokens de filet différents',
              '2',
              <span key="d">
                <Tok>border-rule</Tok> (vision) contre <Tok>border-border</Tok> (ui)
              </span>,
            ],
          ]}
        />
      </Panel>

      <div className="mt-4">
        <Caption className="mb-2">Ce que la validation engage</Caption>
        <p className="max-w-[620px] text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
          Les cinq primitives manquantes sont écrites et rendues ci-dessus : la proposition est
          testable, pas théorique. Valider signifie ensuite migrer les 14 pages{' '}
          <Tok>vision/toolbar</Tok> vers <Tok>ui/toolbar</Tok>, supprimer{' '}
          <Tok>components/vision/toolbar.tsx</Tok>, et faire passer les barres par la prop{' '}
          <Tok>toolbar</Tok> d'AppLayout. À faire page par page, pas d'un bloc.
        </p>
      </div>
    </Section>
  )
}
