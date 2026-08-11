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
  ToolbarStat,
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
            {[
              ['blocked', 'Bloquée'],
              ['uncov', 'Sans couverture'],
              ['late', 'Retard'],
            ].map(([k, l]) => (
              <ToolbarSegment
                key={k}
                active={verdict === k}
                onClick={() => setVerdict(verdict === k ? null : k)}
              >
                {l}
              </ToolbarSegment>
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

        <ToolbarStat
          count={174}
          label="bloquées"
          tone="critical"
          active={verdict === 'blocked'}
          onClick={() => setVerdict(verdict === 'blocked' ? null : 'blocked')}
        />
        <ToolbarStat
          count={40}
          label="sans couverture"
          tone="critical"
          active={verdict === 'uncov'}
          onClick={() => setVerdict(verdict === 'uncov' ? null : 'uncov')}
        />
        <ToolbarStat
          count={5}
          label="en retard"
          tone="warning"
          active={verdict === 'late'}
          onClick={() => setVerdict(verdict === 'late' ? null : 'late')}
        />
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarSearch value={q} onChange={setQ} placeholder="Commande, article, composant…" />
      <ToolbarMetric emphasis>
        12 <span className="font-normal text-muted-foreground">/ 675</span>
      </ToolbarMetric>
      <ToolbarMetric title="Durée du dernier chargement X3">320ms</ToolbarMetric>
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
        <ToolbarFilterMenu activeCount={1}>
          <ToolbarFilterSection>Regroupement</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full">
            <ToolbarSegment active>Jour</ToolbarSegment>
            <ToolbarSegment>Fournisseur</ToolbarSegment>
          </ToolbarSegmented>
        </ToolbarFilterMenu>
        <ToolbarStat count={9} label="critiques" tone="critical" onClick={() => {}} />
      </ToolbarGroup>
      <ToolbarSpacer />
      <ToolbarSearch value={q} onChange={setQ} placeholder="Article, fournisseur…" />
      <ToolbarMetric title="Durée du dernier chargement X3">1.2s</ToolbarMetric>
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
            role="Un déclencheur unique portant le nombre de filtres actifs, puis les raccourcis de gravité non vides (trois au plus)."
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
            La rangée canonique avec les dix rôles inventoriés. Tout est vivant : le calendrier
            s'ouvre, les filtres comptent, les raccourcis filtrent, le rafraîchissement tourne.
          </>
        }
      >
        <Demo spec="Toolbar › ToolbarGroup(ToolbarSegmented · ToolbarDateWindow · ToolbarFilterMenu · ToolbarStat×3) › ToolbarSpacer › ToolbarSearch · ToolbarMetric×2 · ToolbarRefresh">
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
              'Dégradation en largeur',
              'aucune règle',
              'sous 1440 px, les raccourcis de gravité se replient',
              'ils sont déjà dans le panneau de filtres — replier ne perd rien',
            ],
          ]}
        />
      </Panel>
      <p className="mb-4 max-w-[620px] text-[13px] leading-[18px] text-[color-mix(in_oklab,#141414_74%,transparent)]">
        La rangée canonique ci-dessus déborde volontairement sa cellule de démonstration : dix rôles
        ne tiennent pas dans 1 000 px. C'est la contrainte réelle, pas un défaut de la vitrine — et
        c'est ce qui fait de la règle de dégradation une partie du standard, pas un correctif
        d'après-coup. Une barre ne s'enroule jamais sur deux lignes : elle abandonne des rôles, dans
        un ordre décidé à l'avance.
      </p>

      <Sub
        title="Les dix rôles"
        hint="Inventoriés sur les 17 pages. Un rôle = un composant = une zone. Rien d’autre n’entre dans la rangée."
      />
      <Panel padding="none" className="mb-4">
        <SpecTable
          head={['Rôle', 'Composant', 'Zone', 'Pages concernées']}
          rows={[
            ['Bascule de vue', <Tok key="1">ToolbarSegmented</Tok>, '01', '9'],
            ['Fenêtre de dates', <Tok key="2">ToolbarDateWindow</Tok>, '01', '5'],
            ['Filtres secondaires', <Tok key="3">ToolbarFilterMenu</Tok>, '02', '11'],
            ['Raccourcis de gravité', <Tok key="4">ToolbarStat</Tok>, '02', '1 (à généraliser)'],
            ['Recherche', <Tok key="5">ToolbarSearch</Tok>, '03', '10'],
            ['Compteur filtré', <Tok key="6">ToolbarMetric</Tok>, '04', '9'],
            ['Fraîcheur du chargement', <Tok key="7">ToolbarMetric</Tok>, '04', '4'],
            ['Actualiser', <Tok key="8">ToolbarRefresh</Tok>, '04', '10'],
            ['Action primaire', <Tok key="9">Pill</Tok>, '04', '4'],
            ['Impression', <Tok key="10">data-print-keep</Tok>, '—', '12 (structurel)'],
          ]}
        />
      </Panel>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Rule kind="do">
          Une seule rangée. Les contrôles propres à une sous-vue descendent dans la vue, pas dans
          une deuxième bande — deux rangées, c'est deux paddings verticaux qui divergent le jour
          même.
        </Rule>
        <Rule kind="dont">
          Empiler des segmented controls permanents dans la rangée. Au-delà de deux, tout ce qui
          n'est ni la portée ni la recherche va derrière le déclencheur de filtres.
        </Rule>
        <Rule kind="do">
          Remonter dans la rangée les compteurs qui décident du scan, mais seulement les paliers non
          vides et jamais plus de trois.
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
